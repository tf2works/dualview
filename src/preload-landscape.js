/**
 * DualView - Preload Landscape Window
 * Version: 0.2.6
 *
 * Changements v0.2.6 :
 * - switchTab(tabId)  : notifie main du switch d'onglet (main relaie à portrait)
 * - closeTab(tabId)   : notifie main de la fermeture (main relaie à portrait)
 * - createTab(tabId, url) : notifie main de la création (main relaie à portrait)
 * - getCurrentUrl retiré (plus de currentUrl global, géré par onglet)
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

    // ── Contrôle navigation ────────────────────────────────────
    navigate: (url) => ipcRenderer.send('navigate', url),
    navBack: () => ipcRenderer.send('nav-back'),
    navForward: () => ipcRenderer.send('nav-forward'),
    reloadViews: () => ipcRenderer.send('reload-views'),
    pauseSync: () => ipcRenderer.send('sync-pause'),
    resumeSync: () => ipcRenderer.send('sync-resume'),
    relaunchApp: () => ipcRenderer.send('relaunch-app'),

    // ── Gestion des onglets (pool webviews) ────────────────────
    // Notifie main + portrait du switch d'onglet actif
    switchTab: (tabId) => ipcRenderer.send('tab-switched', tabId),
    // Notifie main + portrait de la fermeture d'un onglet (destruction immédiate)
    closeTab: (tabId) => ipcRenderer.send('tab-closed', tabId),
    // Notifie main + portrait de la création d'un nouvel onglet
    createTab: (tabId, url) => ipcRenderer.send('tab-created', { tabId, url }),

    // ── Store / persistance ────────────────────────────────────
    getStore: () => ipcRenderer.invoke('get-store'),
    saveTabs: (data) => ipcRenderer.send('save-tabs', data),
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    getVersion: () => ipcRenderer.invoke('get-version'),
    getHomepageUrl: () => ipcRenderer.invoke('get-homepage-url'),

    // ── Listeners ──────────────────────────────────────────────
    on: (channel, callback) => {
        const valid = [
            'load-url', 'theme-changed', 'update-addressbar',
            'nav-state-changed', 'webview-go-back', 'webview-go-forward',
            'download-blocked',
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});