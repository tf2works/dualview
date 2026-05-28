/**
 * DualView - Main Process
 * Version: 0.3.2
 *
 * Changements v0.3.2 :
 * - Intégration OBS (Méthode 1 + Méthode 3) :
 *   - Serveur de contrôle local (obs-control.js) servant le dock OBS + une API.
 *   - Dock OBS : pilotage sync / navigation / onglets depuis l'interface OBS.
 *   - Hotkeys OBS : script Lua natif (obs-integration/) → API /command.
 *   - Toutes les commandes OBS réutilisent les chemins IPC existants
 *     (sync-control, navigate, nav-*, obs-tab-command) → zéro régression.
 *   - Activable/désactivable + port configurable (Paramètres → OBS).
 *
 * Changements v0.3.1 :
 * - Délai de démarrage sync (3 s) pour éviter les interruptions au lancement
 * - IPC sync-control : pause / resume / restart de la synchronisation portrait
 * - Services connectés : openAuthWindow, checkAllServicesStatus, disconnectService
 * - Détection pages de connexion : relayée aux deux fenêtres via 'login-page-detected'
 * - YouTube Shorts : désactivation du bloqueur pub sur les URLs /shorts/
 */

const { app, BrowserWindow, ipcMain, nativeTheme, screen, session } = require('electron');
const logger = require('./logger');
const path = require('path');
const fs = require('fs');
const obsControl = require('./obs-control');
const {
    KNOWN_SERVICES,
    authWindowEvents,
    checkKnownServiceCookies,
    checkAllServicesStatus,
    disconnectService,
    openAuthWindow,
} = require('./auth-window');

// ── Mode dev ─────────────────────────────────────────────────────────────────
// Activer avec : npm start -- --dev
// Logs dans %AppData%/DualView/dualview.log
logger.init();
logger.setupIpc();

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
    // Intégration OBS (v0.3.2)
    obsEnabled: true,    // serveur de contrôle OBS actif au démarrage
    obsPort: 0,          // 0 = port libre choisi automatiquement
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

// ── Détection pages de connexion ─────────────────────────────────────────────
// Domaines exclus de la détection (jamais de popup login)
const LOGIN_DETECTION_WHITELIST = [
    'localhost', '127.0.0.1',
];
// Domaines TOUJOURS considérés comme pages de login (sans vérifier les patterns)
const LOGIN_FORCED_DOMAINS = [
    'accounts.google.com',
    'login.microsoftonline.com', 'login.live.com', 'account.live.com',
    'www.facebook.com', 'www.instagram.com',
    'www.tiktok.com', 'twitter.com', 'x.com',
    'discord.com', 'store.steampowered.com',
    'login.steampowered.com', 'passport.twitch.tv',
];
// Patterns de chemin qui déclenchent la détection sur les autres domaines
const LOGIN_URL_PATTERNS = [
    /\/login\b/i, /\/signin\b/i, /\/sign-in\b/i, /\/sign_in\b/i,
    /\/auth\b/i, /\/oauth\b/i, /\/connexion\b/i, /\/identification\b/i,
    /\/compte\/connexion/i, /\/account\/login/i,
];

