/**
 * DualView - Main Process
 * Version: 0.4.5
 *
 * Changements v0.4.5 :
 * - Refactoring open source : extraction de 4 modules depuis main.js
 *   → core/config-manager.js  : constantes, loadConfig/saveConfig, configGet/configSet
 *   → core/url-guard.js       : sanitizeUrl, isLoginPage, isAuthUrl, detectServiceKeyFromUrl
 *   → core/session-security.js: bloqueur pub réseau, setupSessionSecurity
 *   → core/context-menu.js    : buildAndShowContextMenu (menu clic droit natif)
 *   main.js conserve : état global, fenêtres, IPC handlers, lifecycle app.
 *
 * Changements v0.4.3 :
 * - Protocole vidéo séquencé anti-boucle :
 *   PAUSE  → ① video-cmd{pause}   ② video-cmd{seek-to}  [+50ms]
 *   PLAY   → ① video-cmd{seek-to} ② video-cmd{play}     [+100ms]
 *   DRIFT  → video-cmd{drift-check} (portrait corrige seulement si paused)
 *   Nouveau canal IPC : 'video-drift-check' (remplace 'video-timeupdate')
 *   Suppression du forçage currentTime dans play → élimine la boucle portrait.
 *
 * Changements v0.4.1 :
 * - Menu contextuel natif sur clic droit dans les webviews (paysage)
 * - Boutons souris 3/4 (Retour/Avance) capturés via before-input-event.
 *
 * Changements v0.3.2 :
 * - Intégration OBS (Méthode 1 + Méthode 3)
 */

'use strict';

