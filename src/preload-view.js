/**
 * DualView - Preload View Windows
 * Version: 0.2.2
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
    getTheme: () => ipcRenderer.invoke('get-theme'),
    getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),
    sendScroll: (p) => ipcRenderer.send('sync-scroll', p),
    sendNavigate: (u) => ipcRenderer.send('sync-navigate', u),
    sendVideoPlay: (t) => ipcRenderer.send('video-play', t),
    sendVideoPause: (t) => ipcRenderer.send('video-pause', t),
    sendVideoTimeUpdate: (t) => ipcRenderer.send('video-timeupdate', t),
    sendVideoState: (s) => ipcRenderer.send('video-state', s),
    // FIX v0.2.2 : envoyer l'etat nav depuis le renderer (pas depuis main)
    notifyNavState: (state) => ipcRenderer.send('notify-nav-state', state),

    on: (channel, callback) => {
        const valid = [
            'load-url', 'apply-scroll', 'theme-changed', 'resize-mode',
            'video-cmd', 'video-state',
            // FIX v0.2.2 : commandes goBack/goForward envoyes au renderer
            'webview-go-back', 'webview-go-forward'
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback)
});