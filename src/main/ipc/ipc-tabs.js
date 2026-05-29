/**
 * DualView - IPC Tabs
 * Version: 0.4.2
 *
 * Handlers IPC liés aux onglets :
 *   tab-switched, tab-closed, tab-created, save-tabs
 */

'use strict';

const { ipcMain }     = require('electron');
const { sanitizeUrl } = require('../security');

/**
 * @param {object} ctx
 * @param {Function} ctx.getLandscapeWin
 * @param {Function} ctx.getPortraitWin
 * @param {Function} ctx.getActiveTabId
 * @param {Function} ctx.setActiveTabId
 * @param {Function} ctx.setTabUrl
 * @param {Function} ctx.deleteTabUrl
 * @param {Function} ctx.configSet
 * @param {Function} ctx.broadcastLoginPageCleared
 * @param {Function} ctx.getLoginPageTabId
 * @param {Function} ctx.setObsTabs
 * @param {Function} ctx.pushObsStatus
 */
function register(ctx) {
    const {
        getLandscapeWin, getPortraitWin,
        setActiveTabId, setTabUrl, deleteTabUrl,
        configSet,
        broadcastLoginPageCleared, getLoginPageTabId,
        setObsTabs, pushObsStatus,
    } = ctx;

    const SETTINGS_TAB_ID = '__settings__';

    // ── tab-switched ─────────────────────────────────────────────────────────
    ipcMain.on('tab-switched', (event, tabId) => {
        if (typeof tabId !== 'string') return;

        // Ne pas écraser activeTabId avec l'ID de l'onglet paramètres :
        // cela casserait la sync au retour des paramètres.
        if (tabId !== SETTINGS_TAB_ID) setActiveTabId(tabId);

        // Si l'overlay login était actif sur un autre onglet, l'effacer
        const loginTabId = getLoginPageTabId();
        if (loginTabId && loginTabId !== tabId) broadcastLoginPageCleared();

        // Relayer à portrait (y compris __settings__ pour l'overlay personnalisation)
        const pt = getPortraitWin();
        if (pt && !pt.isDestroyed()) pt.webContents.send('tab-switched', tabId);

        pushObsStatus();
    });

    // ── tab-closed ───────────────────────────────────────────────────────────
    ipcMain.on('tab-closed', (event, tabId) => {
        if (typeof tabId !== 'string') return;
        deleteTabUrl(tabId);
        const pt = getPortraitWin();
        if (pt && !pt.isDestroyed()) pt.webContents.send('tab-closed', tabId);
    });

    // ── tab-created ──────────────────────────────────────────────────────────
    ipcMain.on('tab-created', (event, { tabId, url }) => {
        if (typeof tabId !== 'string') return;
        const safe = url ? sanitizeUrl(url) : null;
        if (safe) setTabUrl(tabId, safe);
        const pt = getPortraitWin();
        if (pt && !pt.isDestroyed()) pt.webContents.send('tab-created', { tabId, url: safe || '' });
    });

    // ── save-tabs ─────────────────────────────────────────────────────────────
    ipcMain.on('save-tabs', (event, data) => {
        if (!data || !Array.isArray(data.tabs)) return;
        configSet('tabs', data.tabs);
        configSet('activeTabId', data.activeTabId || data.tabs[0].id);
        for (const tab of data.tabs) {
            if (tab.url) setTabUrl(tab.id, tab.url);
        }
        if (data.activeTabId) setActiveTabId(data.activeTabId);
        // Tenir la liste d'onglets du dock OBS à jour
        setObsTabs(data.tabs.map(t => ({ id: t.id, title: t.title || '', url: t.url || '' })));
        pushObsStatus();
    });
}

module.exports = { register };
