/**
 * DualView - Preload View Windows
 * Version: 0.2.2
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
    // Récupérer le thème
    getTheme: () => ipcRenderer.invoke('get-theme'),
    // Récupérer l'URL courante
    getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),
    // Envoyer un événement de scroll (paysage → main)
    sendScroll: (p) => ipcRenderer.send('sync-scroll', p),
    // Envoyer un événement de navigation (paysage → main)
    sendNavigate: (u) => ipcRenderer.send('sync-navigate', u),
    // Envoyer une instruction pour mettre la vidéo de la fenêtre portrait en lecture
    sendVideoPlay: (t) => ipcRenderer.send('video-play', t),
    // Envoyer une instruction pour mettre la vidéo de la fenêtre portrait en pause
    sendVideoPause: (t) => ipcRenderer.send('video-pause', t),
    // Envoyer une instruction pour mettre à jour le niveau la vidéo de la fenêtre portrait
    sendVideoTimeUpdate: (t) => ipcRenderer.send('video-timeupdate', t),
    // Envoyer une instruction pour vérifier l'état de la vidéo
    sendVideoState: (s) => ipcRenderer.send('video-state', s),
    // Envoyer l'etat nav depuis le renderer (pas depuis main)
    notifyNavState: (state) => ipcRenderer.send('notify-nav-state', state),

    on: (channel, callback) => {
        const valid = [
            'load-url', 'apply-scroll', 'theme-changed', 'resize-mode',
            'video-cmd', 'video-state',
            // Commandes goBack/goForward envoyes au renderer
            'webview-go-back', 'webview-go-forward'
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
  off: (channel, callback) => ipcRenderer.removeListener(channel, callback)
});