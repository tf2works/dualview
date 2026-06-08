/**
 * DualView - Main Process
 * Version: 0.4.3
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
 *   Actions selon le contexte : lien, image, texte sélectionné, page.
 *   "Ouvrir dans une nouvelle fenêtre" retiré ; ouverture en onglet DualView.
 * - Boutons souris 3/4 (Retour/Avance) capturés via before-input-event.
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

const { app, BrowserWindow, ipcMain, nativeTheme, screen, session, dialog, Menu, MenuItem, clipboard } = require('electron');
const logger = require('./logger');
const path = require('path');
const fs = require('fs');
const obsControl = require('./obs-control');
const HistoryManager = require('./history-manager');
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
    // Moteur de recherche (v0.4.0)
    searchEngineId: 'duckduckgo',
    searchEngineUrl: 'https://duckduckgo.com/?q=',
    // Screenshot (v0.4.0)
    screenshotDir: '',   // '' = dossier Images utilisateur par défaut
    // Portrait preset (v0.4.0)
    portraitPreset: 'iphone15', // id du preset sélectionné
    // Mute automatique portrait (v0.4.3)
    autoMutePortrait: true,     // force video.muted=true dans portrait
};

const KNACK3_URL = 'https://marketplace.atlassian.com/vendors/920480808/';

// ── Préréglages portrait (v0.4.0) ─────────────────────────────────────────────
const PORTRAIT_PRESETS = [
    { id: 'iphone15',  label: 'iPhone 15',  width: 390,  height: 844 },
    { id: 'pixel8',    label: 'Pixel 8',    width: 412,  height: 915 },
    { id: 'galaxys24', label: 'Galaxy S24', width: 360,  height: 780 },
    { id: 'ipad',      label: 'iPad',       width: 768,  height: 1024 },
];

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

// ── Historique de navigation (v0.4.0) ─────────────────────────────────────────
// Instancié après loadConfig car on a besoin de app.getPath('userData').
// app.getPath est disponible avant app.whenReady() sur Electron moderne.
let history = null;
app.whenReady().then(() => {}).catch(() => {});
// Initialisation synchrone — HistoryManager gère lui-même l'absence de fichier.
history = new HistoryManager(app.getPath('userData'));

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
        const filename = item.getFilename() || '';
        // "Enregistrer l'image sous…" positionne _pendingImageSavePath avant
        // d'appeler downloadURL(). Ce handler le détecte et laisse passer
        // ce seul téléchargement. Tout le reste reste bloqué.
        if (_pendingImageSavePath) {
            item.setSavePath(_pendingImageSavePath);
            _pendingImageSavePath = null;
            return;
        }
        item.cancel();
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
// Flag : chemin de sauvegarde positionné par "Enregistrer l'image sous…"
// avant downloadURL() pour que will-download laisse passer ce seul téléchargement.
let _pendingImageSavePath = null;

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

    // ── Boutons souris Retour/Avance (v0.4.1) ─────────────────────────────────
    // before-input-event capture les boutons souris 3/4 même dans une webview.
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

    // ── Interception ouvertures de fenêtre (v0.4.1) ──────────────────────────
    // did-attach-webview donne accès aux webContents de chaque <webview> créée
    // dans le renderer. On y installe deux interceptions complémentaires :
    //
    // 1. setWindowOpenHandler — bloque window.open() et tout JS qui tente
    //    d'ouvrir une nouvelle BrowserWindow. Retourner { action: 'deny' }
    //    empêche Electron de créer la fenêtre ; on ouvre un onglet DualView
    //    à la place via IPC → renderer → addTabWithUrl().
    //    C'est le chemin principal depuis Electron 12+.
    //
    // 2. context-menu — menu natif clic droit avec les vrais params Electron
    //    (seul endroit où linkURL, mediaType, selectionText sont disponibles).
    landscapeWin.webContents.on('did-attach-webview', (_event, wvContents) => {

        // Bloquer TOUTE ouverture de nouvelle fenêtre — ouvrir en onglet à la place
        wvContents.setWindowOpenHandler(({ url }) => {
            if (!url || url === 'about:blank') return { action: 'deny' };
            try {
                const parsed = new URL(url);
                if (!['http:', 'https:'].includes(parsed.protocol)) return { action: 'deny' };
            } catch { return { action: 'deny' }; }
            // Envoyer l'URL au renderer pour ouvrir un onglet DualView
            landscapeWin.webContents.send('context-menu-action', { action: 'open-link-new-tab', url });
            return { action: 'deny' };
        });

        // Menu contextuel natif clic droit
        wvContents.on('context-menu', (_e, params) => {
            buildAndShowContextMenu(params, wvContents);
        });
    });
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

// ── IPC : Historique (v0.4.0) ─────────────────────────────────────────────────
// L'alimentation de l'historique se fait depuis le renderer via 'history-add'
// car c'est lui qui connaît le titre de la page (tab.title mis à jour après did-navigate).
ipcMain.on('history-add', (event, { url, title, tabId }) => {
    if (history) history.add({ url, title, tabId });
});

ipcMain.handle('history-get-all', () => {
    return history ? history.getAll() : [];
});

ipcMain.handle('history-get-by-tab', (event, { tabId, limit }) => {
    return history ? history.getByTab(tabId, limit || 10) : [];
});

ipcMain.handle('history-search', (event, { query, limit }) => {
    return history ? history.search(query, limit || 100) : [];
});

ipcMain.on('history-delete-url', (event, { url }) => {
    if (history) history.deleteUrl(url);
});

ipcMain.on('history-clear-all', () => {
    if (history) history.clearAll();
});

ipcMain.on('history-clear-tab', (event, { tabId }) => {
    if (history) history.clearTab(tabId);
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

// ── IPC : Vidéo sync (v0.4.3 — séquençage strict) ────────────────────────────
//
// Principe : chaque action utilisateur génère une SÉQUENCE ordonnée de
// commandes atomiques, avec délai forcé entre elles.
//
// PAUSE  → ① pause()           ② seek-to(t) [+50 ms]
// PLAY   → ① seek-to(t)        ② play()     [+100 ms]
// DRIFT  → seek-to(t) SEULEMENT si vidéo portrait est à l'arrêt
//
// Ceci brise la boucle de rétroaction :
//   - portrait ne force JAMAIS currentTime pendant une lecture
//   - aucun seeked ne peut donc être déclenché depuis portrait vers landscape
//
// Les délais garantissent l'ordre d'exécution même si l'IPC est légèrement
// asynchrone. Les valeurs (50 ms / 100 ms) sont des minimums conservateurs.

ipcMain.on('video-pause', (e, t) => {
    if (syncState !== 'active') return;
    const p = portraitWin;
    if (!p || p.isDestroyed()) return;
    // ① Mettre en pause immédiatement
    p.webContents.send('video-cmd', { action: 'pause', currentTime: t });
    // ② Aligner la position 50 ms après (vidéo déjà à l'arrêt, sans risque de seeked)
    setTimeout(() => {
        if (!p.isDestroyed()) p.webContents.send('video-cmd', { action: 'seek-to', currentTime: t });
    }, 50);
});

ipcMain.on('video-play', (e, t) => {
    if (syncState !== 'active') return;
    const p = portraitWin;
    if (!p || p.isDestroyed()) return;
    // ① Aligner la position AVANT de lancer la lecture
    p.webContents.send('video-cmd', { action: 'seek-to', currentTime: t });
    // ② Lancer la lecture 100 ms après (seek-to terminé, aucun play en cours)
    setTimeout(() => {
        if (!p.isDestroyed()) p.webContents.send('video-cmd', { action: 'play', currentTime: t });
    }, 100);
});

// Sync périodique (drift guard) — envoyée seulement quand landscape est en lecture.
// Portrait n'applique ce seek-to QUE si sa propre vidéo est à l'arrêt (paused).
// Cela évite toute boucle de rétroaction quand les deux fenêtres lisent normalement.
ipcMain.on('video-drift-check', (e, t) => {
    if (syncState !== 'active') return;
    const p = portraitWin;
    if (!p || p.isDestroyed()) return;
    p.webContents.send('video-cmd', { action: 'drift-check', currentTime: t });
});

// ── IPC : Pub YouTube détectée dans le paysage ────────────────────────────────
// Payload : { isAd: bool, remaining: number|null }
// Relayé au portrait pour afficher/masquer l'overlay pub.
ipcMain.on('ad-state', (e, payload) => {
    if (portraitWin && !portraitWin.isDestroyed()) {
        portraitWin.webContents.send('ad-state', payload);
    }
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

// ── IPC : Redimensionnement Portrait v0.4.0 ───────────────────────────────────
let resizeMode = false;

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
    configSet('portraitWindow.width', preset.width);
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
    // Restaurer taille sauvegardée avant la session
    const savedW = configGet('portraitWindow.width') || 390;
    const savedH = configGet('portraitWindow.height') || 844;
    portraitWin.setResizable(true);
    portraitWin.setSize(savedW, savedH);
    portraitWin.setResizable(false);
    portraitWin.webContents.send('resize-mode', false);
});

// ── IPC : Screenshot v0.4.0 ───────────────────────────────────────────────────
ipcMain.handle('take-screenshot', async () => {
    try {
        let dir = configGet('settings.screenshotDir') || '';
        if (!dir) dir = path.join(app.getPath('pictures'), 'DualView');
        fs.mkdirSync(dir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const results = [];
        if (landscapeWin && !landscapeWin.isDestroyed()) {
            const img = await landscapeWin.webContents.capturePage();
            const filePath = path.join(dir, `dualview_${ts}_paysage.png`);
            fs.writeFileSync(filePath, img.toPNG());
            results.push(filePath);
        }
        if (portraitWin && !portraitWin.isDestroyed()) {
            const img = await portraitWin.webContents.capturePage();
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

// ── IPC : Menu contextuel clic droit (v0.4.1) ────────────────────────────────
// Le renderer envoie les paramètres de contexte (lien, image, sélection…)
// et main construit le menu natif pour garantir l'intégration OS.
// ── Menu contextuel natif (v0.4.1) ──────────────────────────────────────────
// Construit et affiche le menu natif OS en fonction du contexte du clic droit.
// Appelé directement depuis did-attach-webview → wvContents.on('context-menu').
// Les params Electron sont complets ici (linkURL, mediaType, selectionText…)
// contrairement à l'événement 'context-menu' d'une <webview> côté renderer.
function buildAndShowContextMenu(params, wvContents) {
    if (!landscapeWin || landscapeWin.isDestroyed()) return;
    const menu = new Menu();
    const lang = configGet('settings.language') || 'fr';
    const isFr = lang === 'fr';

    // ── Lien ──────────────────────────────────────────────────────────────────
    if (params.linkURL && params.linkURL.startsWith('http')) {
        menu.append(new MenuItem({
            label: isFr ? 'Ouvrir dans un nouvel onglet' : 'Open in new tab',
            click() {
                landscapeWin.webContents.send('context-menu-action', { action: 'open-link-new-tab', url: params.linkURL });
            }
        }));
        menu.append(new MenuItem({
            label: isFr ? "Copier l'adresse du lien" : 'Copy link address',
            click() { clipboard.writeText(params.linkURL); }
        }));
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // ── Image ─────────────────────────────────────────────────────────────────
    if (params.mediaType === 'image' && params.srcURL) {
        menu.append(new MenuItem({
            label: isFr ? "Enregistrer l'image sous…" : 'Save image as…',
            async click() {
                let ext = 'png';
                try { ext = params.srcURL.split('?')[0].split('.').pop().toLowerCase() || 'png'; } catch { }
                if (!['png','jpg','jpeg','gif','webp','svg','avif','bmp','ico'].includes(ext)) ext = 'png';
                const defaultName = params.srcURL.split('/').pop().split('?')[0] || ('image.' + ext);
                const { canceled, filePath } = await dialog.showSaveDialog(landscapeWin, {
                    title: isFr ? "Enregistrer l'image" : 'Save image',
                    defaultPath: path.join(app.getPath('pictures'), defaultName),
                    filters: [{ name: 'Images', extensions: [ext, 'png', 'jpg', 'webp'] }],
                });
                if (canceled || !filePath) return;
                // Positionner le flag AVANT downloadURL : le handler will-download
                // global lira _pendingImageSavePath et laissera passer ce téléchargement.
                _pendingImageSavePath = filePath;
                wvContents.downloadURL(params.srcURL);
            }
        }));
        menu.append(new MenuItem({
            label: isFr ? "Copier l'adresse de l'image" : 'Copy image address',
            click() { clipboard.writeText(params.srcURL); }
        }));
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // ── Texte sélectionné ─────────────────────────────────────────────────────
    if (params.selectionText && params.selectionText.trim()) {
        const sel = params.selectionText.trim();
        const displaySel = sel.length > 20 ? sel.slice(0, 20) + '…' : sel;
        if (params.isEditable) {
            menu.append(new MenuItem({
                label: isFr ? 'Couper' : 'Cut',
                click() { wvContents.cut(); }
            }));
        }
        menu.append(new MenuItem({
            label: isFr ? 'Copier' : 'Copy',
            click() { wvContents.copy(); }
        }));
        if (params.isEditable) {
            menu.append(new MenuItem({
                label: isFr ? 'Coller' : 'Paste',
                click() { wvContents.paste(); }
            }));
        }
        menu.append(new MenuItem({
            label: isFr ? `Rechercher "${displaySel}"` : `Search "${displaySel}"`,
            click() {
                landscapeWin.webContents.send('context-menu-action', { action: 'search-selection', text: sel });
            }
        }));
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // ── Champ de saisie sans sélection ───────────────────────────────────────
    if (params.isEditable && !(params.selectionText && params.selectionText.trim())) {
        menu.append(new MenuItem({
            label: isFr ? 'Coller' : 'Paste',
            click() { wvContents.paste(); }
        }));
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // ── Page (toujours présent) ───────────────────────────────────────────────
    menu.append(new MenuItem({
        label: isFr ? 'Recharger' : 'Reload',
        click() { landscapeWin.webContents.send('context-menu-action', { action: 'reload' }); }
    }));
    menu.append(new MenuItem({
        label: isFr ? "Copier l'URL de la page" : 'Copy page URL',
        click() { landscapeWin.webContents.send('context-menu-action', { action: 'copy-page-url' }); }
    }));

    // Mode dev uniquement : Inspecter l'élément
    if (logger.IS_DEV) {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
            label: isFr ? 'Inspecter' : 'Inspect element',
            click() { wvContents.inspectElement(params.x, params.y); }
        }));
    }

    menu.popup({ window: landscapeWin });
}

ipcMain.handle('choose-screenshot-dir', async () => {
    const result = await dialog.showOpenDialog(landscapeWin, {
        title: 'Dossier de capture',
        properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const dir = result.filePaths[0];
    configSet('settings.screenshotDir', dir);
    return dir;
});

ipcMain.handle('get-store', () => ({
    tabs: configGet('tabs') || DEFAULTS.tabs,
    activeTabId: configGet('activeTabId') || DEFAULTS.activeTabId,
    settings: configGet('settings') || Object.assign({}, SETTINGS_DEFAULTS),
}));

// Paramètre mute auto portrait — accessible depuis portrait au démarrage
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
        // v0.4.0
        searchEngineId: v => typeof v === 'string' && v.length > 0,
        searchEngineUrl: v => typeof v === 'string' && v.startsWith('http'),
        searchEngineName: v => typeof v === 'string',
        customSearchEngines: v => Array.isArray(v),
        screenshotDir: v => typeof v === 'string',
        portraitPreset: v => typeof v === 'string',
        autoMutePortrait: v => typeof v === 'boolean',
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
    // Notifier portrait si autoMutePortrait a changé (effet immédiat)
    if (settings.autoMutePortrait !== undefined && portraitWin && !portraitWin.isDestroyed()) {
        portraitWin.webContents.send('auto-mute-portrait-changed', current.autoMutePortrait);
    }
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

app.on('window-all-closed', () => {
    if (history) history.saveNow();
    obsControl.stop();
    app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createLandscapeWindow();
        createPortraitWindow();
    }
});