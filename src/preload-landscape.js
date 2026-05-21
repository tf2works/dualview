/**
 * DualView - Preload Landscape Window
 * Version: 0.2.5
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
    // ── Vue ────────────────────────────────────────────────────
    getTheme: () => ipcRenderer.invoke('get-theme'),
    getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),
    sendScroll: (p) => ipcRenderer.send('sync-scroll', p),
    sendNavigate: (u) => ipcRenderer.send('sync-navigate', u),
    sendVideoPlay: (t) => ipcRenderer.send('video-play', t),
    sendVideoPause: (t) => ipcRenderer.send('video-pause', t),
    sendVideoTimeUpdate: (t) => ipcRenderer.send('video-timeupdate', t),
    notifyNavState: (state) => ipcRenderer.send('notify-nav-state', state),

    // ── Controle ───────────────────────────────────────────────
    // Naviguer vers une URL
    navigate: (url) => ipcRenderer.send('navigate', url),
    // Récupérer les données du store (onglets, version)
    getStore: () => ipcRenderer.invoke('get-store'),
    // Sauvegarder les onglets
    saveTabs: (data) => ipcRenderer.send('save-tabs', data),
    // Sauvegarder les paramètres utilisateurs
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    // Récupérer la version de l'app
    getVersion: () => ipcRenderer.invoke('get-version'),
    // Navigue vers la page d'accueil
    getHomepageUrl: () => ipcRenderer.invoke('get-homepage-url'),
    // Navigue vers la page précédente
    navBack: () => ipcRenderer.send('nav-back'),
    // Navigue vers la page suivante
    navForward: () => ipcRenderer.send('nav-forward'),
    // Recharger le contenu des pages
    reloadViews: () => ipcRenderer.send('reload-views'),
    // Pause synchronisation (pour redimensionnement)
    pauseSync: () => ipcRenderer.send('sync-pause'),
    // Reprendre synchronisation
    resumeSync: () => ipcRenderer.send('sync-resume'),
    // Relancer l'application pour appliquer des paramètres
    relaunchApp: () => ipcRenderer.send('relaunch-app'),

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