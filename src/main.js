/**
 * DualView - Main Process
 * Version: 0.4.2
 *
 * Changements v0.4.2 :
 * - Refactoring Phase A : main.js découpé en modules Node.js.
 *   Ce fichier est désormais un point d'entrée léger (~120 lignes).
 *   Modules extraits :
 *     src/main/config-manager.js   — configuration JSON
 *     src/main/security.js         — bloqueur pub + sécurité session
 *     src/main/url-detector.js     — isLoginPage / isAuthUrl / detectServiceKey
 *     src/main/sync-manager.js     — état et cycle de vie synchronisation
 *     src/main/window-manager.js   — création fenêtres BrowserWindow
 *     src/main/context-menu.js     — menu contextuel natif clic droit
 *     src/main/ipc/ipc-navigation.js
 *     src/main/ipc/ipc-sync.js
 *     src/main/ipc/ipc-tabs.js
 *     src/main/ipc/ipc-history.js
 *     src/main/ipc/ipc-portrait.js
 *     src/main/ipc/ipc-services.js
 *     src/main/ipc/ipc-settings.js
 *     src/main/ipc/ipc-obs.js
 *     src/main/ipc/ipc-screenshot.js
 *
 * Versions précédentes : voir ARCHITECTURE.md § Historique des versions.
 */

'use strict';

const { app, session } = require('electron');
const path             = require('path');

// ── Modules DualView ──────────────────────────────────────────────────────────
const logger        = require('./logger');
const obsControl    = require('./obs-control');
const HistoryManager = require('./history-manager');
const configManager = require('./main/config-manager');
const security      = require('./main/security');
const syncManager   = require('./main/sync-manager');
const windowManager = require('./main/window-manager');
const contextMenu   = require('./main/context-menu');

// IPC modules
const ipcNavigation  = require('./main/ipc/ipc-navigation');
const ipcSync        = require('./main/ipc/ipc-sync');
const ipcTabs        = require('./main/ipc/ipc-tabs');
const ipcHistory     = require('./main/ipc/ipc-history');
const ipcPortrait    = require('./main/ipc/ipc-portrait');
const ipcServices    = require('./main/ipc/ipc-services');
const ipcSettings    = require('./main/ipc/ipc-settings');
const ipcObs         = require('./main/ipc/ipc-obs');
const ipcScreenshot  = require('./main/ipc/ipc-screenshot');

// ── Mode dev ──────────────────────────────────────────────────────────────────
logger.init();
logger.setupIpc();

// ── Config ────────────────────────────────────────────────────────────────────
configManager.init(app.getPath('userData'));

// ── Historique ────────────────────────────────────────────────────────────────
const history = new HistoryManager(app.getPath('userData'));

// ── État global ───────────────────────────────────────────────────────────────
const tabUrls = new Map();    // Map<tabId, url>
let activeTabId = null;
let obsTabs     = [];         // [{ id, title, url }]

// Flag pour "Enregistrer l'image sous…" (voir security.js § will-download)
let _pendingImageSavePath = null;

// ── Contexte partagé entre tous les modules IPC ───────────────────────────────
// Ce contexte est passé à chaque module register() pour éviter les imports
// circulaires et centraliser les dépendances variables (fenêtres, état).
const ctx = {
    // Fenêtres (via accesseurs pour avoir les refs à jour après création)
    getLandscapeWin: () => windowManager.getLandscapeWin(),
    getPortraitWin:  () => windowManager.getPortraitWin(),
    // Sync
    getSyncState: () => syncManager.getSyncState(),
    // Onglets
    getActiveTabId: () => activeTabId,
    setActiveTabId: (id) => { activeTabId = id; },
    getTabUrl:      (id) => tabUrls.get(id) || '',
    setTabUrl:      (id, url) => tabUrls.set(id, url),
    deleteTabUrl:   (id) => tabUrls.delete(id),
    // Config
    configGet: (k) => configManager.configGet(k),
    configSet: (k, v) => configManager.configSet(k, v),
    // Historique
    getHistory: () => history,
    // OBS
    setObsTabs:   (tabs) => { obsTabs = tabs; },
    pushObsStatus,
    startObsServerIfEnabled,
    // Login (rempli par ipc-services après son register)
    broadcastLoginPageCleared: () => {},
    getLoginPageTabId:         () => null,
};

// ── OBS helpers ───────────────────────────────────────────────────────────────

function pushObsStatus() {
    try {
        obsControl.updateStatus({
            sync:        syncManager.getSyncState(),
            activeTabId: activeTabId,
            url:         activeTabId ? (tabUrls.get(activeTabId) || '') : '',
            tabs:        obsTabs,
        });
    } catch { /* serveur OBS inactif : ignoré */ }
}

