/**
 * DualView - IPC Screenshot
 * Version: 0.4.2
 *
 * Handlers IPC liés aux captures d'écran (v0.4.0) :
 *   take-screenshot, choose-screenshot-dir
 */

'use strict';

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs   = require('fs');

/**
 * @param {object} ctx
 * @param {Function} ctx.getLandscapeWin
 * @param {Function} ctx.getPortraitWin
 * @param {Function} ctx.configGet
 * @param {Function} ctx.configSet
 */
function register(ctx) {
    const { getLandscapeWin, getPortraitWin, configGet, configSet } = ctx;

    // ── take-screenshot ───────────────────────────────────────────────────────
    // Capture simultanée des deux fenêtres → PNG dans le dossier configuré.
    ipcMain.handle('take-screenshot', async () => {
        try {
            let dir = configGet('settings.screenshotDir') || '';
            if (!dir) dir = path.join(app.getPath('pictures'), 'DualView');
            fs.mkdirSync(dir, { recursive: true });

            const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const results = [];

            const ls = getLandscapeWin();
            if (ls && !ls.isDestroyed()) {
                const img      = await ls.webContents.capturePage();
                const filePath = path.join(dir, `dualview_${ts}_paysage.png`);
                fs.writeFileSync(filePath, img.toPNG());
                results.push(filePath);
            }

            const pt = getPortraitWin();
            if (pt && !pt.isDestroyed()) {
                const img      = await pt.webContents.capturePage();
                const filePath = path.join(dir, `dualview_${ts}_portrait.png`);
                fs.writeFileSync(filePath, img.toPNG());
                results.push(filePath);
            }

            return { success: true, dir, files: results };
        } catch (e) {
            console.warn('Screenshot error:', e.message);
            return { success: false, error: e.message };
        }
    });

    // ── choose-screenshot-dir ─────────────────────────────────────────────────
    // Ouvre un sélecteur de dossier natif et persiste le choix.
    ipcMain.handle('choose-screenshot-dir', async () => {
        const ls = getLandscapeWin();
        const result = await dialog.showOpenDialog(ls, {
            title:      'Dossier de capture',
            properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || !result.filePaths.length) return null;
        const dir = result.filePaths[0];
        configSet('settings.screenshotDir', dir);
        return dir;
    });
}

module.exports = { register };
