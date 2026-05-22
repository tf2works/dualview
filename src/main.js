/**
 * DualView - Main Process
 * Version: 0.2.6
 *
 * Changements v0.2.6 :
 * - Pool de webviews : chaque onglet conserve son état (plus de rechargement au switch)
 * - IPC tab-switched : notifie portraitWin du switch d'onglet actif
 * - IPC tab-closed   : notifie portraitWin de la fermeture d'un onglet
 * - currentUrl remplacé par activeTabId + tabUrls (map tabId → url)
 * - sync-resume : recharge portrait uniquement si l'URL de l'onglet a changé
 */

const { app, BrowserWindow, ipcMain, nativeTheme, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Config JSON ──────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'dualview-config.json');

const SETTINGS_DEFAULTS = {
    restoreTabs: true,
    homepageMode: 'knack3',   // 'knack3' | 'custom' | 'empty'
    customHomepageUrl: '',
    newTabMode: 'homepage',   // 'homepage' | 'empty'
    appearance: 'auto',       // 'auto' | 'light' | 'dark'
    language: 'fr'            // 'fr' | 'en'
};

const KNACK3_URL = 'https://marketplace.atlassian.com/vendors/920480808/';

const DEFAULTS = {
    landscapeWindow: { width: 1280, height: 720, x: null, y: null },
    portraitWindow: { width: 390, height: 844, x: null, y: null },
    tabs: [{ id: 'tab-1', title: 'Onglet 1', url: '' }],
    activeTabId: 'tab-1',
    settings: Object.assign({}, SETTINGS_DEFAULTS),
    appVersion: '0.2.6'
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
            const data = JSON.parse(raw);
            return Object.assign({}, DEFAULTS, data, {
                landscapeWindow: Object.assign({}, DEFAULTS.landscapeWindow, data.landscapeWindow),
                portraitWindow: Object.assign({}, DEFAULTS.portraitWindow, data.portraitWindow),
                settings: Object.assign({}, SETTINGS_DEFAULTS, data.settings),
            });
        }
    } catch (e) { console.warn('Config load error:', e.message); }
    return Object.assign({}, DEFAULTS, { settings: Object.assign({}, SETTINGS_DEFAULTS) });
}

function saveConfig(data) {
    try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.warn('Config save error:', e.message); }
}

let config = loadConfig();

function configSet(keyPath, value) {
    const keys = keyPath.split('.');
    let obj = config;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    saveConfig(config);
}

function configGet(keyPath) {
    const keys = keyPath.split('.');
    let obj = config;
    for (const k of keys) {
        if (obj == null || typeof obj !== 'object') return undefined;
        obj = obj[k];
    }
    return obj;
}

// ── Validation sécurité ───────────────────────────────────────────────────────
function sanitizeUrl(url) {
    if (typeof url !== 'string') return null;
    url = url.trim();
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return null;
        return url;
    } catch { return null; }
}

const AD_BLOCK_DOMAINS = [
    'doubleclick.net', 'googlesyndication.com',
    'adservice.google.com', 'adservice.google.fr',
    'google-analytics.com', 'ads.youtube.com',
    'pagead2.googlesyndication.com', 'stats.g.doubleclick.net',
];
const AD_BLOCK_PATHS = [
    { host: 'analytics.google.com', path: '/analytics/collect' },
    { host: 'www.google-analytics.com', path: '/collect' },
    { host: 'imasdk.googleapis.com', path: '/js/sdkloader/' },
    { host: 'imasdk.googleapis.com', path: '/admob/' },
    { host: 'imasdk.googleapis.com', path: '/pal/' },
];

function isBlockedUrl(urlStr) {
    try {
        const u = new URL(urlStr);
        const h = u.hostname.toLowerCase();
        const ALLOWED_SCHEMES = ['http:', 'https:', 'file:', 'devtools:', 'chrome-extension:'];
        if (!ALLOWED_SCHEMES.includes(u.protocol)) return true;
        for (const domain of AD_BLOCK_DOMAINS) {
            if (h === domain || h.endsWith('.' + domain)) return true;
        }
        for (const rule of AD_BLOCK_PATHS) {
            if (h === rule.host && u.pathname.startsWith(rule.path)) return true;
        }
    } catch { return false; }
    return false;
}

