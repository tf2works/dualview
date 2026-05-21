/**
 * DualView - Preload Landscape Window
 * Version: 0.2.4
 *
 * Fusion de preload-control.js et preload-view.js.
 * La fenetre paysage integre desormais la barre de controle.
 * preload-control.js est supprime.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {

    // ── API vue (ex preload-view.js) ────────────────────────────
    // Récupérer le thème
    getTheme: () => ipcRenderer.invoke('get-theme'),
    getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),
    sendScroll: (p) => ipcRenderer.send('sync-scroll', p),
    sendNavigate: (u) => ipcRenderer.send('sync-navigate', u),
    sendVideoPlay: (t) => ipcRenderer.send('video-play', t),
    sendVideoPause: (t) => ipcRenderer.send('video-pause', t),
    sendVideoTimeUpdate: (t) => ipcRenderer.send('video-timeupdate', t),
    sendVideoState: (s) => ipcRenderer.send('video-state', s),
    notifyNavState: (state) => ipcRenderer.send('notify-nav-state', state),

    // ── API controle (ex preload-control.js) ────────────────────
    // Naviguer vers une URL
    navigate: (url) => ipcRenderer.send('navigate', url),
    // Récupérer les données du store (onglets, version)
    getStore: () => ipcRenderer.invoke('get-store'),
    // Sauvegarder les onglets
    saveTabs: (data) => ipcRenderer.send('save-tabs', data),
    // Récupérer la version de l'app
    getVersion: () => ipcRenderer.invoke('get-version'),
    // Navigue vers la page précédente
    navBack: () => ipcRenderer.send('nav-back'),
    // Navigue vers la page suivante
    navForward: () => ipcRenderer.send('nav-forward'),
    // Pause synchronisation (pour redimensionnement)
    pauseSync: () => ipcRenderer.send('sync-pause'),
    // Reprendre synchronisation
    resumeSync: () => ipcRenderer.send('sync-resume'),

    // ── Listener unifie ─────────────────────────────────────────
    on: (channel, callback) => {
        const valid = [
            // canaux vue
            'load-url', 'apply-scroll', 'theme-changed',
            'video-cmd', 'video-state',
            'webview-go-back', 'webview-go-forward',
            // canaux controle
            'update-addressbar', 'nav-state-changed',
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});