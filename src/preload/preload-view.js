/**
 * DualView - Preload View Windows (portrait)
 * Version: 0.4.6
 *
 * Changements v0.4.6 :
 * - Fix thème portrait au démarrage : initialTheme exposé via contextBridge
 *   (document est null dans le preload avec contextIsolation:true).
 *   Le renderer applique data-theme en toute première ligne de portrait-app.js.
 *   Corrige le bug "portrait reste sombre apres switch vers theme clair
 *   quand l'OS est en mode sombre".
 *
 * Changements v0.4.3 :
 * - Protocole video sequenced : 'video-cmd' recoit les actions
 *   'pause', 'seek-to', 'play', 'drift-check'.
 *
 * Changements v0.3.1 :
 * - Canaux : sync-state-changed, show-login-popup, sync-resume-state
 */
const { contextBridge, ipcRenderer } = require('electron');

// ── Thème initial ─────────────────────────────────────────────────────────────
// Passé par main.js via additionalArguments '--initial-theme=light|dark'.
// document est null ici (contextIsolation:true) → on expose la valeur via
// contextBridge ; le renderer l'applique synchroniquement en première ligne.
const _themeArg = process.argv.find(a => a.startsWith('--initial-theme='));
const _initialTheme = (_themeArg && (_themeArg.split('=')[1] === 'light' || _themeArg.split('=')[1] === 'dark'))
    ? _themeArg.split('=')[1]
    : null;

contextBridge.exposeInMainWorld('dualview', {
    initialTheme: _initialTheme,
    getTheme: () => ipcRenderer.invoke('get-theme'),
    getSyncState: () => ipcRenderer.invoke('get-sync-state'),
    getAutoMutePortrait: () => ipcRenderer.invoke('get-auto-mute-portrait'),

    on: (channel, callback) => {
        const valid = [
            'load-url', 'apply-scroll', 'theme-changed', 'resize-mode',
            'video-cmd', 'webview-go-back', 'webview-go-forward',
            'reload-webview',
            'tab-switched', 'tab-closed', 'tab-created',
            'sync-state-changed', 'show-login-popup', 'login-page-cleared', 'sync-resume-state',
            'ad-state',
            'auto-mute-portrait-changed',
        ];
        if (valid.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
});