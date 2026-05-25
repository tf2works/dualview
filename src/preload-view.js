/**
 * DualView - Preload View Windows (portrait)
 * Version: 0.3.1
 *
 * Changements v0.3.1 :
 * - Canaux : sync-state-changed, show-login-popup, sync-resume-state
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
    getTheme: () => ipcRenderer.invoke('get-theme'),
    getSyncState: () => ipcRenderer.invoke('get-sync-state'),

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
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});