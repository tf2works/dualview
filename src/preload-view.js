/**
 * DualView - Preload View Windows (Paysage & Portrait)
 * Expose les APIs IPC sécurisées aux fenêtres de visualisation
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
  // Récupérer le thème
  getTheme: () => ipcRenderer.invoke('get-theme'),

  // Récupérer l'URL courante
  getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),

  // Envoyer un événement de scroll (paysage → main)
  sendScroll: (scrollPercent) => ipcRenderer.send('sync-scroll', scrollPercent),

  // Envoyer un événement de navigation (paysage → main)
  sendNavigate: (url) => ipcRenderer.send('sync-navigate', url),

  // Écouter les événements
  on: (channel, callback) => {
    const validChannels = ['load-url', 'apply-scroll', 'theme-changed', 'resize-mode'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
