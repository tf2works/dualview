/**
 * DualView - IPC Portrait
 * Version: 0.4.2
 *
 * Handlers IPC liés au redimensionnement de la fenêtre portrait (v0.4.0) :
 *   get-portrait-presets, start-portrait-resize,
 *   apply-portrait-preset, finish-portrait-resize, cancel-portrait-resize
 */

'use strict';

const { ipcMain }        = require('electron');
const { PORTRAIT_PRESETS } = require('../config-manager');
const { applySyncAction }  = require('../sync-manager');

/**
 * @param {object} ctx
 * @param {Function} ctx.getPortraitWin
 * @param {Function} ctx.configGet
 * @param {Function} ctx.configSet
 */
function register(ctx) {
    const { getPortraitWin, configGet, configSet } = ctx;

    // ── get-portrait-presets ─────────────────────────────────────────────────
    ipcMain.handle('get-portrait-presets', () => PORTRAIT_PRESETS);

    // ── start-portrait-resize ────────────────────────────────────────────────
    // Entrée en mode redimensionnement : portrait déverrouillé + sync mise en pause.
    ipcMain.on('start-portrait-resize', () => {
        const pt = getPortraitWin();
        if (!pt || pt.isDestroyed()) return;
        pt.setResizable(true);
        pt.webContents.send('resize-mode', true);
        applySyncAction('pause');
    });

    // ── apply-portrait-preset ────────────────────────────────────────────────
    // Applique un preset (iPhone 15, Pixel 8…) sans fermer le mode resize.
    ipcMain.on('apply-portrait-preset', (event, { presetId }) => {
        const pt = getPortraitWin();
        if (!pt || pt.isDestroyed()) return;
        const preset = PORTRAIT_PRESETS.find(p => p.id === presetId);
        if (!preset) return;
        configSet('settings.portraitPreset', presetId);
        pt.setResizable(true);
        pt.setSize(preset.width, preset.height);
        configSet('portraitWindow.width',  preset.width);
        configSet('portraitWindow.height', preset.height);
    });

    // ── finish-portrait-resize ───────────────────────────────────────────────
    // Validation : portrait reverrouillé + sync reprise.
    ipcMain.on('finish-portrait-resize', () => {
        const pt = getPortraitWin();
        if (!pt || pt.isDestroyed()) return;
        const [w, h] = pt.getSize();
        configSet('portraitWindow.width',  w);
        configSet('portraitWindow.height', h);
        pt.setResizable(false);
        pt.webContents.send('resize-mode', false);
        applySyncAction('resume');
    });

    // ── cancel-portrait-resize ───────────────────────────────────────────────
    // Annulation : restaure la taille sauvegardée avant la session.
    ipcMain.on('cancel-portrait-resize', () => {
        const pt = getPortraitWin();
        if (!pt || pt.isDestroyed()) return;
        const savedW = configGet('portraitWindow.width')  || 390;
        const savedH = configGet('portraitWindow.height') || 844;
        pt.setResizable(true);
        pt.setSize(savedW, savedH);
        pt.setResizable(false);
        pt.webContents.send('resize-mode', false);
    });
}

module.exports = { register };
