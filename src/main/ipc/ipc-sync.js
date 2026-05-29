/**
 * DualView - IPC Sync
 * Version: 0.4.2
 *
 * Handlers IPC liés à la synchronisation et à la vidéo :
 *   sync-control, sync-pause, sync-resume,
 *   video-play, video-pause, video-timeupdate
 */

'use strict';

const { ipcMain }      = require('electron');
const { applySyncAction } = require('../sync-manager');

/**
 * @param {object} ctx
 * @param {Function} ctx.getPortraitWin
 * @param {Function} ctx.getSyncState
 * @param {Function} ctx.getActiveTabId
 * @param {Function} ctx.getTabUrl
 * @param {Function} ctx.configSet
 * @param {Function} ctx.pushObsStatus
 */
function register(ctx) {
    const { getPortraitWin, getSyncState, getActiveTabId, getTabUrl,
            configSet, pushObsStatus } = ctx;

    // ── sync-control ─────────────────────────────────────────────────────────
    // Bouton sync dans la toolbar landscape : pause / resume / restart.
    ipcMain.on('sync-control', (event, action) => {
        applySyncAction(action);
        pushObsStatus();
    });

    // ── sync-pause ───────────────────────────────────────────────────────────
    // Mode redimensionnement portrait (v0.4.0) : déverrouille portrait.
    ipcMain.on('sync-pause', () => {
        const pt = getPortraitWin();
        if (pt && !pt.isDestroyed()) {
            pt.setResizable(true);
            pt.webContents.send('resize-mode', true);
        }
    });

    // ── sync-resume ──────────────────────────────────────────────────────────
    // Fin du mode redimensionnement libre (bouton ↔ dans portrait).
    ipcMain.on('sync-resume', () => {
        const pt = getPortraitWin();
        if (!pt || pt.isDestroyed()) return;
        pt.setResizable(false);
        pt.webContents.send('resize-mode', false);
        const [w, h] = pt.getSize();
        configSet('portraitWindow.width',  w);
        configSet('portraitWindow.height', h);
        const tabId = getActiveTabId();
        if (tabId && getSyncState() === 'active') {
            const url = getTabUrl(tabId) || '';
            if (url) pt.webContents.send('load-url', { tabId, url });
        }
    });

    // ── Vidéo sync ────────────────────────────────────────────────────────────
    // play / pause / timeupdate envoyés par la webview landscape.
    ipcMain.on('video-play', (e, t) => {
        if (getSyncState() !== 'active') return;
        const pt = getPortraitWin();
        if (pt && !pt.isDestroyed()) pt.webContents.send('video-cmd', { action: 'play',  currentTime: t });
    });

    ipcMain.on('video-pause', (e, t) => {
        if (getSyncState() !== 'active') return;
        const pt = getPortraitWin();
        if (pt && !pt.isDestroyed()) pt.webContents.send('video-cmd', { action: 'pause', currentTime: t });
    });

    ipcMain.on('video-timeupdate', (e, t) => {
        if (getSyncState() !== 'active') return;
        const pt = getPortraitWin();
        if (pt && !pt.isDestroyed()) pt.webContents.send('video-cmd', { action: 'seek',  currentTime: t });
    });
}

module.exports = { register };
