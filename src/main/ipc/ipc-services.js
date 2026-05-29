/**
 * DualView - IPC Services
 * Version: 0.4.2
 *
 * Handlers IPC liés aux services connectés (authentification) :
 *   get-connected-services-status, open-auth-window,
 *   disconnect-service, delete-custom-service,
 *   auth-custom-confirmed, auth-custom-cancelled,
 *   login-page-detected, login-page-left
 */

'use strict';

const { ipcMain, BrowserWindow } = require('electron');
const {
    checkAllServicesStatus,
    disconnectService,
    openAuthWindow,
    authWindowEvents,
} = require('../../auth-window');
const { sanitizeUrl }             = require('../security');
const { detectServiceKeyFromUrl } = require('../url-detector');
const { isAuthUrl }               = require('../url-detector');
const logger                      = require('../../logger');

/**
 * @param {object} ctx
 * @param {Function} ctx.getLandscapeWin
 * @param {Function} ctx.getPortraitWin
 * @param {Function} ctx.getActiveTabId
 * @param {Function} ctx.getTabUrl
 * @param {Function} ctx.configGet
 * @param {Function} ctx.configSet
 */
function register(ctx) {
    const { getLandscapeWin, getPortraitWin, getActiveTabId,
            getTabUrl, configGet, configSet } = ctx;

    // ── État overlay login ────────────────────────────────────────────────────
    let loginPageTabId = null;

    function broadcastLoginPageCleared() {
        loginPageTabId = null;
        const ls = getLandscapeWin();
        const pt = getPortraitWin();
        if (ls && !ls.isDestroyed()) ls.webContents.send('login-page-cleared');
        if (pt && !pt.isDestroyed()) pt.webContents.send('login-page-cleared');
    }

    // Exposer broadcastLoginPageCleared et getLoginPageTabId au contexte partagé
    ctx.broadcastLoginPageCleared = broadcastLoginPageCleared;
    ctx.getLoginPageTabId = () => loginPageTabId;

    // ── Auth success : rechargement portrait après connexion ─────────────────
    authWindowEvents.on('auth-success', ({ serviceKey, serviceLabel }) => {
        logger.log('auth', 'LOG', [`Auth réussie : ${serviceLabel} (${serviceKey})`]);
        const tabId = getActiveTabId();
        const pt    = getPortraitWin();
        if (!tabId || !pt || pt.isDestroyed()) return;
        const url = getTabUrl(tabId) || '';
        logger.log('auth', 'LOG', [`Rechargement portrait — onglet: ${tabId}, url: ${url}`]);
        if (!url || isAuthUrl(url)) return;
        pt.webContents.send('reload-webview');
    });

    // ── Détection page de connexion ───────────────────────────────────────────
    ipcMain.on('login-page-detected', (event, { url, tabId }) => {
        const safe = sanitizeUrl(url);
        if (!safe) return;
        loginPageTabId = tabId;
        logger.log('main', 'LOG', [`Login détecté: ${safe} (tab: ${tabId})`]);
        const serviceKey = detectServiceKeyFromUrl(safe);
        const ls = getLandscapeWin();
        const pt = getPortraitWin();
        if (ls && !ls.isDestroyed()) ls.webContents.send('show-login-popup', { url: safe, tabId, serviceKey });
        if (pt && !pt.isDestroyed()) pt.webContents.send('show-login-popup', { url: safe, tabId, serviceKey });
    });

    ipcMain.on('login-page-left', (event, { tabId }) => {
        if (loginPageTabId === tabId) broadcastLoginPageCleared();
    });

    // ── get-connected-services-status ─────────────────────────────────────────
    ipcMain.handle('get-connected-services-status', async () => {
        const knownStatus   = await checkAllServicesStatus();
        const customServices = configGet('settings.customServices') || [];
        return { known: knownStatus, custom: customServices };
    });

    // ── open-auth-window ──────────────────────────────────────────────────────
    ipcMain.handle('open-auth-window', async (event, { serviceKey, customUrl, customLabel }) => {
        const parentWin = BrowserWindow.fromWebContents(event.sender);
        try {
            const success = await openAuthWindow({ serviceKey, customUrl, customLabel, parentWin });
            if (success && serviceKey === 'custom') {
                const customServices = configGet('settings.customServices') || [];
                const existing = customServices.find(s => s.url === customUrl);
                if (existing) {
                    existing.connected = true;
                } else {
                    customServices.push({
                        id: Date.now().toString(),
                        label: customLabel,
                        url: customUrl,
                        connected: true,
                    });
                }
                configSet('settings.customServices', customServices);
            }
            return { success };
        } catch (e) {
            console.warn('open-auth-window error:', e.message);
            return { success: false, error: e.message };
        }
    });

    // ── disconnect-service ────────────────────────────────────────────────────
    ipcMain.handle('disconnect-service', async (event, { serviceKey, customUrl }) => {
        const ok = await disconnectService(serviceKey, customUrl);
        if (ok && serviceKey === 'custom' && customUrl) {
            const customServices = configGet('settings.customServices') || [];
            const svc = customServices.find(s => s.url === customUrl);
            if (svc) svc.connected = false;
            configSet('settings.customServices', customServices);
        }
        return { success: ok };
    });

    // ── delete-custom-service ─────────────────────────────────────────────────
    ipcMain.handle('delete-custom-service', async (event, { serviceId }) => {
        const customServices = configGet('settings.customServices') || [];
        configSet('settings.customServices', customServices.filter(s => s.id !== serviceId));
        return { success: true };
    });

    // ── auth-custom-confirmed / cancelled ─────────────────────────────────────
    // Ces handlers sont relayés par auth-window.js via ipcMain.once ;
    // ils doivent exister pour que la chaîne IPC fonctionne.
    ipcMain.on('auth-custom-confirmed', (_event, _confirmed) => { /* relayé par auth-window */ });
    ipcMain.on('auth-custom-cancelled', () => { /* relayé par auth-window */ });
}

module.exports = { register };