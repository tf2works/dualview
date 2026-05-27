/**
 * DualView - Preload Landscape Window
 * Version: 0.3.2
 *
 * Changements v0.3.2 :
 * - getObsInfo()                  : infos serveur de contrôle OBS
 * - Canal entrant 'obs-command'   : commandes provenant du dock/hotkeys OBS
 *
 * Changements v0.3.1 :
 * - syncControl(action)           : pause / resume / restart
 * - getSyncState()                : état courant de la sync
 * - getConnectedServicesStatus()  : statuts cookies services
 * - openAuthWindow(opts)          : ouvre fenêtre auth service
 * - disconnectService(opts)       : supprime cookies service
 * - deleteCustomService(opts)     : supprime service perso
 * - Canaux entrants : sync-state-changed, show-login-popup,
 *                     auth-custom-confirm, sync-resume-state
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
    // Confirmation auth personnalisée
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
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});