const { app, BrowserWindow, ipcMain, nativeTheme, screen, session, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Modules core ──────────────────────────────────────────────────────────────
// Tous les modules métier sont dans src/core/ (même dossier que main.js/core/)
const logger          = require('./core/logger');
const obsControl      = require('./core/obs-control');
const HistoryManager  = require('./core/history-manager');
const {
    authWindowEvents,
    checkAllServicesStatus,
    disconnectService,
    openAuthWindow,
} = require('./core/auth-window');

const {
    KNACK3_URL, SETTINGS_DEFAULTS, PORTRAIT_PRESETS, DEFAULTS,
    configGet, configSet,
} = require('./core/config-manager');

const { sanitizeUrl, isAuthUrl, isLoginPage, detectServiceKeyFromUrl } = require('./core/url-guard');
const { setupSessionSecurity }      = require('./core/session-security');
const { buildAndShowContextMenu }   = require('./core/context-menu');

// ── Mode dev ──────────────────────────────────────────────────────────────────
// Activer avec : npm start -- --dev
// Logs dans %AppData%/DualView/dualview.log
logger.init();
logger.setupIpc();

// ── Historique de navigation (v0.4.0) ─────────────────────────────────────────
// app.getPath est disponible avant app.whenReady() sur Electron moderne.
const history = new HistoryManager(app.getPath('userData'));

// ── Icône cross-platform ──────────────────────────────────────────────────────
function getAppIcon() {
    if (process.platform === 'darwin') return path.join(__dirname, '..', 'assets', 'icon.icns');
    if (process.platform === 'linux')  return path.join(__dirname, '..', 'assets', 'icon.png');
    return path.join(__dirname, '..', 'assets', 'icon.ico'); // win32
}

// ── État global ───────────────────────────────────────────────────────────────
let tabUrls      = new Map();
let activeTabId  = null;
let syncState    = 'paused';    // 'active' | 'paused' — démarre en pause, activé après 3 s
let syncStartTimer = null;
let landscapeWin = null;
let portraitWin  = null;
let obsTabs      = [];          // [{ id, title, url }] — état onglets pour le dock OBS
let loginPageTabId = null;      // onglet pour lequel l'overlay login est actif (null = masqué)
let resizeMode   = false;

// Flag : chemin de sauvegarde positionné par "Enregistrer l'image sous…"
// avant downloadURL() pour que will-download laisse passer ce seul téléchargement.
let _pendingImageSavePath = null;

// ── Helpers thème ─────────────────────────────────────────────────────────────
function getTheme() {
    const appearance = configGet('settings.appearance') || 'auto';
    if (appearance === 'light') return 'light';
    if (appearance === 'dark')  return 'dark';
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function applyAppearance() {
    const appearance = configGet('settings.appearance') || 'auto';
    nativeTheme.themeSource = appearance === 'auto' ? 'system' : appearance;
}

function broadcastTheme() {
    const theme = getTheme();
    [landscapeWin, portraitWin].forEach(win => {
        if (win && !win.isDestroyed()) win.webContents.send('theme-changed', theme);
    });
}

function getHomepageUrl() {
    const mode = configGet('settings.homepageMode') || 'knack3';
    if (mode === 'knack3') return KNACK3_URL;
    if (mode === 'custom') return configGet('settings.customHomepageUrl') || KNACK3_URL;
    return '';
}

// ── Helpers synchronisation ───────────────────────────────────────────────────
function broadcastSyncState() {
    [landscapeWin, portraitWin].forEach(win => {
        if (win && !win.isDestroyed()) win.webContents.send('sync-state-changed', syncState);
    });
}

/**
 * Démarre le minuteur de démarrage différé de la synchronisation (3 s).
 * Appelé une fois les deux fenêtres prêtes.
 */
function scheduleSyncStart() {
    if (syncStartTimer) return;
    syncStartTimer = setTimeout(() => {
        syncState = 'active';
        broadcastSyncState();
        syncStartTimer = null;
    }, 3000);
}

// ── Intégration OBS (v0.3.2) ──────────────────────────────────────────────────

/**
 * Pousse l'état courant vers le dock OBS.
 * Sans effet si le serveur OBS n'est pas démarré.
 */
function pushObsStatus() {
    try {
        obsControl.updateStatus({
            sync:        syncState,
            activeTabId: activeTabId,
            url:         activeTabId ? (tabUrls.get(activeTabId) || '') : '',
            tabs:        obsTabs,
        });
    } catch { /* serveur OBS inactif : ignoré */ }
}

/**
 * Traduit une commande OBS (dock ou hotkey) en action DualView.
 * Réutilise exactement les mêmes chemins que l'UI native.
 */
function handleObsCommand(action, payload) {
    const ls = landscapeWin && !landscapeWin.isDestroyed() ? landscapeWin : null;
    switch (action) {
        case 'sync-pause':   applySyncAction('pause');   break;
        case 'sync-resume':  applySyncAction('resume');  break;
        case 'sync-restart': applySyncAction('restart'); break;
        case 'nav-back':
        case 'nav-forward':
        case 'nav-reload':
        case 'nav-home':
        case 'tab-new':
        case 'tab-close':
        case 'tab-switch':
        case 'navigate':
            if (ls) ls.webContents.send('obs-command', { action, payload: payload || {} });
            break;
        default: break;
    }
}

/**
 * Logique de contrôle sync partagée entre l'IPC 'sync-control' et les commandes OBS.
 */
function applySyncAction(action) {
    if (!['pause', 'resume', 'restart'].includes(action)) return;
    if (action === 'pause') {
        syncState = 'paused';
        broadcastSyncState();
    } else if (action === 'resume') {
        syncState = 'active';
        broadcastSyncState();
        if (activeTabId && portraitWin && !portraitWin.isDestroyed()) {
            const url = tabUrls.get(activeTabId) || '';
            if (url && !isAuthUrl(url)) portraitWin.webContents.send('sync-resume-state', { tabId: activeTabId, url });
        }
    } else if (action === 'restart') {
        syncState = 'paused';
        broadcastSyncState();
        setTimeout(() => {
            syncState = 'active';
            broadcastSyncState();
            if (activeTabId && portraitWin && !portraitWin.isDestroyed()) {
                const url = tabUrls.get(activeTabId) || '';
                if (url && !isAuthUrl(url)) portraitWin.webContents.send('sync-resume-state', { tabId: activeTabId, url });
            }
        }, 500);
    }
}

/**
 * Démarre le serveur de contrôle OBS si activé dans les paramètres.
 * Non bloquant : un échec n'empêche jamais DualView de fonctionner.
 */
async function startObsServerIfEnabled() {
    const enabled = configGet('settings.obsEnabled');
    if (enabled === false) {
        logger.log('obs', 'LOG', ['Intégration OBS désactivée (paramètres).']);
        return;
    }
    const port = configGet('settings.obsPort') || 0;
    const info = await obsControl.start({
        port,
        dockHtmlPath: path.join(__dirname, 'renderer', 'obs-dock.html'),
        onCommand:    handleObsCommand,
        logFn:        (src, lvl, args) => logger.log(src, lvl, args),
    });
    if (info) {
        logger.log('obs', 'LOG', [`Dock OBS : http://127.0.0.1:${info.port}/dock`]);
        pushObsStatus();
    }
}

// ── Création des fenêtres ─────────────────────────────────────────────────────
function createLandscapeWindow() {
    const saved  = configGet('landscapeWindow');
    const { height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = saved.width  || 1280;
    const h = saved.height || 720;
    const x = saved.x !== null ? saved.x : 20;
    const y = saved.y !== null ? saved.y : Math.floor((sh - h) / 2);

    landscapeWin = new BrowserWindow({
        width: w, height: h, x, y,
        minWidth: 700, minHeight: 480,
        title: 'DualView - Paysage',
        icon:  getAppIcon(),
        webPreferences: {
            nodeIntegration:    false,
            contextIsolation:   true,
            preload:            path.join(__dirname, 'preload', 'preload-landscape.js'),
            webviewTag:         true,
            additionalArguments: [
                `--initial-theme=${getTheme()}`,
                ...(logger.IS_DEV ? ['--dev-source=landscape'] : []),
            ],
        },
        autoHideMenuBar: true,
        resizable:       true,
        show:            false,
        backgroundColor: getTheme() === 'dark' ? '#1e1e1e' : '#f0f0f0',
    });

    landscapeWin.loadFile(path.join(__dirname, 'renderer', 'landscape.html'));
    landscapeWin.webContents.setMaxListeners(50);

    if (logger.IS_DEV) {
        landscapeWin.webContents.session.registerPreloadScript({
            id:       'dev-preload-landscape',
            type:     'frame',
            filePath: path.join(__dirname, 'preload', 'preload-dev.js'),
        });
    }

    landscapeWin.once('ready-to-show', () => {
        landscapeWin.show();
        tryScheduleSyncStart();
    });
    landscapeWin.on('moved',  () => { const [x, y] = landscapeWin.getPosition(); configSet('landscapeWindow.x', x); configSet('landscapeWindow.y', y); });
    landscapeWin.on('resize', () => { const [w, h] = landscapeWin.getSize();     configSet('landscapeWindow.width', w); configSet('landscapeWindow.height', h); });
    landscapeWin.on('closed', () => app.quit());

    // ── Boutons souris Retour/Avance (v0.4.1) ────────────────────────────────
    landscapeWin.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'mouseDown') return;
        if (input.button === 'back') {
            event.preventDefault();
            landscapeWin.webContents.send('mouse-nav', 'back');
        } else if (input.button === 'forward') {
            event.preventDefault();
            landscapeWin.webContents.send('mouse-nav', 'forward');
        }
    });

    // ── Interception ouvertures de fenêtre + menu contextuel (v0.4.1) ────────
    landscapeWin.webContents.on('did-attach-webview', (_event, wvContents) => {
        wvContents.setWindowOpenHandler(({ url }) => {
            if (!url || url === 'about:blank') return { action: 'deny' };
            try {
                const parsed = new URL(url);
                if (!['http:', 'https:'].includes(parsed.protocol)) return { action: 'deny' };
            } catch { return { action: 'deny' }; }
            landscapeWin.webContents.send('context-menu-action', { action: 'open-link-new-tab', url });
            return { action: 'deny' };
        });

        wvContents.on('context-menu', (_e, params) => {
            buildAndShowContextMenu(params, wvContents, {
                getLandscapeWin:        () => landscapeWin,
                configGet,
                setPendingImageSavePath: p => { _pendingImageSavePath = p; },
            });
        });
    });
}

