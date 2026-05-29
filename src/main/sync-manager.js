/**
 * DualView - Sync Manager
 * Version: 0.4.2
 *
 * Responsabilité unique : état et cycle de vie de la synchronisation.
 *   - syncState        : 'active' | 'paused'
 *   - broadcastSyncState  : notifie les deux fenêtres
 *   - scheduleSyncStart   : démarre la sync après 3 s (délai anti-interruption)
 *   - applySyncAction     : pause / resume / restart (chemin partagé UI + OBS)
 *
 * Ce module reçoit les références des fenêtres via init() pour pouvoir
 * broadcaster — les fenêtres sont créées après ce module.
 */

'use strict';

const { isAuthUrl } = require('./url-detector');

// ── État interne ──────────────────────────────────────────────────────────────

let _getLandscapeWin = null;  // () => BrowserWindow
let _getPortraitWin  = null;  // () => BrowserWindow
let _getActiveTabId  = null;  // () => string
let _getTabUrl       = null;  // (tabId) => string

let syncState      = 'paused'; // Démarre en pause, activé après 3 s
let syncStartTimer = null;

let _landscapeReady = false;
let _portraitReady  = false;

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Injecte les dépendances externes.
 * Accepte des getters de fenêtres pour éviter les problèmes de timing
 * (les BrowserWindows sont créées après ce module).
 *
 * @param {object} deps
 * @param {Function}  deps.getLandscapeWin  () => BrowserWindow|null
 * @param {Function}  deps.getPortraitWin   () => BrowserWindow|null
 * @param {Function}  deps.getActiveTabId   () => string|null
 * @param {Function}  deps.getTabUrl        (tabId) => string
 */
function init({ getLandscapeWin, getPortraitWin, getActiveTabId, getTabUrl }) {
    _getLandscapeWin = getLandscapeWin;
    _getPortraitWin  = getPortraitWin;
    _getActiveTabId  = getActiveTabId;
    _getTabUrl       = getTabUrl;
}

// ── Accesseurs ────────────────────────────────────────────────────────────────

function getSyncState() { return syncState; }

// ── Diffusion de l'état ───────────────────────────────────────────────────────

function broadcastSyncState() {
    const wins = [
        _getLandscapeWin ? _getLandscapeWin() : null,
        _getPortraitWin  ? _getPortraitWin()  : null,
    ];
    for (const win of wins) {
        if (win && !win.isDestroyed()) win.webContents.send('sync-state-changed', syncState);
    }
}

// ── Démarrage différé (3 secondes) ───────────────────────────────────────────

/**
 * Déclenche le compteur de démarrage automatique une fois les deux fenêtres prêtes.
 * Appelé depuis window-manager après chaque 'ready-to-show'.
 */
function tryScheduleSyncStart(win) {
    if (win === 'landscape') _landscapeReady = true;
    if (win === 'portrait')  _portraitReady  = true;
    if (_landscapeReady && _portraitReady) _scheduleSyncStart();
}

function _scheduleSyncStart() {
    if (syncStartTimer) return;
    syncStartTimer = setTimeout(() => {
        syncState = 'active';
        broadcastSyncState();
        syncStartTimer = null;
    }, 3000);
}

// ── Actions de synchronisation ────────────────────────────────────────────────

/**
 * Applique une action de synchronisation.
 * Chemin unique partagé par l'IPC 'sync-control' (UI) et les commandes OBS.
 *
 * @param {'pause'|'resume'|'restart'} action
 */
function applySyncAction(action) {
    if (!['pause', 'resume', 'restart'].includes(action)) return;

    if (action === 'pause') {
        syncState = 'paused';
        broadcastSyncState();

    } else if (action === 'resume') {
        syncState = 'active';
        broadcastSyncState();
        _sendResumeState();

    } else if (action === 'restart') {
        syncState = 'paused';
        broadcastSyncState();
        setTimeout(() => {
            syncState = 'active';
            broadcastSyncState();
            _sendResumeState();
        }, 500);
    }
}

/** Envoie l'état courant à portrait pour réinjecter les scripts après reprise. */
function _sendResumeState() {
    const tabId = _getActiveTabId ? _getActiveTabId() : null;
    const pt    = _getPortraitWin  ? _getPortraitWin()  : null;
    if (!tabId || !pt || pt.isDestroyed()) return;
    const url = _getTabUrl ? _getTabUrl(tabId) : '';
    if (url && !isAuthUrl(url)) {
        pt.webContents.send('sync-resume-state', { tabId, url });
    }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
    init,
    getSyncState,
    broadcastSyncState,
    tryScheduleSyncStart,
    applySyncAction,
};
