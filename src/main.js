/**
 * DualView - Main Process
 * Version: 0.3.0
 *
 * Changements v0.3.0 :
 * - Délai de démarrage sync (3 s) pour éviter les interruptions au lancement
 * - IPC sync-control : pause / resume / restart de la synchronisation portrait
 * - Services connectés : openAuthWindow, checkAllServicesStatus, disconnectService
 * - Détection pages de connexion : relayée aux deux fenêtres via 'login-page-detected'
 * - YouTube Shorts : désactivation du bloqueur pub sur les URLs /shorts/
 */

const { app, BrowserWindow, ipcMain, nativeTheme, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const {
    KNOWN_SERVICES,
    checkKnownServiceCookies,
    checkAllServicesStatus,
    disconnectService,
    openAuthWindow,
} = require('./auth-window');

// ── Config JSON ──────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'dualview-config.json');

const SETTINGS_DEFAULTS = {
    restoreTabs: true,
    homepageMode: 'knack3',
    customHomepageUrl: '',
    newTabMode: 'homepage',
    appearance: 'auto',
    language: 'fr',
    // Services connectés (custom uniquement ; connus = cookies)
    customServices: [],  // [{ id, label, url, connected }]
};

const KNACK3_URL = 'https://marketplace.atlassian.com/vendors/920480808/';

const DEFAULTS = {
    landscapeWindow: { width: 1280, height: 720, x: null, y: null },
    portraitWindow: { width: 390, height: 844, x: null, y: null },
    tabs: [{ id: 'tab-1', title: 'Onglet 1', url: '' }],
    activeTabId: 'tab-1',
    settings: Object.assign({}, SETTINGS_DEFAULTS),
    appVersion: '0.3.0',
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

// ── Bloqueur de publicités ────────────────────────────────────────────────────
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

/**
 * Vérifie si l'URL du demandeur est un YouTube Short.
 * Si oui, le bloqueur pub est bypassé pour cette requête.
 */
function isYouTubeShort(initiatorUrl) {
    if (!initiatorUrl) return false;
    try {
        const u = new URL(initiatorUrl);
        if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') &&
            u.pathname.startsWith('/shorts/')) return true;
    } catch { }
    return false;
}

function isBlockedUrl(urlStr, initiatorUrl) {
    // Ne pas bloquer les ressources des YouTube Shorts
    if (isYouTubeShort(initiatorUrl)) return false;
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

// ── Whitelist détection pages de connexion ────────────────────────────────────
// Ces domaines sont connus pour avoir "login" dans leur URL sans être des pages d'auth
const LOGIN_DETECTION_WHITELIST = [
    'localhost', '127.0.0.1',
];
// Chemins qui déclenchent la détection (sur les domaines non-whitelistés)
const LOGIN_URL_PATTERNS = [
    /\/login\b/i, /\/signin\b/i, /\/sign-in\b/i, /\/sign_in\b/i,
    /\/auth\b/i, /\/oauth\b/i, /\/connexion\b/i, /\/identification\b/i,
    /\/compte\/connexion/i, /\/account\/login/i,
];

function isLoginPage(url) {
    try {
        const u = new URL(url);
        if (LOGIN_DETECTION_WHITELIST.some(d => u.hostname.includes(d))) return false;
        // Exclure les URLs de type callback/token (retour d'OAuth — pas une page de login)
        if (/\/callback|\/token|\/redirect/i.test(u.pathname)) return false;
        return LOGIN_URL_PATTERNS.some(re => re.test(u.pathname + u.search));
    } catch { return false; }
}

// Domaines d'authentification connus — ne jamais synchroniser vers portrait
const AUTH_DOMAINS = [
    'accounts.google.com', 'login.microsoftonline.com', 'login.live.com',
    'www.facebook.com', 'www.instagram.com', 'www.tiktok.com',
    'twitter.com', 'x.com', 'discord.com',
    'store.steampowered.com', 'login.steampowered.com',
    'passport.twitch.tv', 'www.twitch.tv',
];

/**
 * Retourne true si l'URL est une page d'authentification
 * (page de login connue OU pattern URL login).
 * Ces URLs ne doivent jamais être envoyées à portrait.
 */
function isAuthUrl(url) {
    try {
        const u = new URL(url);
        if (AUTH_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return true;
        return isLoginPage(url);
    } catch { return false; }
}

/**
 * Détecte le serviceKey correspondant à une URL (pour le bouton "Se connecter" du popup).
 * Retourne null si aucun service connu ne correspond.
 */
function detectServiceKeyFromUrl(url) {
    try {
        const u = new URL(url);
        const h = u.hostname;
        if (h.includes('google.com')) return 'google';
        if (h.includes('microsoft.com') || h.includes('live.com') || h.includes('microsoftonline.com')) return 'microsoft';
        if (h.includes('instagram.com')) return 'instagram';
        if (h.includes('facebook.com')) return 'facebook';
        if (h.includes('twitch.tv')) return 'twitch';
        if (h.includes('tiktok.com')) return 'tiktok';
        if (h.includes('twitter.com') || h.includes('x.com')) return 'twitter';
        if (h.includes('discord.com')) return 'discord';
        if (h.includes('steampowered.com')) return 'steam';
    } catch { }
    return null;
}

// ── Session : sécurité globale ────────────────────────────────────────────────
function setupSessionSecurity() {
    const ses = session.fromPartition('persist:dualview');

    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        const blocked = isBlockedUrl(details.url, details.referrer || details.initiator);
        callback({ cancel: blocked });
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

// ── État global ───────────────────────────────────────────────────────────────
let tabUrls = new Map();
let activeTabId = null;

// État synchronisation
// 'active' | 'paused'
let syncState = 'paused';   // Démarre en pause, activé après 3 s
let syncStartTimer = null;

let landscapeWin = null;
let portraitWin = null;

// ── Helpers thème ─────────────────────────────────────────────────────────────
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
    // Augmenter la limite de listeners pour les webviews multiples (pool)
    landscapeWin.webContents.setMaxListeners(50);
    landscapeWin.once('ready-to-show', () => {
        landscapeWin.show();
        tryScheduleSyncStart();
    });
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
    portraitWin.webContents.setMaxListeners(50);
    portraitWin.once('ready-to-show', () => {
        portraitWin.show();
        tryScheduleSyncStart();
    });
    portraitWin.on('moved', () => { const [x, y] = portraitWin.getPosition(); configSet('portraitWindow.x', x); configSet('portraitWindow.y', y); });
    portraitWin.on('closed', () => { portraitWin = null; });
}

let _landscapeReady = false;
let _portraitReady = false;
function tryScheduleSyncStart() {
    if (landscapeWin && !landscapeWin.isDestroyed()) _landscapeReady = true;
    if (portraitWin && !portraitWin.isDestroyed()) _portraitReady = true;
    if (_landscapeReady && _portraitReady) scheduleSyncStart();
}

// ── IPC : Contrôle synchronisation ───────────────────────────────────────────
ipcMain.on('sync-control', (event, action) => {
    // action : 'pause' | 'resume' | 'restart'
    if (!['pause', 'resume', 'restart'].includes(action)) return;

    if (action === 'pause') {
        syncState = 'paused';
        broadcastSyncState();
    } else if (action === 'resume') {
        syncState = 'active';
        broadcastSyncState();
        // Rejouer l'état courant dans portrait (sauf pages d'auth)
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
});

// ── IPC : Navigation ──────────────────────────────────────────────────────────
ipcMain.on('navigate', (event, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    if (activeTabId) tabUrls.set(activeTabId, safe);
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('load-url', safe);
    // Ne pas synchroniser les pages d'authentification vers portrait
    if (syncState === 'active' && !isAuthUrl(safe) && portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('load-url', { tabId: activeTabId, url: safe });
});

ipcMain.on('sync-scroll', (event, pct) => {
    if (typeof pct !== 'number') return;
    if (syncState !== 'active') return;
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('apply-scroll', pct);
});

ipcMain.on('sync-navigate', (event, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    if (activeTabId) tabUrls.set(activeTabId, safe);
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('update-addressbar', safe);
    // Ne pas synchroniser les pages d'authentification vers portrait
    if (syncState === 'active' && !isAuthUrl(safe) && portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('load-url', { tabId: activeTabId, url: safe });
});

// ── IPC : Onglets ─────────────────────────────────────────────────────────────
ipcMain.on('tab-switched', (event, tabId) => {
    if (typeof tabId !== 'string') return;
    activeTabId = tabId;
    // Si l'overlay login était actif sur un autre onglet, l'effacer
    if (loginPageTabId && loginPageTabId !== tabId) broadcastLoginPageCleared();
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('tab-switched', tabId);
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

// ── IPC : Navigation back/forward ────────────────────────────────────────────
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

// ── IPC : Vidéo sync ──────────────────────────────────────────────────────────
ipcMain.on('video-play', (e, t) => {
    if (syncState !== 'active') return;
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd', { action: 'play', currentTime: t });
});
ipcMain.on('video-pause', (e, t) => {
    if (syncState !== 'active') return;
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd', { action: 'pause', currentTime: t });
});
ipcMain.on('video-timeupdate', (e, t) => {
    if (syncState !== 'active') return;
    if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd', { action: 'seek', currentTime: t });
});

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
        if (activeTabId && syncState === 'active') {
            const url = tabUrls.get(activeTabId) || '';
            if (url) portraitWin.webContents.send('load-url', { tabId: activeTabId, url });
        }
    }
});

// ── IPC : Détection page de connexion ────────────────────────────────────────
// loginPageTabId : onglet pour lequel l'overlay est actif (null = masqué)
let loginPageTabId = null;

function broadcastLoginPageCleared() {
    loginPageTabId = null;
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('login-page-cleared');
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('login-page-cleared');
}

ipcMain.on('login-page-detected', (event, { url, tabId }) => {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    loginPageTabId = tabId;
    const serviceKey = detectServiceKeyFromUrl(safe);
    if (landscapeWin && !landscapeWin.isDestroyed())
        landscapeWin.webContents.send('show-login-popup', { url: safe, tabId, serviceKey });
    if (portraitWin && !portraitWin.isDestroyed())
        portraitWin.webContents.send('show-login-popup', { url: safe, tabId, serviceKey });
});

// Landscape signale que l'URL active n'est plus une page de login
ipcMain.on('login-page-left', (event, { tabId }) => {
    if (loginPageTabId === tabId) broadcastLoginPageCleared();
});

// ── IPC : Services connectés ──────────────────────────────────────────────────
ipcMain.handle('get-connected-services-status', async () => {
    const knownStatus = await checkAllServicesStatus();
    const customServices = configGet('settings.customServices') || [];
    return { known: knownStatus, custom: customServices };
});

ipcMain.handle('open-auth-window', async (event, { serviceKey, customUrl, customLabel }) => {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    try {
        const success = await openAuthWindow({ serviceKey, customUrl, customLabel, parentWin });
        if (success && serviceKey === 'custom') {
            // Enregistrer le service personnalisé comme connecté
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
    const updated = customServices.filter(s => s.id !== serviceId);
    configSet('settings.customServices', updated);
    return { success: true };
});

// Confirmation auth personnalisée (depuis le bouton "J'ai terminé")
ipcMain.on('auth-custom-confirmed', (event, confirmed) => {
    // Relayé par auth-window.js via ipcMain.once
});
ipcMain.on('auth-custom-cancelled', () => { });

// ── IPC : Divers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-theme', () => getTheme());
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('get-homepage-url', () => getHomepageUrl());
ipcMain.handle('get-sync-state', () => syncState);

ipcMain.handle('get-store', () => ({
    tabs: configGet('tabs') || DEFAULTS.tabs,
    activeTabId: configGet('activeTabId') || DEFAULTS.activeTabId,
    settings: configGet('settings') || Object.assign({}, SETTINGS_DEFAULTS),
}));

ipcMain.on('save-tabs', (event, data) => {
    if (!data || !Array.isArray(data.tabs)) return;
    configSet('tabs', data.tabs);
    configSet('activeTabId', data.activeTabId || data.tabs[0].id);
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

// ── App lifecycle ─────────────────────────────────────────────────────────────
// Désactiver les marqueurs d'automatisation Chromium détectés par les services
// (Google, Microsoft, etc. bloquent les connexions si ces flags sont présents)
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-features', 'IsolateOrigins,site-per-process');

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