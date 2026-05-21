/**
 * DualView - Preload View Windows (portrait)
 * Version: 0.2.5
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
    getTheme: () => ipcRenderer.invoke('get-theme'),
    getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),

    on: (channel, callback) => {
        const valid = [
            'load-url', 'apply-scroll', 'theme-changed', 'resize-mode',
            'video-cmd', 'webview-go-back', 'webview-go-forward',
            'reload-webview',
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});