// ── Session : sécurité globale ────────────────────────────────────────────────
function setupSessionSecurity() {
    const ses = session.fromPartition('persist:dualview');

    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        callback({ cancel: isBlockedUrl(details.url) });
    });

    ses.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(false);
    });

    ses.on('will-download', (event, item) => {
        item.cancel();
        const filename = item.getFilename() || '';
        if (landscapeWin && !landscapeWin.isDestroyed()) {
            landscapeWin.webContents.send('download-blocked', filename);
        }
    });
}

// ── État des onglets (côté main) ─────────────────────────────────────────────
// tabUrls : Map<tabId, url> — URL courante de chaque onglet
// activeTabId : onglet actuellement visible dans les deux fenêtres
let tabUrls = new Map();
let activeTabId = null;

// ── Variables globales ────────────────────────────────────────────────────────
let landscapeWin = null;
let portraitWin = null;

function getTheme() {
    const appearance = configGet('settings.appearance') || 'auto';
    if (appearance === 'light') return 'light';
    if (appearance === 'dark') return 'dark';
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

// ── Fenêtres ──────────────────────────────────────────────────────────────────
function createLandscapeWindow() {
    const saved = configGet('landscapeWindow');
    const { height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = saved.width || 1280;
    const h = saved.height || 720;
    const x = saved.x !== null ? saved.x : 20;
    const y = saved.y !== null ? saved.y : Math.floor((sh - h) / 2);

    landscapeWin = new BrowserWindow({
        width: w, height: h, x, y,
        minWidth: 700, minHeight: 480,
        title: 'DualView - Paysage',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-landscape.js'),
            webviewTag: true,
        },
        autoHideMenuBar: true,
        resizable: true,
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f0f0f0',
    });

    landscapeWin.loadFile(path.join(__dirname, 'landscape.html'));
    landscapeWin.once('ready-to-show', () => landscapeWin.show());
    landscapeWin.on('moved', () => { const [x, y] = landscapeWin.getPosition(); configSet('landscapeWindow.x', x); configSet('landscapeWindow.y', y); });
    landscapeWin.on('resize', () => { const [w, h] = landscapeWin.getSize(); configSet('landscapeWindow.width', w); configSet('landscapeWindow.height', h); });
    landscapeWin.on('closed', () => app.quit());
}

function createPortraitWindow() {
    const saved = configGet('portraitWindow');
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = saved.width || 390;
    const h = saved.height || 844;
    const x = saved.x !== null ? saved.x : sw - w - 20;
    const y = saved.y !== null ? saved.y : Math.floor((sh - h) / 2);

    portraitWin = new BrowserWindow({
        width: w, height: h, x, y,
        title: 'DualView - Portrait',
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-view.js'),
            webviewTag: true,
        },
        autoHideMenuBar: true,
        show: false,
        backgroundColor: '#ffffff',
    });

    portraitWin.loadFile(path.join(__dirname, 'portrait.html'));
    portraitWin.once('ready-to-show', () => portraitWin.show());
    portraitWin.on('moved', () => { const [x, y] = portraitWin.getPosition(); configSet('portraitWindow.x', x); configSet('portraitWindow.y', y); });
    portraitWin.on('closed', () => { portraitWin = null; });
}

// ── IPC : Navigation (dans l'onglet actif) ────────────────────────────────────
ipcMain.on('navigate', (event, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    // Mémoriser l'URL pour l'onglet actif
    if (activeTabId) tabUrls.set(activeTabId, safe);
    // Landscape charge dans sa propre webview active (géré côté renderer)
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('load-url', safe);
    // Portrait charge dans sa webview de l'onglet actif
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('load-url', { tabId: activeTabId, url: safe });
});

ipcMain.on('sync-scroll', (event, pct) => {
    if (typeof pct !== 'number') return;
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('apply-scroll', pct);
});

// Navigation in-page détectée par la webview landscape (did-navigate)
ipcMain.on('sync-navigate', (event, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    if (activeTabId) tabUrls.set(activeTabId, safe);
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('update-addressbar', safe);
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('load-url', { tabId: activeTabId, url: safe });
});

// ── IPC : Switch d'onglet ─────────────────────────────────────────────────────
// Déclenché par landscape quand l'utilisateur clique sur un onglet.
// Portrait reçoit le tabId et affiche sa webview correspondante (sans recharger).
ipcMain.on('tab-switched', (event, tabId) => {
    if (typeof tabId !== 'string') return;
    activeTabId = tabId;
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('tab-switched', tabId);
});

