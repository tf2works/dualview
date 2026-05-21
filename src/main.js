/**
 * DualView - Main Process
 * Version: 0.2.4
 *
 * Changements v0.2.4 :
 * - Barre de controle integree dans landscapeWin (controlWin supprime)
 * - landscapeWin utilise preload-landscape.js (fusion preload-control + preload-view)
 * - portraitWin : resizable=false (redimensionnement bloque)
 * - Option C : bouton ↔ active setResizable(true), ✅ le desactive
 * - Labels OBS retires des fenetres paysage et portrait
 * - Bouton Charger remplace par ▶
 */

const { app, BrowserWindow, ipcMain, nativeTheme, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Store JSON natif ─────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'dualview-config.json');

const DEFAULTS = {
    landscapeWindow: { width: 1280, height: 720, x: null, y: null },
    portraitWindow: { width: 390, height: 844, x: null, y: null },
    tabs: [{ id: 'tab-1', title: 'Onglet 1', url: '' }],
    activeTabId: 'tab-1',
    appVersion: '0.2.4'
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
            const data = JSON.parse(raw);
            return Object.assign({}, DEFAULTS, data, {
                landscapeWindow: Object.assign({}, DEFAULTS.landscapeWindow, data.landscapeWindow),
                portraitWindow: Object.assign({}, DEFAULTS.portraitWindow, data.portraitWindow),
            });
        }
    } catch (e) { console.warn('Config load error:', e.message); }
    return Object.assign({}, DEFAULTS);
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

// ── Bloqueur de publicites ────────────────────────────────────────────────────
const AD_BLOCK_PATTERNS = [
    '*://*.doubleclick.net/*',
    '*://googleads.g.doubleclick.net/*',
    '*://pubads.g.doubleclick.net/*',
    '*://securepubads.g.doubleclick.net/*',
    '*://pagead2.googlesyndication.com/*',
    '*://ads.youtube.com/*',
    '*://*.googlesyndication.com/*',
    '*://*.adservice.google.com/*',
    '*://*.adservice.google.fr/*',
    '*://analytics.google.com/analytics/collect*',
    '*://www.google-analytics.com/collect*',
    '*://stats.g.doubleclick.net/*',
    '*://imasdk.googleapis.com/js/sdkloader/*',
    '*://imasdk.googleapis.com/admob/*',
    '*://imasdk.googleapis.com/pal/*',
];

function setupAdBlocker() {
    session.fromPartition('persist:dualview').webRequest.onBeforeRequest(
        { urls: AD_BLOCK_PATTERNS },
        (details, callback) => { callback({ cancel: true }); }
    );
}

// ── Variables globales ───────────────────────────────────────────────────────
let landscapeWin = null;
let portraitWin = null;
let currentUrl = '';

function getTheme() {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function broadcastTheme() {
    const theme = getTheme();
    [landscapeWin, portraitWin].forEach(win => {
        if (win && !win.isDestroyed()) win.webContents.send('theme-changed', theme);
    });
}

// ── Fenetres ─────────────────────────────────────────────────────────────────
function createLandscapeWindow() {
    const saved = configGet('landscapeWindow');
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
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
        // v0.2.4 : redimensionnement bloque
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
    // Position sauvegardee (la taille est fixe)
    portraitWin.on('moved', () => { const [x, y] = portraitWin.getPosition(); configSet('portraitWindow.x', x); configSet('portraitWindow.y', y); });
    portraitWin.on('closed', () => { portraitWin = null; });
}

// ── IPC : Navigation URL ──────────────────────────────────────────────────────
ipcMain.on('navigate', (event, url) => {
    currentUrl = url;
    if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('load-url', url);
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('load-url', url);
});

ipcMain.on('sync-scroll', (event, pct) => {
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('apply-scroll', pct);
});

ipcMain.on('sync-navigate', (event, url) => {
    currentUrl = url;
    if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('update-addressbar', url);
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('load-url', url);
});

// ── IPC : Navigation back/forward ─────────────────────────────────────────────
ipcMain.on('notify-nav-state', (event, state) => {
    if (landscapeWin && !landscapeWin.isDestroyed()) {
        landscapeWin.webContents.send('nav-state-changed', state);
    }
});

ipcMain.on('nav-back', () => {
    if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('webview-go-back');
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('webview-go-back');
});

ipcMain.on('nav-forward', () => {
    if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('webview-go-forward');
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('webview-go-forward');
});

// ── IPC : Video sync ──────────────────────────────────────────────────────────
ipcMain.on('video-play', (e, t) => { if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd', { action: 'play', currentTime: t }); });
ipcMain.on('video-pause', (e, t) => { if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd', { action: 'pause', currentTime: t }); });
ipcMain.on('video-timeupdate', (e, t) => { if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd', { action: 'seek', currentTime: t }); });
ipcMain.on('video-state', (e, s) => { if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('video-state', s); });

// ── IPC : Divers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-current-url', () => currentUrl);
ipcMain.handle('get-theme', () => getTheme());
ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('get-store', () => ({
    tabs: configGet('tabs') || DEFAULTS.tabs,
    activeTabId: configGet('activeTabId') || DEFAULTS.activeTabId,
}));

ipcMain.on('save-tabs', (event, { tabs, activeTabId }) => {
    configSet('tabs', tabs);
    configSet('activeTabId', activeTabId);
});

// ── IPC : Redimensionnement portrait ──────────────────────────────────────────
// Option C v0.2.4 : portrait demarre non-redimensionnable.
// Le bouton ↔ active le redimensionnement, ✅ le desactive.
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
        // Sauvegarder la nouvelle position apres redimensionnement
        const [w, h] = portraitWin.getSize();
        configSet('portraitWindow.width', w);
        configSet('portraitWindow.height', h);
        // Recharger l'URL pour que la webview portrait s'adapte a la nouvelle taille
        if (currentUrl) portraitWin.webContents.send('load-url', currentUrl);
    }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    setupAdBlocker();
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