function createPortraitWindow() {
    const saved  = configGet('portraitWindow');
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = saved.width  || 390;
    const h = saved.height || 844;
    const x = saved.x !== null ? saved.x : sw - w - 20;
    const y = saved.y !== null ? saved.y : Math.floor((sh - h) / 2);

    portraitWin = new BrowserWindow({
        width: w, height: h, x, y,
        title: 'DualView - Portrait',
        icon:  getAppIcon(),
        resizable: false,
        webPreferences: {
            nodeIntegration:    false,
            contextIsolation:   true,
            preload:            path.join(__dirname, 'preload', 'preload-view.js'),
            webviewTag:         true,
            additionalArguments: [
                `--initial-theme=${getTheme()}`,
                ...(logger.IS_DEV ? ['--dev-source=portrait'] : []),
            ],
        },
        autoHideMenuBar: true,
        show:            false,
        backgroundColor: getTheme() === 'dark' ? '#1a1a1a' : '#f8f8f8',
    });

    portraitWin.loadFile(path.join(__dirname, 'renderer', 'portrait.html'));
    portraitWin.webContents.setMaxListeners(50);

    if (logger.IS_DEV) {
        portraitWin.webContents.session.registerPreloadScript({
            id:       'dev-preload-portrait',
            type:     'frame',
            filePath: path.join(__dirname, 'preload', 'preload-dev.js'),
        });
    }

    portraitWin.once('ready-to-show', () => {
        if (landscapeWin && !landscapeWin.isDestroyed() && landscapeWin.isVisible()) {
            portraitWin.show();
        } else {
            landscapeWin.once('show', () => portraitWin.show());
        }
        tryScheduleSyncStart();
    });
    portraitWin.on('moved',  () => { const [x, y] = portraitWin.getPosition(); configSet('portraitWindow.x', x); configSet('portraitWindow.y', y); });
    portraitWin.on('closed', () => { portraitWin = null; });
}

