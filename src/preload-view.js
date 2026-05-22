/**
 * DualView - Preload View Windows (portrait)
 * Version: 0.2.6
 *
 * Changements v0.2.6 :
 * - Nouveaux canaux : tab-switched, tab-closed, tab-created
 * - load-url reçoit maintenant { tabId, url } au lieu d'une chaîne brute
 *   (pour cibler la bonne webview du pool)
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
    getTheme: () => ipcRenderer.invoke('get-theme'),

    on: (channel, callback) => {
        const valid = [
            // Canaux existants
            'load-url', 'apply-scroll', 'theme-changed', 'resize-mode',
            'video-cmd', 'webview-go-back', 'webview-go-forward',
            'reload-webview',
            // Nouveaux canaux pool d'onglets
            'tab-switched', 'tab-closed', 'tab-created',
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});