// ── IPC : Fermeture d'onglet ──────────────────────────────────────────────────
// Portrait détruit sa webview associée immédiatement, sans confirmation.
ipcMain.on('tab-closed', (event, tabId) => {
    if (typeof tabId !== 'string') return;
    tabUrls.delete(tabId);
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('tab-closed', tabId);
});

// ── IPC : Création d'onglet ───────────────────────────────────────────────────
// Notifie portrait de créer une webview vide pour ce nouvel onglet.
ipcMain.on('tab-created', (event, { tabId, url }) => {
    if (typeof tabId !== 'string') return;
    const safe = url ? sanitizeUrl(url) : null;
    if (safe) tabUrls.set(tabId, safe);
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('tab-created', { tabId, url: safe || '' });
});

// ── IPC : Navigation back/forward ────────────────────────────────────────────
ipcMain.on('notify-nav-state', (event, state) => {
    if (!state || typeof state !== 'object') return;
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('nav-state-changed', state);
});

ipcMain.on('nav-back', () => {
    if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('webview-go-back');
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('webview-go-back');
});

ipcMain.on('nav-forward', () => {
    if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('webview-go-forward');
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('webview-go-forward');
});

// ── IPC : Reload ──────────────────────────────────────────────────────────────
ipcMain.on('reload-views', () => {
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('reload-webview');
});

ipcMain.on('relaunch-app', () => {
    app.relaunch();
    app.exit(0);
});

// ── IPC : Vidéo sync ──────────────────────────────────────────────────────────
ipcMain.on('video-play', (e, t) => { if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd', { action: 'play', currentTime: t }); });
ipcMain.on('video-pause', (e, t) => { if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd', { action: 'pause', currentTime: t }); });
ipcMain.on('video-timeupdate', (e, t) => { if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd', { action: 'seek', currentTime: t }); });

// ── IPC : Redimensionnement portrait ─────────────────────────────────────────
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
        // Après redimensionnement, recharger l'onglet actif dans portrait
        // (la webview a été détruite par le resize natif Electron)
        if (activeTabId) {
            const url = tabUrls.get(activeTabId) || '';
            if (url) portraitWin.webContents.send('load-url', { tabId: activeTabId, url });
        }
    }
});

// ── IPC : Divers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-theme', () => getTheme());
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('get-homepage-url', () => getHomepageUrl());

ipcMain.handle('get-store', () => ({
    tabs: configGet('tabs') || DEFAULTS.tabs,
    activeTabId: configGet('activeTabId') || DEFAULTS.activeTabId,
    settings: configGet('settings') || Object.assign({}, SETTINGS_DEFAULTS),
}));

ipcMain.on('save-tabs', (event, data) => {
    if (!data || !Array.isArray(data.tabs)) return;
    configSet('tabs', data.tabs);
    configSet('activeTabId', data.activeTabId || data.tabs[0].id);
    // Synchroniser tabUrls avec les tabs sauvegardés
    for (const tab of data.tabs) {
        if (tab.url) tabUrls.set(tab.id, tab.url);
    }
    if (data.activeTabId) activeTabId = data.activeTabId;
});

ipcMain.on('save-settings', (event, settings) => {
    if (!settings || typeof settings !== 'object') return;
    const allowed = {
        restoreTabs: v => typeof v === 'boolean',
        homepageMode: v => ['knack3', 'custom', 'empty'].includes(v),
        customHomepageUrl: v => typeof v === 'string' && (v === '' || sanitizeUrl(v) !== null),
        newTabMode: v => ['homepage', 'empty'].includes(v),
        appearance: v => ['auto', 'light', 'dark'].includes(v),
        language: v => ['fr', 'en'].includes(v),
    };
    const current = configGet('settings') || Object.assign({}, SETTINGS_DEFAULTS);
    for (const key of Object.keys(allowed)) {
        if (settings[key] !== undefined && allowed[key](settings[key])) {
            current[key] = settings[key];
        }
    }
    configSet('settings', current);
    applyAppearance();
    broadcastTheme();
});

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    applyAppearance();
    setupSessionSecurity();
    createLandscapeWindow();
    createPortraitWindow();
    nativeTheme.on('updated', broadcastTheme);
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createLandscapeWindow();
        createPortraitWindow();
    }
});