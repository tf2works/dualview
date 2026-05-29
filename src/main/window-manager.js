/**
 * DualView - Window Manager
 * Version: 0.4.2
 *
 * Responsabilité unique : création et configuration des deux BrowserWindows.
 *   - createLandscapeWindow : fenêtre paysage principale
 *   - createPortraitWindow  : fenêtre portrait (non redimensionnable par défaut)
 *
 * Les deux fenêtres sont créées ici et leurs références exposées via getLandscapeWin()
 * et getPortraitWin() pour usage dans les autres modules.
 */

'use strict';

const { BrowserWindow, nativeTheme, screen, app } = require('electron');
const path = require('path');

const configManager = require('./config-manager');
const syncManager   = require('./sync-manager');
const logger        = require('../logger');

// ── État interne ──────────────────────────────────────────────────────────────

let landscapeWin = null;
let portraitWin  = null;

// ── Accesseurs ────────────────────────────────────────────────────────────────

function getLandscapeWin() { return landscapeWin; }
function getPortraitWin()  { return portraitWin;  }

// ── Fenêtre Paysage ───────────────────────────────────────────────────────────

/**
 * Crée la fenêtre landscape et installe ses événements.
 *
 * @param {object} opts
 * @param {Function} opts.onContextMenu   (params, wvContents) — menu clic droit
 * @param {Function} opts.onWindowOpen    (url) — ouverture de lien en onglet
 */
function createLandscapeWindow({ onContextMenu, onWindowOpen } = {}) {
    const saved = configManager.configGet('landscapeWindow');
    const { height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = saved.width  || 1280;
    const h = saved.height || 720;
    const x = saved.x !== null ? saved.x : 20;
    const y = saved.y !== null ? saved.y : Math.floor((sh - h) / 2);

    landscapeWin = new BrowserWindow({
        width: w, height: h, x, y,
        minWidth: 700, minHeight: 480,
        title: 'DualView - Paysage',
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '..', 'preload-landscape.js'),
            webviewTag: true,
            additionalArguments: logger.IS_DEV ? ['--dev-source=landscape'] : [],
        },
        autoHideMenuBar: true,
        resizable: true,
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f0f0f0',
    });

    landscapeWin.loadFile(path.join(__dirname, '..', 'landscape.html'));
    landscapeWin.webContents.setMaxListeners(50);

    // Mode dev : second preload pour DevTools
    if (logger.IS_DEV) {
        landscapeWin.webContents.session.registerPreloadScript({
            id: 'dev-preload-landscape',
            type: 'frame',
            filePath: path.join(__dirname, '..', 'preload-dev.js'),
        });
    }

    landscapeWin.once('ready-to-show', () => {
        landscapeWin.show();
        syncManager.tryScheduleSyncStart('landscape');
    });

    landscapeWin.on('moved', () => {
        const [x, y] = landscapeWin.getPosition();
        configManager.configSet('landscapeWindow.x', x);
        configManager.configSet('landscapeWindow.y', y);
    });

    landscapeWin.on('resize', () => {
        const [w, h] = landscapeWin.getSize();
        configManager.configSet('landscapeWindow.width',  w);
        configManager.configSet('landscapeWindow.height', h);
    });

    landscapeWin.on('closed', () => app.quit());

    // ── Boutons souris Retour/Avance (v0.4.1) ─────────────────────────────────
    landscapeWin.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'mouseDown') return;
        if (input.button === 'back') {
            event.preventDefault();
            landscapeWin.webContents.send('mouse-nav', 'back');
        } else if (input.button === 'forward') {
            event.preventDefault();
            landscapeWin.webContents.send('mouse-nav', 'forward');
        }
    });

    // ── Interception ouvertures de fenêtre + menu contextuel (v0.4.1) ─────────
    landscapeWin.webContents.on('did-attach-webview', (_event, wvContents) => {

        // Toute tentative d'ouvrir une nouvelle fenêtre → onglet DualView
        wvContents.setWindowOpenHandler(({ url }) => {
            if (!url || url === 'about:blank') return { action: 'deny' };
            try {
                const parsed = new URL(url);
                if (!['http:', 'https:'].includes(parsed.protocol)) return { action: 'deny' };
            } catch { return { action: 'deny' }; }

            if (typeof onWindowOpen === 'function') {
                onWindowOpen(url);
            } else {
                landscapeWin.webContents.send('context-menu-action', { action: 'open-link-new-tab', url });
            }
            return { action: 'deny' };
        });

        // Menu contextuel natif clic droit
        wvContents.on('context-menu', (_e, params) => {
            if (typeof onContextMenu === 'function') onContextMenu(params, wvContents);
        });
    });

    return landscapeWin;
}

// ── Fenêtre Portrait ──────────────────────────────────────────────────────────

function createPortraitWindow() {
    const saved = configManager.configGet('portraitWindow');
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = saved.width  || 390;
    const h = saved.height || 844;
    const x = saved.x !== null ? saved.x : sw - w - 20;
    const y = saved.y !== null ? saved.y : Math.floor((sh - h) / 2);

    portraitWin = new BrowserWindow({
        width: w, height: h, x, y,
        title: 'DualView - Portrait',
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '..', 'preload-view.js'),
            webviewTag: true,
            additionalArguments: logger.IS_DEV ? ['--dev-source=portrait'] : [],
        },
        autoHideMenuBar: true,
        show: false,
        backgroundColor: '#ffffff',
    });

    portraitWin.loadFile(path.join(__dirname, '..', 'portrait.html'));
    portraitWin.webContents.setMaxListeners(50);

    if (logger.IS_DEV) {
        portraitWin.webContents.session.registerPreloadScript({
            id: 'dev-preload-portrait',
            type: 'frame',
            filePath: path.join(__dirname, '..', 'preload-dev.js'),
        });
    }

    portraitWin.once('ready-to-show', () => {
        // Attendre que landscape soit visible avant d'afficher portrait
        if (landscapeWin && !landscapeWin.isDestroyed() && landscapeWin.isVisible()) {
            portraitWin.show();
        } else {
            landscapeWin.once('show', () => portraitWin.show());
        }
        syncManager.tryScheduleSyncStart('portrait');
    });

    portraitWin.on('moved', () => {
        const [x, y] = portraitWin.getPosition();
        configManager.configSet('portraitWindow.x', x);
        configManager.configSet('portraitWindow.y', y);
    });

    portraitWin.on('closed', () => { portraitWin = null; });

    return portraitWin;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
    createLandscapeWindow,
    createPortraitWindow,
    getLandscapeWin,
    getPortraitWin,
};