function isLoginPage(url) {
    try {
        const u = new URL(url);
        if (LOGIN_DETECTION_WHITELIST.some(d => u.hostname.includes(d))) return false;
        // Domaines forcés → toujours une page de login
        if (LOGIN_FORCED_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return true;
        // Exclure les callbacks OAuth (destination finale, pas une page de login)
        if (/\/callback|\/token|\/redirect/i.test(u.pathname)) return false;
        return LOGIN_URL_PATTERNS.some(re => re.test(u.pathname + u.search));
    } catch { return false; }
}

// Domaines d'authentification connus — ne jamais synchroniser vers portrait
// AUTH_DOMAINS : domaines de LOGIN uniquement.
// Ne pas inclure les domaines de destination post-auth (outlook.live.com,
// office.com, etc.) — ces URLs arrivent dans portrait après une navigation
// légitime et ne doivent PAS être bloquées.
const AUTH_DOMAINS = [
    'accounts.google.com',
    'login.microsoftonline.com', 'login.live.com', 'account.live.com',
    'www.facebook.com',
    'www.instagram.com',
    'www.tiktok.com',
    'twitter.com', 'x.com',
    'discord.com',
    'store.steampowered.com', 'login.steampowered.com',
    'passport.twitch.tv',
    'github.com',
    'gitlab.com',
];

/**
 * Retourne true si l'URL est une page d'authentification
 * (page de login connue OU pattern URL login).
 * Ces URLs ne doivent jamais être envoyées à portrait.
 */
function isAuthUrl(url) {
    try {
        const u = new URL(url);
        // Vérifier uniquement le hostname — PAS pathname ni search.
        // outlook.live.com/mail/ a un paramètre redirect_uri contenant
        // oauth2/authorize mais ce n'est PAS une page d'auth : c'est la
        // destination finale après connexion.
        if (AUTH_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return true;
        // isLoginPage vérifie pathname + search mais exclut les domaines
        // courants (google.com, microsoft.com) → peu de faux positifs
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
        if (h.includes('github.com')) return 'github';
        if (h.includes('gitlab.com')) return 'gitlab';
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

    // Correction sec-ch-ua : Electron expose "Electron" dans ce header HTTP
    // par défaut. Google le vérifie côté serveur pour détecter les navigateurs
    // automatisés. Ce handler est unique sur la session — ne jamais en installer
    // un second ailleurs (auth-window.js, etc.) car cela écraserait celui-ci.
    ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
        const h = details.requestHeaders;
        const v = process.versions.chrome.split('.')[0];
        h['sec-ch-ua'] = `"Google Chrome";v="${v}", "Chromium";v="${v}", "Not=A?Brand";v="99"`;
        h['sec-ch-ua-mobile'] = '?0';
        h['sec-ch-ua-platform'] = '"Windows"';
        callback({ requestHeaders: h });
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

// ── Auth success handler (BUG-1 fix) ─────────────────────────────────────────
// Après une auth réussie, recharger la webview portrait de l'onglet actif
// afin qu'elle lise les cookies fraîchement écrits par la fenêtre auth.
authWindowEvents.on('auth-success', ({ serviceKey, serviceLabel }) => {
    logger.log('auth', 'LOG', [`Auth réussie : ${serviceLabel} (${serviceKey})`]);
    if (!activeTabId || !portraitWin || portraitWin.isDestroyed()) return;
    const url = tabUrls.get(activeTabId) || '';
    logger.log('auth', 'LOG', [`Rechargement portrait — onglet actif: ${activeTabId}, url: ${url}`]);
    if (!url || isAuthUrl(url)) return;
    portraitWin.webContents.send('reload-webview');
});

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

// ── Intégration OBS (v0.3.2) ──────────────────────────────────────────────────
// Liste des onglets connue du main, alimentée par 'save-tabs' (flux existant).
// Sert uniquement à afficher l'état dans le dock OBS — n'altère rien d'autre.
let obsTabs = [];   // [{ id, title, url }]

/**
 * Pousse l'état courant vers le dock OBS (sync, onglet actif, URL, onglets).
 * Sans effet si le serveur OBS n'est pas démarré.
 */
function pushObsStatus() {
    try {
        obsControl.updateStatus({
            sync: syncState,
            activeTabId: activeTabId,
            url: activeTabId ? (tabUrls.get(activeTabId) || '') : '',
            tabs: obsTabs,
        });
    } catch { /* serveur OBS inactif : ignoré */ }
}

/**
 * Traduit une commande OBS (dock ou hotkey) en action DualView.
 * IMPORTANT : on réutilise EXACTEMENT les mêmes chemins que l'UI native.
 * - sync : modifie syncState comme le ferait l'IPC 'sync-control'.
 * - navigation/onglets : délégués au renderer landscape via 'obs-command'
 *   pour exécuter les fonctions UI testées (addTab/closeTab/switchTab/navigate),
 *   ce qui garantit l'absence de divergence de comportement.
 */
function handleObsCommand(action, payload) {
    const ls = landscapeWin && !landscapeWin.isDestroyed() ? landscapeWin : null;

    switch (action) {
        case 'sync-pause':
            applySyncAction('pause');
            break;
        case 'sync-resume':
            applySyncAction('resume');
            break;
        case 'sync-restart':
            applySyncAction('restart');
            break;
        // Navigation et onglets : exécutés par le renderer landscape,
        // qui possède la logique UI (webviews, barre d'onglets, adresse).
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
        default:
            break;
    }
}

/**
 * Logique de contrôle sync partagée entre l'IPC 'sync-control' (UI native)
 * et les commandes OBS. Extraite pour éviter toute duplication.
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
        dockHtmlPath: path.join(__dirname, 'obs-dock.html'),
        onCommand: handleObsCommand,
        logFn: (src, lvl, args) => logger.log(src, lvl, args),
    });
    if (info) {
        logger.log('obs', 'LOG', [`Dock OBS : http://127.0.0.1:${info.port}/dock`]);
        pushObsStatus();
    }
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
        icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-landscape.js'),
            webviewTag: true,
            additionalArguments: logger.IS_DEV ? ['--dev-source=landscape'] : [],
        },
        autoHideMenuBar: true,
        resizable: true,
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f0f0f0',
    });

    landscapeWin.loadFile(path.join(__dirname, 'landscape.html'));
    landscapeWin.webContents.setMaxListeners(50);
    // Mode dev : injecter preload-dev.js comme second preload via session
    if (logger.IS_DEV) {
        landscapeWin.webContents.session.registerPreloadScript({
            id: 'dev-preload-landscape',
            type: 'frame',
            filePath: path.join(__dirname, 'preload-dev.js'),
        });
    }
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
        icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-view.js'),
            webviewTag: true,
            additionalArguments: logger.IS_DEV ? ['--dev-source=portrait'] : [],
        },
        autoHideMenuBar: true,
        show: false,
        backgroundColor: '#ffffff',
    });

    portraitWin.loadFile(path.join(__dirname, 'portrait.html'));
    portraitWin.webContents.setMaxListeners(50);
    if (logger.IS_DEV) {
        portraitWin.webContents.session.registerPreloadScript({
            id: 'dev-preload-portrait',
            type: 'frame',
            filePath: path.join(__dirname, 'preload-dev.js'),
        });
    }
    portraitWin.once('ready-to-show', () => {
        // Attendre que landscape soit visible avant d'afficher portrait
        // pour éviter que portrait charge son contenu en premier
        if (landscapeWin && !landscapeWin.isDestroyed() && landscapeWin.isVisible()) {
            portraitWin.show();
        } else {
            landscapeWin.once('show', () => portraitWin.show());
        }
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
    // Logique déléguée à applySyncAction (partagée avec les commandes OBS),
    // comportement identique à v0.3.1.
    applySyncAction(action);
    pushObsStatus();
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
    pushObsStatus();
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
    pushObsStatus();
});

// ── IPC : Onglets ─────────────────────────────────────────────────────────────
ipcMain.on('tab-switched', (event, tabId) => {
    if (typeof tabId !== 'string') return;
    const SETTINGS_TAB_ID = '__settings__';
    // Ne pas écraser activeTabId avec l'ID de l'onglet paramètres :
    // cela casserait la sync (tabUrls.get(activeTabId) retournerait undefined
    // au retour des paramètres). On met à jour activeTabId seulement pour
    // les vrais onglets de navigation.
    if (tabId !== SETTINGS_TAB_ID) {
        activeTabId = tabId;
    }
    // Si l'overlay login était actif sur un autre onglet, l'effacer
    if (loginPageTabId && loginPageTabId !== tabId) broadcastLoginPageCleared();
    // Relayer l'événement à portrait dans tous les cas (y compris __settings__)
    // pour que portrait affiche l'overlay "Personnalisation en cours"
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
    logger.log('main', 'LOG', [`Login détecté: ${safe} (tab: ${tabId})`]);
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
ipcMain.handle('get-is-dev', () => logger.IS_DEV);
// Toggle DevTools de landscapeWin depuis le renderer (F12)
ipcMain.on('toggle-dev-tools', () => {
    if (!logger.IS_DEV || !landscapeWin || landscapeWin.isDestroyed()) return;
    if (landscapeWin.webContents.isDevToolsOpened()) {
        landscapeWin.webContents.closeDevTools();
    } else {
        landscapeWin.webContents.openDevTools({ mode: 'detach' });
    }
});

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
    // Tenir la liste d'onglets du dock OBS à jour (flux existant réutilisé).
    obsTabs = data.tabs.map(t => ({ id: t.id, title: t.title || '', url: t.url || '' }));
    pushObsStatus();
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
        obsEnabled: v => typeof v === 'boolean',
        obsPort: v => Number.isInteger(v) && v >= 0 && v <= 65535,
    };
    const current = configGet('settings') || Object.assign({}, SETTINGS_DEFAULTS);
    const prevObsEnabled = current.obsEnabled;
    const prevObsPort = current.obsPort;
    for (const key of Object.keys(allowed)) {
        if (settings[key] !== undefined && allowed[key](settings[key])) {
            current[key] = settings[key];
        }
    }
    configSet('settings', current);
    applyAppearance();
    broadcastTheme();
    // Redémarrer le serveur OBS si son activation ou son port a changé.
    if (current.obsEnabled !== prevObsEnabled || current.obsPort !== prevObsPort) {
        obsControl.stop();
        if (current.obsEnabled !== false) startObsServerIfEnabled();
    }
});

// ── IPC : Infos serveur OBS (pour Paramètres → OBS) ───────────────────────────
ipcMain.handle('get-obs-info', () => {
    const info = obsControl.getInfo();
    return {
        enabled: configGet('settings.obsEnabled') !== false,
        running: !!info,
        port: info ? info.port : (configGet('settings.obsPort') || 0),
        token: info ? info.token : '',
        dockUrl: info ? `http://127.0.0.1:${info.port}/dock?token=${info.token}` : '',
    };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
// Désactiver les marqueurs d'automatisation Chromium détectés par les services
// (Google, Microsoft, etc. bloquent les connexions si ces flags sont présents)
// AutomationControlled masqué pour que Google/Microsoft n'identifient pas Electron.
// IsolateOrigins/site-per-process retiré : cause ERR_NETWORK_ACCESS_DENIED
// dans les webviews portrait sous Electron 42.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

app.whenReady().then(() => {
    applyAppearance();
    // Forcer la création de la session persist:dualview et enregistrement
    // des handlers webRequest AVANT la création des fenêtres et webviews.
    // Sans cela, la première webview peut charger une URL avant que
    // onBeforeRequest soit actif → pub non bloquée sur la 1re vidéo YouTube.
    session.fromPartition('persist:dualview');  // crée la session avant setupSessionSecurity
    setupSessionSecurity();                              // enregistre les handlers
    createLandscapeWindow();
    createPortraitWindow();
    nativeTheme.on('updated', broadcastTheme);

    // Démarrer le serveur de contrôle OBS (non bloquant, additif).
    startObsServerIfEnabled();

    // Activer DevTools et raccourcis clavier en mode dev
    // (après création des fenêtres)
    if (logger.IS_DEV) {
        logger.setupDevTools({ landscapeWin, portraitWin });
    }
});

app.on('window-all-closed', () => { obsControl.stop(); app.quit(); });
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createLandscapeWindow();
        createPortraitWindow();
    }
});