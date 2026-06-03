/**
 * DualView - Preload Landscape Window
 * Version: 0.4.1
 *
 * Changements v0.4.1 :
 * - Canaux entrants 'mouse-nav', 'context-menu-action'
 *
 * Changements v0.4.0 :
 * - getPortraitPresets()            : liste des préréglages portrait
 * - startPortraitResize()           : démarre le mode redimensionnement
 * - applyPortraitPreset(presetId)   : applique un preset via IPC
 * - finishPortraitResize()          : valide et verrouille la taille
 * - cancelPortraitResize()          : annule sans modifier la taille
 * - takeScreenshot()                : capture les deux vues en PNG
 * - chooseScreenshotDir()           : sélectionne un dossier de capture
 * - historyAdd/GetAll/GetByTab/Search/DeleteUrl/ClearAll/ClearTab
 *
 * Changements v0.3.2 :
 * - getObsInfo()                  : infos serveur de contrôle OBS
 * - Canal entrant 'obs-command'   : commandes provenant du dock/hotkeys OBS
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
    // ── Sync vue ───────────────────────────────────────────────
    getTheme: () => ipcRenderer.invoke('get-theme'),
    sendScroll: (p) => ipcRenderer.send('sync-scroll', p),
    sendNavigate: (u) => ipcRenderer.send('sync-navigate', u),
    sendVideoPlay: (t) => ipcRenderer.send('video-play', t),
    sendVideoPause: (t) => ipcRenderer.send('video-pause', t),
    sendVideoTimeUpdate: (t) => ipcRenderer.send('video-timeupdate', t),
    sendAdState: (payload) => ipcRenderer.send('ad-state', payload),
    notifyNavState: (s) => ipcRenderer.send('notify-nav-state', s),

    // ── Contrôle sync ──────────────────────────────────────────
    syncControl: (action) => ipcRenderer.send('sync-control', action),
    getSyncState: () => ipcRenderer.invoke('get-sync-state'),

    // ── Contrôle navigation ────────────────────────────────────
    navigate: (url) => ipcRenderer.send('navigate', url),
    navBack: () => ipcRenderer.send('nav-back'),
    navForward: () => ipcRenderer.send('nav-forward'),
    reloadViews: () => ipcRenderer.send('reload-views'),
    pauseSync: () => ipcRenderer.send('sync-pause'),
    resumeSync: () => ipcRenderer.send('sync-resume'),
    relaunchApp: () => ipcRenderer.send('relaunch-app'),

    // ── Onglets (pool webviews) ────────────────────────────────
    switchTab: (tabId) => ipcRenderer.send('tab-switched', tabId),
    closeTab: (tabId) => ipcRenderer.send('tab-closed', tabId),
    createTab: (tabId, url) => ipcRenderer.send('tab-created', { tabId, url }),

    // ── Détection page de connexion ────────────────────────────
    notifyLoginPage: (url, tabId) => ipcRenderer.send('login-page-detected', { url, tabId }),
    notifyLoginPageLeft: (tabId) => ipcRenderer.send('login-page-left', { tabId }),

    // ── Services connectés ─────────────────────────────────────
    getConnectedServicesStatus: () => ipcRenderer.invoke('get-connected-services-status'),
    openAuthWindow: (opts) => ipcRenderer.invoke('open-auth-window', opts),
    disconnectService: (opts) => ipcRenderer.invoke('disconnect-service', opts),
    deleteCustomService: (opts) => ipcRenderer.invoke('delete-custom-service', opts),
    confirmCustomAuth: (confirmed) => ipcRenderer.send('auth-custom-confirmed', confirmed),
    cancelCustomAuth: () => ipcRenderer.send('auth-custom-cancelled'),

    // ── Store / persistance ────────────────────────────────────
    getIsDev: () => ipcRenderer.invoke('get-is-dev'),
    toggleDevTools: () => ipcRenderer.send('toggle-dev-tools'),
    getStore: () => ipcRenderer.invoke('get-store'),
    saveTabs: (data) => ipcRenderer.send('save-tabs', data),
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    getVersion: () => ipcRenderer.invoke('get-version'),
    getHomepageUrl: () => ipcRenderer.invoke('get-homepage-url'),

    // ── Intégration OBS (v0.3.2) ───────────────────────────────
    getObsInfo: () => ipcRenderer.invoke('get-obs-info'),

    // ── Portrait resize (v0.4.0) ───────────────────────────────
    getPortraitPresets: () => ipcRenderer.invoke('get-portrait-presets'),
    startPortraitResize: () => ipcRenderer.send('start-portrait-resize'),
    applyPortraitPreset: (presetId) => ipcRenderer.send('apply-portrait-preset', { presetId }),
    finishPortraitResize: () => ipcRenderer.send('finish-portrait-resize'),
    cancelPortraitResize: () => ipcRenderer.send('cancel-portrait-resize'),

    // ── Screenshot (v0.4.0) ────────────────────────────────────
    takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
    chooseScreenshotDir: () => ipcRenderer.invoke('choose-screenshot-dir'),

    // ── Historique (v0.4.0) ────────────────────────────────────
    historyAdd: (url, title, tabId) => ipcRenderer.send('history-add', { url, title, tabId }),
    historyGetAll: () => ipcRenderer.invoke('history-get-all'),
    historyGetByTab: (tabId, limit) => ipcRenderer.invoke('history-get-by-tab', { tabId, limit }),
    historySearch: (query, limit) => ipcRenderer.invoke('history-search', { query, limit }),
    historyDeleteUrl: (url) => ipcRenderer.send('history-delete-url', { url }),
    historyClearAll: () => ipcRenderer.send('history-clear-all'),
    historyClearTab: (tabId) => ipcRenderer.send('history-clear-tab', { tabId }),

    // ── Listeners ──────────────────────────────────────────────
    on: (channel, callback) => {
        const valid = [
            'load-url', 'theme-changed', 'update-addressbar',
            'nav-state-changed', 'webview-go-back', 'webview-go-forward',
            'download-blocked',
            // v0.3.0
            'sync-state-changed', 'show-login-popup', 'login-page-cleared',
            'auth-custom-confirm', 'sync-resume-state',
            // v0.3.2
            'obs-command',
            // v0.4.1
            'mouse-nav', 'context-menu-action',
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});