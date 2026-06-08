/**
 * DualView - Preload View Windows (portrait)
 * Version: 0.4.3
 *
 * Changements v0.4.3 :
 * - Protocole vidéo séquencé : 'video-cmd' reçoit désormais les actions
 *   'pause', 'seek-to', 'play', 'drift-check' (au lieu de 'pause'/'play'/'seek').
 *   La logique anti-boucle est dans VIDEO_EXECUTOR_SCRIPT (portrait.html).
 *
 * Changements v0.3.1 :
 * - Canaux : sync-state-changed, show-login-popup, sync-resume-state
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
    getTheme: () => ipcRenderer.invoke('get-theme'),
    getSyncState: () => ipcRenderer.invoke('get-sync-state'),
    getAutoMutePortrait: () => ipcRenderer.invoke('get-auto-mute-portrait'),

    on: (channel, callback) => {
        const valid = [
            // Canaux existants
            'load-url', 'apply-scroll', 'theme-changed', 'resize-mode',
            'video-cmd', 'webview-go-back', 'webview-go-forward',
            'reload-webview',
            // Pool d'onglets
            'tab-switched', 'tab-closed', 'tab-created',
            // v0.3.0
            'sync-state-changed', 'show-login-popup', 'login-page-cleared', 'sync-resume-state',
            // v0.4.2
            'ad-state',
            // v0.4.3
            'auto-mute-portrait-changed',
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});