let _landscapeReady = false;
let _portraitReady  = false;
function tryScheduleSyncStart() {
    if (landscapeWin && !landscapeWin.isDestroyed()) _landscapeReady = true;
    if (portraitWin  && !portraitWin.isDestroyed())  _portraitReady  = true;
    if (_landscapeReady && _portraitReady) scheduleSyncStart();
}

// ── Auth success handler ───────────────────────────────────────────────────────
authWindowEvents.on('auth-success', ({ serviceKey, serviceLabel }) => {
    logger.log('auth', 'LOG', [`Auth réussie : ${serviceLabel} (${serviceKey})`]);
    if (!activeTabId || !portraitWin || portraitWin.isDestroyed()) return;
    const url = tabUrls.get(activeTabId) || '';
    logger.log('auth', 'LOG', [`Rechargement portrait — onglet actif: ${activeTabId}, url: ${url}`]);
    if (!url || isAuthUrl(url)) return;
    portraitWin.webContents.send('reload-webview');
});

// ── Helpers login page ────────────────────────────────────────────────────────
function broadcastLoginPageCleared() {
    loginPageTabId = null;
    if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('login-page-cleared');
    if (portraitWin  && !portraitWin.isDestroyed())  portraitWin.webContents.send('login-page-cleared');
}

// ═════════════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ═════════════════════════════════════════════════════════════════════════════

// ── Synchronisation ───────────────────────────────────────────────────────────
ipcMain.on('sync-control', (event, action) => {
    applySyncAction(action);
    pushObsStatus();
});

