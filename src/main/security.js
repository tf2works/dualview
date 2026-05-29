/**
 * DualView - Security
 * Version: 0.4.2
 *
 * Responsabilité unique : sécurité de la session Electron.
 *   - sanitizeUrl      : valide et nettoie une URL avant usage
 *   - isBlockedUrl     : bloqueur de publicités / schémas non autorisés
 *   - isYouTubeShort   : bypass bloqueur pour YouTube Shorts
 *   - setupSessionSecurity : installe les handlers webRequest sur la session
 *
 * RÈGLE CRITIQUE : un seul handler onBeforeSendHeaders par session.
 * Ne jamais installer de second handler dans auth-window.js ou ailleurs.
 */

'use strict';

const { session } = require('electron');

// ── Bloqueur de publicités ────────────────────────────────────────────────────

const AD_BLOCK_DOMAINS = [
    'doubleclick.net',
    'googlesyndication.com',
    'adservice.google.com',
    'adservice.google.fr',
    'google-analytics.com',
    'ads.youtube.com',
    'pagead2.googlesyndication.com',
    'stats.g.doubleclick.net',
];

const AD_BLOCK_PATHS = [
    { host: 'analytics.google.com',      path: '/analytics/collect' },
    { host: 'www.google-analytics.com',  path: '/collect'           },
    { host: 'imasdk.googleapis.com',     path: '/js/sdkloader/'     },
    { host: 'imasdk.googleapis.com',     path: '/admob/'            },
    { host: 'imasdk.googleapis.com',     path: '/pal/'              },
];

const ALLOWED_SCHEMES = ['http:', 'https:', 'file:', 'devtools:', 'chrome-extension:'];

// ── Fonctions utilitaires ─────────────────────────────────────────────────────

/**
 * Valide et retourne une URL propre (http/https/file seulement).
 * Retourne null si l'URL est invalide ou d'un schéma non autorisé.
 */
function sanitizeUrl(url) {
    if (typeof url !== 'string') return null;
    url = url.trim();
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return null;
        return url;
    } catch {
        return null;
    }
}

/**
 * Retourne true si l'URL initiateur est un YouTube Short.
 * Utilisé pour bypasser le bloqueur pub sur /shorts/ (les annonces
 * YouTube y sont intégrées différemment et le bloqueur les casse).
 */
function isYouTubeShort(initiatorUrl) {
    if (!initiatorUrl) return false;
    try {
        const u = new URL(initiatorUrl);
        if (
            (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') &&
            u.pathname.startsWith('/shorts/')
        ) return true;
    } catch { /* URL invalide : ignorée */ }
    return false;
}

/**
 * Retourne true si la requête doit être bloquée (pub, schéma non autorisé).
 * @param {string} urlStr         URL de la ressource demandée
 * @param {string} initiatorUrl   URL de la page demandeuse
 */
function isBlockedUrl(urlStr, initiatorUrl) {
    // Bypass total pour YouTube Shorts
    if (isYouTubeShort(initiatorUrl)) return false;
    try {
        const u = new URL(urlStr);
        const h = u.hostname.toLowerCase();

        if (!ALLOWED_SCHEMES.includes(u.protocol)) return true;

        for (const domain of AD_BLOCK_DOMAINS) {
            if (h === domain || h.endsWith('.' + domain)) return true;
        }
        for (const rule of AD_BLOCK_PATHS) {
            if (h === rule.host && u.pathname.startsWith(rule.path)) return true;
        }
    } catch {
        return false;
    }
    return false;
}

// ── Setup session ─────────────────────────────────────────────────────────────

/**
 * Installe les handlers de sécurité sur la session persist:dualview.
 * Doit être appelé UNE SEULE FOIS, avant la création des fenêtres.
 *
 * @param {object} opts
 * @param {Function} opts.onDownloadBlocked  Appelé avec (filename) si un
 *   téléchargement est bloqué (pour afficher un toast dans landscapeWin).
 * @param {Function} opts.getPendingImageSavePath  Getter du flag d'image.
 * @param {Function} opts.clearPendingImageSavePath Remet le flag à null.
 * @param {Function} opts.getImageSavePath  Retourne le chemin de sauvegarde.
 */
function setupSessionSecurity({ onDownloadBlocked, getPendingImageSavePath, clearPendingImageSavePath }) {
    const ses = session.fromPartition('persist:dualview');

    // ── Bloqueur de publicités ────────────────────────────────────────────────
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        const blocked = isBlockedUrl(details.url, details.referrer || details.initiator);
        callback({ cancel: blocked });
    });

    // ── Correction sec-ch-ua ──────────────────────────────────────────────────
    // Electron expose "Electron" dans ce header HTTP par défaut.
    // Google/Microsoft le vérifient côté serveur pour détecter les bots.
    // RÈGLE : ne jamais installer un second onBeforeSendHeaders ailleurs.
    ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
        const h = details.requestHeaders;
        const v = process.versions.chrome.split('.')[0];
        h['sec-ch-ua']          = `"Google Chrome";v="${v}", "Chromium";v="${v}", "Not=A?Brand";v="99"`;
        h['sec-ch-ua-mobile']   = '?0';
        h['sec-ch-ua-platform'] = '"Windows"';
        callback({ requestHeaders: h });
    });

    // ── Blocage permissions ───────────────────────────────────────────────────
    ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
    });

    // ── Téléchargements ───────────────────────────────────────────────────────
    // Tous les téléchargements sont bloqués sauf les images enregistrées via
    // le menu contextuel ("Enregistrer l'image sous…"), identifiées par le
    // flag _pendingImageSavePath positionné avant downloadURL().
    ses.on('will-download', (_event, item) => {
        const pendingPath = getPendingImageSavePath();
        if (pendingPath) {
            item.setSavePath(pendingPath);
            clearPendingImageSavePath();
            return;
        }
        item.cancel();
        if (typeof onDownloadBlocked === 'function') {
            onDownloadBlocked(item.getFilename() || '');
        }
    });
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
    sanitizeUrl,
    isYouTubeShort,
    isBlockedUrl,
    setupSessionSecurity,
};
