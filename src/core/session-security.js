/**
 * DualView - Session Security
 *
 * Bloqueur de publicités et sécurité de la session Electron (persist:dualview) :
 *   - isBlockedUrl       : teste si une URL doit être bloquée (niveau réseau)
 *   - setupSessionSecurity : installe les handlers webRequest sur la session
 *
 * RÈGLE CRITIQUE : un seul handler onBeforeSendHeaders est autorisé par session.
 * Ne jamais en installer un second dans auth-window.js ou ailleurs — cela
 * écraserait celui-ci et provoquerait ERR_ABORTED sur toutes les webviews portrait.
 *
 * Extrait de main.js v0.4.5 pour améliorer la maintenabilité open source.
 */

'use strict';

const { session } = require('electron');

// ── Bloqueur de publicités (niveau réseau) ────────────────────────────────────

const AD_BLOCK_DOMAINS = [
    'doubleclick.net', 'googlesyndication.com',
    'adservice.google.com', 'adservice.google.fr',
    'google-analytics.com', 'ads.youtube.com',
    'pagead2.googlesyndication.com', 'stats.g.doubleclick.net',
];

const AD_BLOCK_PATHS = [
    { host: 'analytics.google.com',     path: '/analytics/collect' },
    { host: 'www.google-analytics.com', path: '/collect'           },
    { host: 'imasdk.googleapis.com',    path: '/js/sdkloader/'     },
    { host: 'imasdk.googleapis.com',    path: '/admob/'            },
    { host: 'imasdk.googleapis.com',    path: '/pal/'              },
];

/**
 * Vérifie si l'URL du demandeur est un YouTube Short.
 * Si oui, le bloqueur pub est bypassé pour cette requête.
 */
function isYouTubeShort(initiatorUrl) {
    if (!initiatorUrl) return false;
    try {
        const u = new URL(initiatorUrl);
        if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') &&
            u.pathname.startsWith('/shorts/')) return true;
    } catch { }
    return false;
}

/**
 * Retourne true si l'URL doit être bloquée par le filtre réseau.
 * @param {string} urlStr       URL de la ressource demandée
 * @param {string} initiatorUrl URL de la page qui fait la demande
 */
function isBlockedUrl(urlStr, initiatorUrl) {
    // Ne pas bloquer les ressources des YouTube Shorts
    if (isYouTubeShort(initiatorUrl)) return false;
    try {
        const u = new URL(urlStr);
        const h = u.hostname.toLowerCase();
        const ALLOWED_SCHEMES = ['http:', 'https:', 'file:', 'devtools:', 'chrome-extension:'];
        if (!ALLOWED_SCHEMES.includes(u.protocol)) return true;
        for (const domain of AD_BLOCK_DOMAINS) {
            if (h === domain || h.endsWith('.' + domain)) return true;
        }
        for (const rule of AD_BLOCK_PATHS) {
            if (h === rule.host && u.pathname.startsWith(rule.path)) return true;
        }
    } catch { return false; }
    return false;
}

// ── Installation des handlers de session ──────────────────────────────────────

/**
 * Installe les handlers webRequest et de téléchargement sur la session persist:dualview.
 *
 * @param {object} opts
 * @param {Function} opts.getPendingImageSavePath  getter → string|null
 * @param {Function} opts.clearPendingImageSavePath setter (remet à null)
 * @param {Function} opts.getLandscapeWin           getter → BrowserWindow|null
 */
function setupSessionSecurity({ getPendingImageSavePath, clearPendingImageSavePath, getLandscapeWin }) {
    const ses = session.fromPartition('persist:dualview');

    // Niveau 1 — Bloqueur réseau
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        const blocked = isBlockedUrl(details.url, details.referrer || details.initiator);
        callback({ cancel: blocked });
    });

    // Correction sec-ch-ua : Electron expose "Electron" dans ce header HTTP
    // par défaut. Google le vérifie côté serveur pour détecter les navigateurs
    // automatisés. Ce handler est unique sur la session — ne jamais en installer
    // un second ailleurs.
    ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
        const h = details.requestHeaders;
        const v = process.versions.chrome.split('.')[0];
        h['sec-ch-ua']          = `"Google Chrome";v="${v}", "Chromium";v="${v}", "Not=A?Brand";v="99"`;
        h['sec-ch-ua-mobile']   = '?0';
        const platformName      = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] || 'Windows';
        h['sec-ch-ua-platform'] = `"${platformName}"`;
        callback({ requestHeaders: h });
    });

    // Blocage de toutes les permissions (géoloc, notifs, caméra, micro…)
    ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
    });

    // Blocage des téléchargements — exception : images via clic droit
    // (flag _pendingImageSavePath positionné avant downloadURL())
    ses.on('will-download', (event, item) => {
        const savePath = getPendingImageSavePath();
        if (savePath) {
            item.setSavePath(savePath);
            clearPendingImageSavePath();
            return;
        }
        item.cancel();
        const lw = getLandscapeWin();
        if (lw && !lw.isDestroyed()) {
            lw.webContents.send('download-blocked', item.getFilename() || '');
        }
    });
}

module.exports = {
    isBlockedUrl,
    isYouTubeShort,
    setupSessionSecurity,
};