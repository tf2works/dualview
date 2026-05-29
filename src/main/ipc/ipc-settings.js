/**
 * DualView - IPC Settings
 * Version: 0.4.2
 *
 * Handlers IPC liés aux paramètres, thème et données globales :
 *   get-store, save-settings, get-theme, get-homepage-url,
 *   get-sync-state, get-version, get-is-dev, toggle-dev-tools
 */

'use strict';

const { ipcMain, nativeTheme, app } = require('electron');
const { DEFAULTS, SETTINGS_DEFAULTS, KNACK3_URL } = require('../config-manager');
const { sanitizeUrl } = require('../security');
const logger          = require('../../logger');
const obsControl      = require('../../obs-control');

/**
 * @param {object} ctx
 * @param {Function} ctx.getLandscapeWin
 * @param {Function} ctx.getPortraitWin
 * @param {Function} ctx.getSyncState
 * @param {Function} ctx.configGet
 * @param {Function} ctx.configSet
 * @param {Function} ctx.startObsServerIfEnabled
 */
function register(ctx) {
    const { getLandscapeWin, getPortraitWin, getSyncState,
            configGet, configSet, startObsServerIfEnabled } = ctx;

    // ── Helpers thème ─────────────────────────────────────────────────────────

    function getTheme() {
        const appearance = configGet('settings.appearance') || 'auto';
        if (appearance === 'light') return 'light';
        if (appearance === 'dark')  return 'dark';
        return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    }

    function applyAppearance() {
        const appearance = configGet('settings.appearance') || 'auto';
        nativeTheme.themeSource = appearance === 'auto' ? 'system' : appearance;
    }

    function broadcastTheme() {
        const theme = getTheme();
        for (const win of [getLandscapeWin(), getPortraitWin()]) {
            if (win && !win.isDestroyed()) win.webContents.send('theme-changed', theme);
        }
    }

    function getHomepageUrl() {
        const mode = configGet('settings.homepageMode') || 'knack3';
        if (mode === 'knack3') return KNACK3_URL;
        if (mode === 'custom') return configGet('settings.customHomepageUrl') || KNACK3_URL;
        return '';
    }

    // Exposer au contexte partagé pour usage dans d'autres modules (ex: app lifecycle)
    ctx.getTheme        = getTheme;
    ctx.applyAppearance = applyAppearance;
    ctx.broadcastTheme  = broadcastTheme;
    ctx.getHomepageUrl  = getHomepageUrl;

    // nativeTheme change (OS bascule clair/sombre)
    nativeTheme.on('updated', broadcastTheme);

    // ── get-store ─────────────────────────────────────────────────────────────
    // Charge initiale : landscape demande ses données persistées au démarrage.
    ipcMain.handle('get-store', () => ({
        tabs:        configGet('tabs')        || DEFAULTS.tabs,
        activeTabId: configGet('activeTabId') || DEFAULTS.activeTabId,
        settings:    configGet('settings')    || Object.assign({}, SETTINGS_DEFAULTS),
    }));

    // ── save-settings ─────────────────────────────────────────────────────────
    ipcMain.on('save-settings', (event, settings) => {
        if (!settings || typeof settings !== 'object') return;

        const allowed = {
            restoreTabs:        v => typeof v === 'boolean',
            homepageMode:       v => ['knack3', 'custom', 'empty'].includes(v),
            customHomepageUrl:  v => typeof v === 'string' && (v === '' || sanitizeUrl(v) !== null),
            newTabMode:         v => ['homepage', 'empty'].includes(v),
            appearance:         v => ['auto', 'light', 'dark'].includes(v),
            language:           v => ['fr', 'en'].includes(v),
            obsEnabled:         v => typeof v === 'boolean',
            obsPort:            v => Number.isInteger(v) && v >= 0 && v <= 65535,
            // v0.4.0
            searchEngineId:     v => typeof v === 'string' && v.length > 0,
            searchEngineUrl:    v => typeof v === 'string' && v.startsWith('http'),
            searchEngineName:   v => typeof v === 'string',
            customSearchEngines:v => Array.isArray(v),
            screenshotDir:      v => typeof v === 'string',
            portraitPreset:     v => typeof v === 'string',
        };

        const current      = configGet('settings') || Object.assign({}, SETTINGS_DEFAULTS);
        const prevObsEnabled = current.obsEnabled;
        const prevObsPort    = current.obsPort;

        for (const key of Object.keys(allowed)) {
            if (settings[key] !== undefined && allowed[key](settings[key])) {
                current[key] = settings[key];
            }
        }
        configSet('settings', current);
        applyAppearance();
        broadcastTheme();

        // Redémarrer le serveur OBS si son état ou son port a changé
        if (current.obsEnabled !== prevObsEnabled || current.obsPort !== prevObsPort) {
            obsControl.stop();
            if (current.obsEnabled !== false) startObsServerIfEnabled();
        }
    });

    // ── Getters simples ───────────────────────────────────────────────────────
    ipcMain.handle('get-theme',        () => getTheme());
    ipcMain.handle('get-is-dev',       () => logger.IS_DEV);
    ipcMain.handle('get-version',      () => app.getVersion());
    ipcMain.handle('get-homepage-url', () => getHomepageUrl());
    ipcMain.handle('get-sync-state',   () => getSyncState());

    // ── toggle-dev-tools ──────────────────────────────────────────────────────
    ipcMain.on('toggle-dev-tools', () => {
        const ls = getLandscapeWin();
        if (!logger.IS_DEV || !ls || ls.isDestroyed()) return;
        if (ls.webContents.isDevToolsOpened()) {
            ls.webContents.closeDevTools();
        } else {
            ls.webContents.openDevTools({ mode: 'detach' });
        }
    });

    // Retourner les helpers thème pour usage dans main.js (applyAppearance au démarrage)
    return { applyAppearance, broadcastTheme };
}

module.exports = { register };