// ── Navigation ────────────────────────────────────────────────────────────────
ipcMain.on('navigate', (event, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    if (activeTabId) tabUrls.set(activeTabId, safe);
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('load-url', safe);
    if (syncState === 'active' && !isAuthUrl(safe) && portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('load-url', { tabId: activeTabId, url: safe });
    pushObsStatus();
});

ipcMain.on('sync-scroll', (event, pct) => {
    if (typeof pct !== 'number' || syncState !== 'active') return;
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('apply-scroll', pct);
});

ipcMain.on('sync-navigate', (event, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    if (activeTabId) tabUrls.set(activeTabId, safe);
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('update-addressbar', safe);
    if (syncState === 'active' && !isAuthUrl(safe) && portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('load-url', { tabId: activeTabId, url: safe });
    pushObsStatus();
});

// ── Historique (v0.4.0) ───────────────────────────────────────────────────────
ipcMain.on('history-add', (event, { url, title, tabId }) => {
    if (history) history.add({ url, title, tabId });
});
ipcMain.handle('history-get-all',   ()               => history ? history.getAll()                    : []);
ipcMain.handle('history-get-by-tab', (event, { tabId, limit }) => history ? history.getByTab(tabId, limit || 10) : []);
ipcMain.handle('history-search',    (event, { query, limit }) => history ? history.search(query, limit || 100)   : []);
ipcMain.on('history-delete-url',    (event, { url })  => { if (history) history.deleteUrl(url); });
ipcMain.on('history-clear-all',     ()                => { if (history) history.clearAll(); });
ipcMain.on('history-clear-tab',     (event, { tabId }) => { if (history) history.clearTab(tabId); });

// ── Onglets ───────────────────────────────────────────────────────────────────
ipcMain.on('tab-switched', (event, tabId) => {
    if (typeof tabId !== 'string') return;
    const SETTINGS_TAB_ID = '__settings__';
    // Ne pas écraser activeTabId avec l'ID de l'onglet paramètres
    if (tabId !== SETTINGS_TAB_ID) activeTabId = tabId;
    if (loginPageTabId && loginPageTabId !== tabId) broadcastLoginPageCleared();
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('tab-switched', tabId);
    pushObsStatus();
});

ipcMain.on('tab-closed', (event, tabId) => {
    if (typeof tabId !== 'string') return;
    tabUrls.delete(tabId);
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('tab-closed', tabId);
});

ipcMain.on('tab-created', (event, { tabId, url }) => {
    if (typeof tabId !== 'string') return;
    const safe = url ? sanitizeUrl(url) : null;
    if (safe) tabUrls.set(tabId, safe);
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('tab-created', { tabId, url: safe || '' });
});

// ── Navigation back/forward ───────────────────────────────────────────────────
ipcMain.on('notify-nav-state', (event, state) => {
    if (!state || typeof state !== 'object') return;
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('nav-state-changed', state);
});

ipcMain.on('nav-back', () => {
    if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('webview-go-back');
    if (syncState === 'active' && portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('webview-go-back');
});

ipcMain.on('nav-forward', () => {
    if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('webview-go-forward');
    if (syncState === 'active' && portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('webview-go-forward');
});

ipcMain.on('reload-views', () => {
    if (syncState === 'active' && portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('reload-webview');
});

ipcMain.on('relaunch-app', () => { app.relaunch(); app.exit(0); });

// ── Vidéo sync (v0.4.3 — séquençage strict) ──────────────────────────────────
//
// PAUSE  → ① pause()           ② seek-to(t) [+50 ms]
// PLAY   → ① seek-to(t)        ② play()     [+100 ms]
// DRIFT  → seek-to(t) SEULEMENT si vidéo portrait est à l'arrêt

ipcMain.on('video-pause', (e, t) => {
    if (syncState !== 'active') return;
    const p = portraitWin;
    if (!p || p.isDestroyed()) return;
    p.webContents.send('video-cmd', { action: 'pause',   currentTime: t });
    setTimeout(() => { if (!p.isDestroyed()) p.webContents.send('video-cmd', { action: 'seek-to', currentTime: t }); }, 50);
});

ipcMain.on('video-play', (e, t) => {
    if (syncState !== 'active') return;
    const p = portraitWin;
    if (!p || p.isDestroyed()) return;
    p.webContents.send('video-cmd', { action: 'seek-to', currentTime: t });
    setTimeout(() => { if (!p.isDestroyed()) p.webContents.send('video-cmd', { action: 'play',    currentTime: t }); }, 100);
});

ipcMain.on('video-drift-check', (e, t) => {
    if (syncState !== 'active') return;
    const p = portraitWin;
    if (!p || p.isDestroyed()) return;
    p.webContents.send('video-cmd', { action: 'drift-check', currentTime: t });
});

// ── Pub YouTube (overlay portrait) ───────────────────────────────────────────
ipcMain.on('ad-state', (e, payload) => {
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('ad-state', payload);
});

// ── Redimensionnement portrait (bouton ↔/✅ dans landscape) ──────────────────
ipcMain.on('sync-pause', () => {
    if (portraitWin && !portraitWin.isDestroyed()) {
        portraitWin.setResizable(true);
        portraitWin.webContents.send('resize-mode', true);
    }
});

ipcMain.on('sync-resume', () => {
    if (portraitWin && !portraitWin.isDestroyed()) {
        portraitWin.setResizable(false);
        portraitWin.webContents.send('resize-mode', false);
        const [w, h] = portraitWin.getSize();
        configSet('portraitWindow.width', w);
        configSet('portraitWindow.height', h);
        if (activeTabId && syncState === 'active') {
            const url = tabUrls.get(activeTabId) || '';
            if (url) portraitWin.webContents.send('load-url', { tabId: activeTabId, url });
        }
    }
});

// ── Détection page de connexion ───────────────────────────────────────────────
ipcMain.on('login-page-detected', (event, { url, tabId }) => {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    loginPageTabId = tabId;
    logger.log('main', 'LOG', [`Login détecté: ${safe} (tab: ${tabId})`]);
    const serviceKey = detectServiceKeyFromUrl(safe);
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('show-login-popup', { url: safe, tabId, serviceKey });
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('show-login-popup', { url: safe, tabId, serviceKey });
});

ipcMain.on('login-page-left', (event, { tabId }) => {
    if (loginPageTabId === tabId) broadcastLoginPageCleared();
});

// ── Services connectés ────────────────────────────────────────────────────────
ipcMain.handle('get-connected-services-status', async () => {
    const knownStatus   = await checkAllServicesStatus();
    const customServices = configGet('settings.customServices') || [];
    return { known: knownStatus, custom: customServices };
});

ipcMain.handle('open-auth-window', async (event, { serviceKey, customUrl, customLabel }) => {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    try {
        const success = await openAuthWindow({ serviceKey, customUrl, customLabel, parentWin });
        if (success && serviceKey === 'custom') {
            const customServices = configGet('settings.customServices') || [];
            const existing = customServices.find(s => s.url === customUrl);
            if (existing) {
                existing.connected = true;
            } else {
                customServices.push({ id: Date.now().toString(), label: customLabel, url: customUrl, connected: true });
            }
            configSet('settings.customServices', customServices);
        }
        return { success };
    } catch (e) {
        console.warn('open-auth-window error:', e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('disconnect-service', async (event, { serviceKey, customUrl }) => {
    const ok = await disconnectService(serviceKey, customUrl);
    if (ok && serviceKey === 'custom' && customUrl) {
        const customServices = configGet('settings.customServices') || [];
        const svc = customServices.find(s => s.url === customUrl);
        if (svc) svc.connected = false;
        configSet('settings.customServices', customServices);
    }
    return { success: ok };
});

ipcMain.handle('delete-custom-service', async (event, { serviceId }) => {
    const customServices = configGet('settings.customServices') || [];
    configSet('settings.customServices', customServices.filter(s => s.id !== serviceId));
    return { success: true };
});

ipcMain.on('auth-custom-confirmed', () => { /* relayé par auth-window.js via ipcMain.once */ });
ipcMain.on('auth-custom-cancelled', () => { });

// ── Divers ────────────────────────────────────────────────────────────────────
ipcMain.handle('get-theme',       () => getTheme());
ipcMain.handle('get-is-dev',      () => logger.IS_DEV);
ipcMain.handle('get-version',     () => app.getVersion());
ipcMain.handle('get-homepage-url',() => getHomepageUrl());
ipcMain.handle('get-sync-state',  () => syncState);

ipcMain.on('toggle-dev-tools', () => {
    if (!logger.IS_DEV || !landscapeWin || landscapeWin.isDestroyed()) return;
    if (landscapeWin.webContents.isDevToolsOpened()) {
        landscapeWin.webContents.closeDevTools();
    } else {
        landscapeWin.webContents.openDevTools({ mode: 'detach' });
    }
});

// ── Config / store ────────────────────────────────────────────────────────────
ipcMain.handle('get-store', () => ({
    tabs:        configGet('tabs')        || DEFAULTS.tabs,
    activeTabId: configGet('activeTabId') || DEFAULTS.activeTabId,
    settings:    configGet('settings')    || Object.assign({}, SETTINGS_DEFAULTS),
}));

ipcMain.handle('get-auto-mute-portrait', () => {
    const settings = configGet('settings') || {};
    return settings.autoMutePortrait !== false; // défaut true
});

ipcMain.on('save-tabs', (event, data) => {
    if (!data || !Array.isArray(data.tabs)) return;
    configSet('tabs', data.tabs);
    configSet('activeTabId', data.activeTabId || data.tabs[0].id);
    for (const tab of data.tabs) {
        if (tab.url) tabUrls.set(tab.id, tab.url);
    }
    if (data.activeTabId) activeTabId = data.activeTabId;
    obsTabs = data.tabs.map(t => ({ id: t.id, title: t.title || '', url: t.url || '' }));
    pushObsStatus();
});

ipcMain.on('save-settings', (event, settings) => {
    if (!settings || typeof settings !== 'object') return;
    const allowed = {
        restoreTabs:        v => typeof v === 'boolean',
        homepageMode:       v => ['knack3', 'custom', 'empty'].includes(v),
        customHomepageUrl:  v => typeof v === 'string' && (v === '' || sanitizeUrl(v) !== null),
        newTabMode:         v => ['homepage', 'empty'].includes(v),
        appearance:         v => ['auto', 'light', 'dark'].includes(v),
        language:           v => ['fr', 'en'].includes(v),
        obsEnabled:         v => typeof v === 'boolean',
        obsPort:            v => Number.isInteger(v) && v >= 0 && v <= 65535,
        searchEngineId:     v => typeof v === 'string' && v.length > 0,
        searchEngineUrl:    v => typeof v === 'string' && v.startsWith('http'),
        searchEngineName:   v => typeof v === 'string',
        customSearchEngines:v => Array.isArray(v),
        screenshotDir:      v => typeof v === 'string',
        portraitPreset:     v => typeof v === 'string',
        autoMutePortrait:   v => typeof v === 'boolean',
    };
    const current        = configGet('settings') || Object.assign({}, SETTINGS_DEFAULTS);
    const prevObsEnabled = current.obsEnabled;
    const prevObsPort    = current.obsPort;
    for (const key of Object.keys(allowed)) {
        if (settings[key] !== undefined && allowed[key](settings[key]))
            current[key] = settings[key];
    }
    configSet('settings', current);
    applyAppearance();
    broadcastTheme();
    if (settings.autoMutePortrait !== undefined && portraitWin && !portraitWin.isDestroyed()) {
        portraitWin.webContents.send('auto-mute-portrait-changed', current.autoMutePortrait);
    }
    if (current.obsEnabled !== prevObsEnabled || current.obsPort !== prevObsPort) {
        obsControl.stop();
        if (current.obsEnabled !== false) startObsServerIfEnabled();
    }
});

// ── OBS infos ─────────────────────────────────────────────────────────────────
ipcMain.handle('get-obs-info', () => {
    const info = obsControl.getInfo();
    return {
        enabled: configGet('settings.obsEnabled') !== false,
        running: !!info,
        port:    info ? info.port  : (configGet('settings.obsPort') || 0),
        token:   info ? info.token : '',
        dockUrl: info ? `http://127.0.0.1:${info.port}/dock?token=${info.token}` : '',
    };
});

// ── Redimensionnement portrait (modale v0.4.0) ────────────────────────────────
ipcMain.handle('get-portrait-presets', () => PORTRAIT_PRESETS);

ipcMain.on('start-portrait-resize', () => {
    if (!portraitWin || portraitWin.isDestroyed()) return;
    resizeMode = true;
    portraitWin.setResizable(true);
    portraitWin.webContents.send('resize-mode', true);
    applySyncAction('pause');
});

ipcMain.on('apply-portrait-preset', (event, { presetId }) => {
    if (!portraitWin || portraitWin.isDestroyed()) return;
    const preset = PORTRAIT_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    configSet('settings.portraitPreset', presetId);
    portraitWin.setResizable(true);
    portraitWin.setSize(preset.width, preset.height);
    configSet('portraitWindow.width',  preset.width);
    configSet('portraitWindow.height', preset.height);
});

ipcMain.on('finish-portrait-resize', () => {
    if (!portraitWin || portraitWin.isDestroyed()) return;
    resizeMode = false;
    const [w, h] = portraitWin.getSize();
    configSet('portraitWindow.width', w);
    configSet('portraitWindow.height', h);
    portraitWin.setResizable(false);
    portraitWin.webContents.send('resize-mode', false);
    applySyncAction('resume');
});

ipcMain.on('cancel-portrait-resize', () => {
    if (!portraitWin || portraitWin.isDestroyed()) return;
    resizeMode = false;
    const savedW = configGet('portraitWindow.width')  || 390;
    const savedH = configGet('portraitWindow.height') || 844;
    portraitWin.setResizable(true);
    portraitWin.setSize(savedW, savedH);
    portraitWin.setResizable(false);
    portraitWin.webContents.send('resize-mode', false);
});

// ── Screenshot (v0.4.0) ───────────────────────────────────────────────────────
ipcMain.handle('take-screenshot', async () => {
    try {
        let dir = configGet('settings.screenshotDir') || '';
        if (!dir) dir = path.join(app.getPath('pictures'), 'DualView');
        fs.mkdirSync(dir, { recursive: true });
        const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const results = [];
        if (landscapeWin && !landscapeWin.isDestroyed()) {
            const img      = await landscapeWin.webContents.capturePage();
            const filePath = path.join(dir, `dualview_${ts}_paysage.png`);
            fs.writeFileSync(filePath, img.toPNG());
            results.push(filePath);
        }
        if (portraitWin && !portraitWin.isDestroyed()) {
            const img      = await portraitWin.webContents.capturePage();
            const filePath = path.join(dir, `dualview_${ts}_portrait.png`);
            fs.writeFileSync(filePath, img.toPNG());
            results.push(filePath);
        }
        return { success: true, dir, files: results };
    } catch (e) {
        console.warn('Screenshot error:', e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('choose-screenshot-dir', async () => {
    const result = await dialog.showOpenDialog(landscapeWin, {
        title:      'Dossier de capture',
        properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const dir = result.filePaths[0];
    configSet('settings.screenshotDir', dir);
    return dir;
});

// ═════════════════════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ═════════════════════════════════════════════════════════════════════════════

// Désactiver les marqueurs d'automatisation Chromium détectés par les services.
// AutomationControlled masqué pour que Google/Microsoft n'identifient pas Electron.
// IsolateOrigins/site-per-process retiré : cause ERR_NETWORK_ACCESS_DENIED
// dans les webviews portrait sous Electron 42.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

app.whenReady().then(() => {
    applyAppearance();
    // Forcer la création de la session persist:dualview AVANT les fenêtres
    // pour que onBeforeRequest soit actif dès la première webview.
    session.fromPartition('persist:dualview');
    setupSessionSecurity({
        getPendingImageSavePath:   () => _pendingImageSavePath,
        clearPendingImageSavePath: () => { _pendingImageSavePath = null; },
        getLandscapeWin:           () => landscapeWin,
    });
    createLandscapeWindow();
    createPortraitWindow();
    nativeTheme.on('updated', broadcastTheme);
    startObsServerIfEnabled();
    if (logger.IS_DEV) {
        logger.setupDevTools({ landscapeWin, portraitWin });
    }
});

app.on('window-all-closed', () => {
    if (history) history.saveNow();
    obsControl.stop();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createLandscapeWindow();
        createPortraitWindow();
    }
});