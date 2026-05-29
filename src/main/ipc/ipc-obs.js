/**
 * DualView - IPC OBS
 * Version: 0.4.2
 *
 * Handlers IPC liés à l'intégration OBS :
 *   get-obs-info
 *
 * La logique OBS principale (handleObsCommand, pushObsStatus,
 * startObsServerIfEnabled) reste dans main.js car elle dépend
 * de l'état global (tabUrls, obsTabs, syncState) et d'obsControl.
 */

'use strict';

const { ipcMain } = require('electron');
const obsControl  = require('../../obs-control');

/**
 * @param {object} ctx
 * @param {Function} ctx.configGet
 */
function register(ctx) {
    const { configGet } = ctx;

    // ── get-obs-info ──────────────────────────────────────────────────────────
    // Utilisé par le panneau Paramètres → OBS pour afficher URL dock, port, token.
    ipcMain.handle('get-obs-info', () => {
        const info = obsControl.getInfo();
        return {
            enabled:  configGet('settings.obsEnabled') !== false,
            running:  !!info,
            port:     info ? info.port  : (configGet('settings.obsPort') || 0),
            token:    info ? info.token : '',
            dockUrl:  info ? `http://127.0.0.1:${info.port}/dock?token=${info.token}` : '',
        };
    });
}

module.exports = { register };