function handleObsCommand(action, payload) {
    const ls = windowManager.getLandscapeWin();

    switch (action) {
        case 'sync-pause':   syncManager.applySyncAction('pause');   break;
        case 'sync-resume':  syncManager.applySyncAction('resume');  break;
        case 'sync-restart': syncManager.applySyncAction('restart'); break;
        case 'nav-back':
        case 'nav-forward':
        case 'nav-reload':
        case 'nav-home':
        case 'tab-new':
        case 'tab-close':
        case 'tab-switch':
        case 'navigate':
            if (ls && !ls.isDestroyed())
                ls.webContents.send('obs-command', { action, payload: payload || {} });
            break;
        default: break;
    }
}

async function startObsServerIfEnabled() {
    const enabled = configManager.configGet('settings.obsEnabled');
    if (enabled === false) {
        logger.log('obs', 'LOG', ['Intégration OBS désactivée (paramètres).']);
        return;
    }
    const port = configManager.configGet('settings.obsPort') || 0;
    const info = await obsControl.start({
        port,
        dockHtmlPath: path.join(__dirname, 'obs-dock.html'),
        onCommand: handleObsCommand,
        logFn: (src, lvl, args) => logger.log(src, lvl, args),
    });
    if (info) {
        logger.log('obs', 'LOG', [`Dock OBS : http://127.0.0.1:${info.port}/dock`]);
        pushObsStatus();
    }
}

// ── Enregistrement des handlers IPC ───────────────────────────────────────────
// L'ordre compte : ipc-services doit être enregistré avant ipc-tabs car
// il injecte broadcastLoginPageCleared et getLoginPageTabId dans ctx.
ipcServices.register(ctx);   // injecte aussi authWindowEvents auth-success handler
ipcNavigation.register(ctx);
ipcSync.register(ctx);
ipcTabs.register(ctx);
ipcHistory.register(ctx);
ipcPortrait.register(ctx);
const { applyAppearance } = ipcSettings.register(ctx);
ipcObs.register(ctx);
ipcScreenshot.register(ctx);

// ── Sync Manager : injection des dépendances (après création contexte) ────────
// (Les refs fenêtres ne sont pas encore disponibles ici ; sync-manager
//  les lira via getLandscapeWin/getPortraitWin au moment de broadcastSyncState)
syncManager.init({
    landscapeWin:   null,   // non utilisé — sync-manager utilise les getters
    portraitWin:    null,
    getActiveTabId: () => activeTabId,
    getTabUrl:      (id) => tabUrls.get(id) || '',
    getLandscapeWin: windowManager.getLandscapeWin,
    getPortraitWin:  windowManager.getPortraitWin,
});

// ── Anti-détection Chromium ───────────────────────────────────────────────────
// Masquer AutomationControlled avant app.whenReady() (Google/Microsoft le vérifient).
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    applyAppearance();

    // Créer la session avant les fenêtres pour que onBeforeRequest soit actif
    // dès le chargement de la première webview (évite la pub sur la 1re vidéo).
    session.fromPartition('persist:dualview');
    security.setupSessionSecurity({
        onDownloadBlocked: (filename) => {
            const ls = windowManager.getLandscapeWin();
            if (ls && !ls.isDestroyed()) ls.webContents.send('download-blocked', filename);
        },
        getPendingImageSavePath:   () => _pendingImageSavePath,
        clearPendingImageSavePath: () => { _pendingImageSavePath = null; },
    });

    // Créer les fenêtres
    windowManager.createLandscapeWindow({
        onContextMenu: (params, wvContents) => {
            const language        = configManager.configGet('settings.language') || 'fr';
            const searchEngineUrl = configManager.configGet('settings.searchEngineUrl') || 'https://duckduckgo.com/?q=';
            contextMenu.buildAndShowContextMenu(
                params, wvContents, windowManager.getLandscapeWin(),
                {
                    language,
                    searchEngineUrl,
                    getPendingImageSavePath:   () => _pendingImageSavePath,
                    setPendingImageSavePath:   (p) => { _pendingImageSavePath = p; },
                }
            );
        },
        onWindowOpen: (url) => {
            const ls = windowManager.getLandscapeWin();
            if (ls && !ls.isDestroyed())
                ls.webContents.send('context-menu-action', { action: 'open-link-new-tab', url });
        },
    });
    windowManager.createPortraitWindow();

    // DevTools en mode dev
    if (logger.IS_DEV) {
        logger.setupDevTools({
            landscapeWin: windowManager.getLandscapeWin(),
            portraitWin:  windowManager.getPortraitWin(),
        });
    }

    startObsServerIfEnabled();
});

app.on('window-all-closed', () => {
    if (history) history.saveNow();
    obsControl.stop();
    app.quit();
});

app.on('activate', () => {
    const { BrowserWindow } = require('electron');
    if (BrowserWindow.getAllWindows().length === 0) {
        windowManager.createLandscapeWindow();
        windowManager.createPortraitWindow();
    }
});
