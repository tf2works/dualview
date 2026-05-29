/**
 * DualView - IPC History
 * Version: 0.4.2
 *
 * Handlers IPC liés à l'historique de navigation (v0.4.0) :
 *   history-add, history-get-all, history-get-by-tab,
 *   history-search, history-delete-url,
 *   history-clear-all, history-clear-tab
 */

'use strict';

const { ipcMain } = require('electron');

/**
 * @param {object} ctx
 * @param {Function} ctx.getHistory   () => HistoryManager | null
 */
function register(ctx) {
    const { getHistory } = ctx;

    // L'alimentation de l'historique se fait depuis le renderer car c'est lui
    // qui connaît le titre de la page (mis à jour après did-navigate).
    ipcMain.on('history-add', (event, { url, title, tabId }) => {
        const h = getHistory();
        if (h) h.add({ url, title, tabId });
    });

    ipcMain.handle('history-get-all', () => {
        const h = getHistory();
        return h ? h.getAll() : [];
    });

    ipcMain.handle('history-get-by-tab', (event, { tabId, limit }) => {
        const h = getHistory();
        return h ? h.getByTab(tabId, limit || 10) : [];
    });

    ipcMain.handle('history-search', (event, { query, limit }) => {
        const h = getHistory();
        return h ? h.search(query, limit || 100) : [];
    });

    ipcMain.on('history-delete-url', (event, { url }) => {
        const h = getHistory();
        if (h) h.deleteUrl(url);
    });

    ipcMain.on('history-clear-all', () => {
        const h = getHistory();
        if (h) h.clearAll();
    });

    ipcMain.on('history-clear-tab', (event, { tabId }) => {
        const h = getHistory();
        if (h) h.clearTab(tabId);
    });
}

module.exports = { register };
