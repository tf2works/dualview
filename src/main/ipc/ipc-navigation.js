/**
 * DualView - IPC Navigation
 * Version: 0.4.2
 *
 * Handlers IPC liés à la navigation web :
 *   navigate, sync-scroll, sync-navigate,
 *   notify-nav-state, nav-back, nav-forward,
 *   reload-views, relaunch-app
 */

'use strict';

const { ipcMain, app } = require('electron');
const { sanitizeUrl }  = require('../security');
const { isAuthUrl }    = require('../url-detector');

/**
 * Enregistre tous les handlers IPC de navigation.
 *
 * @param {object} ctx  Contexte partagé injecté par main.js
 * @param {Function} ctx.getLandscapeWin
 * @param {Function} ctx.getPortraitWin
 * @param {Function} ctx.getSyncState
 * @param {Function} ctx.getActiveTabId
 * @param {Function} ctx.setTabUrl       (tabId, url)
 * @param {Function} ctx.pushObsStatus
 */
function register(ctx) {
    const { getLandscapeWin, getPortraitWin, getSyncState,
            getActiveTabId, setTabUrl, pushObsStatus } = ctx;

    // ── navigate ─────────────────────────────────────────────────────────────
    // Déclenché depuis la barre d'adresse landscape (URL saisie par l'utilisateur).
    ipcMain.on('navigate', (event, url) => {
        const safe = sanitizeUrl(url);
        if (!safe) return;

        const tabId = getActiveTabId();
        if (tabId) setTabUrl(tabId, safe);

        const ls = getLandscapeWin();
        if (ls && !ls.isDestroyed()) ls.webContents.send('load-url', safe);

        const pt = getPortraitWin();
        if (getSyncState() === 'active' && !isAuthUrl(safe) && pt && !pt.isDestroyed())
            pt.webContents.send('load-url', { tabId, url: safe });

        pushObsStatus();
    });

    // ── sync-scroll ──────────────────────────────────────────────────────────
    // Envoyé par la webview landscape lors d'un scroll ; relayé à portrait.
    ipcMain.on('sync-scroll', (event, pct) => {
        if (typeof pct !== 'number') return;
        if (getSyncState() !== 'active') return;
        const pt = getPortraitWin();
        if (pt && !pt.isDestroyed()) pt.webContents.send('apply-scroll', pct);
    });

    // ── sync-navigate ────────────────────────────────────────────────────────
    // Navigation interne déclenchée par une webview (clic sur lien, JS redirect…).
    ipcMain.on('sync-navigate', (event, url) => {
        const safe = sanitizeUrl(url);
        if (!safe) return;

        const tabId = getActiveTabId();
        if (tabId) setTabUrl(tabId, safe);

        const ls = getLandscapeWin();
        if (ls && !ls.isDestroyed()) ls.webContents.send('update-addressbar', safe);

        const pt = getPortraitWin();
        if (getSyncState() === 'active' && !isAuthUrl(safe) && pt && !pt.isDestroyed())
            pt.webContents.send('load-url', { tabId, url: safe });

        pushObsStatus();
    });

    // ── notify-nav-state ─────────────────────────────────────────────────────
    // La webview informe landscape de son état back/forward.
    ipcMain.on('notify-nav-state', (event, state) => {
        if (!state || typeof state !== 'object') return;
        const ls = getLandscapeWin();
        if (ls && !ls.isDestroyed()) ls.webContents.send('nav-state-changed', state);
    });

    // ── nav-back ─────────────────────────────────────────────────────────────
    ipcMain.on('nav-back', () => {
        const ls = getLandscapeWin();
        const pt = getPortraitWin();
        if (ls && !ls.isDestroyed()) ls.webContents.send('webview-go-back');
        if (getSyncState() === 'active' && pt && !pt.isDestroyed()) pt.webContents.send('webview-go-back');
    });

    // ── nav-forward ──────────────────────────────────────────────────────────
    ipcMain.on('nav-forward', () => {
        const ls = getLandscapeWin();
        const pt = getPortraitWin();
        if (ls && !ls.isDestroyed()) ls.webContents.send('webview-go-forward');
        if (getSyncState() === 'active' && pt && !pt.isDestroyed()) pt.webContents.send('webview-go-forward');
    });

    // ── reload-views ─────────────────────────────────────────────────────────
    ipcMain.on('reload-views', () => {
        const pt = getPortraitWin();
        if (getSyncState() === 'active' && pt && !pt.isDestroyed())
            pt.webContents.send('reload-webview');
    });

    // ── relaunch-app ─────────────────────────────────────────────────────────
    ipcMain.on('relaunch-app', () => { app.relaunch(); app.exit(0); });
}

module.exports = { register };
