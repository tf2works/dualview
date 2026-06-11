/**
 * DualView - Preload Landscape Window
 * Version: 0.4.7
 *
 * Changements v0.4.7 :
 * - API favoris exposée via contextBridge :
 *   favoritesAdd, favoritesRemove, favoritesIs, favoritesGetAll, favoritesSearch
 *
 * Changements v0.4.6 :
 * - Fix theme au demarrage : initialTheme expose via contextBridge
 *   (document est null dans le preload avec contextIsolation:true).
 *   Le renderer applique data-theme en toute premiere ligne de landscape-ui.js.
 *
 * Changements v0.4.3 :
 * - sendVideoDriftCheck() remplace sendVideoTimeUpdate()
 *
 * Changements v0.4.1 :
 * - Canaux entrants 'mouse-nav', 'context-menu-action'
 *
 * Changements v0.4.0 :
 * - getPortraitPresets, startPortraitResize, applyPortraitPreset,
 *   finishPortraitResize, cancelPortraitResize, takeScreenshot,
 *   chooseScreenshotDir, history*
 *
 * Changements v0.3.2 :
 * - getObsInfo(), canal entrant 'obs-command'
 */
const { contextBridge, ipcRenderer } = require('electron');

// ── Thème initial ─────────────────────────────────────────────────────────────
// Passé par main.js via additionalArguments '--initial-theme=light|dark'.
// document est null ici (contextIsolation:true) → on expose la valeur via
// contextBridge ; le renderer l'applique synchroniquement en premiere ligne.
const _themeArg = process.argv.find(a => a.startsWith('--initial-theme='));
const _initialTheme = (_themeArg && (_themeArg.split('=')[1] === 'light' || _themeArg.split('=')[1] === 'dark'))
    ? _themeArg.split('=')[1]
    : null;

contextBridge.exposeInMainWorld('dualview', {
    initialTheme: _initialTheme,

    // ── Sync vue ───────────────────────────────────────────────
    getTheme: () => ipcRenderer.invoke('get-theme'),
    sendScroll: (p) => ipcRenderer.send('sync-scroll', p),
    sendNavigate: (u) => ipcRenderer.send('sync-navigate', u),
    sendVideoPlay: (t) => ipcRenderer.send('video-play', t),
    sendVideoPause: (t) => ipcRenderer.send('video-pause', t),
    sendVideoDriftCheck: (t) => ipcRenderer.send('video-drift-check', t),
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
    addCustomService: (label, url) => ipcRenderer.invoke('add-custom-service', { label, url }),
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
    // ── Export config OBS (v0.5.0) ───────────────────────────
    obsExportConfig: () => ipcRenderer.invoke('obs-export-config'),

    // ── Réouverture portrait (v0.5.0) ─────────────────────────
    reopenPortrait: () => ipcRenderer.invoke('reopen-portrait'),
    // Envoie un message au portrait via main.js (v0.5.0 — top domaines)
    sendToPortrait: (channel, data) => ipcRenderer.send('send-to-portrait', { channel, data }),

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

    // ── Favoris (v0.4.7) ──────────────────────────────────────
    favoritesAdd:    (url, title) => ipcRenderer.invoke('favorites-add',    { url, title }),
    favoritesRemove: (url)        => ipcRenderer.invoke('favorites-remove',  { url }),
    favoritesIs:     (url)        => ipcRenderer.invoke('favorites-is',      { url }),
    favoritesGetAll: ()           => ipcRenderer.invoke('favorites-get-all'),
    favoritesSearch: (query, limit) => ipcRenderer.invoke('favorites-search', { query, limit }),

    // ── Listeners ──────────────────────────────────────────────
    on: (channel, callback) => {
        const valid = [
            'load-url', 'theme-changed', 'update-addressbar',
            'nav-state-changed', 'webview-go-back', 'webview-go-forward',
            'download-blocked',
            'sync-state-changed', 'show-login-popup', 'login-page-cleared',
            'auth-custom-confirm', 'sync-resume-state',
            'obs-command',
            'mouse-nav', 'context-menu-action',
            'portrait-status',
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});