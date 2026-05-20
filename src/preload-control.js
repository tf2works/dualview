/**
 * DualView - Preload Control Window
 * Expose les APIs IPC sécurisées à la fenêtre de contrôle
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dualview', {
  // Naviguer vers une URL
  navigate: (url) => ipcRenderer.send('navigate', url),

  // Récupérer le thème
  getTheme: () => ipcRenderer.invoke('get-theme'),

  // Récupérer les données du store (onglets, version)
  getStore: () => ipcRenderer.invoke('get-store'),

  // Sauvegarder les onglets
  saveTabs: (data) => ipcRenderer.send('save-tabs', data),

  // Pause synchronisation (pour redimensionnement)
  pauseSync: () => ipcRenderer.send('sync-pause'),

  // Reprendre synchronisation
  resumeSync: () => ipcRenderer.send('sync-resume'),

  // Récupérer la version de l'app
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Écouter les événements
  on: (channel, callback) => {
    const validChannels = ['theme-changed', 'update-addressbar'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
