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
 * v0.7.1 : téléchargements configurables. Quand getAllowDownloads() = true,
 *   les téléchargements sont sauvegardés dans getDownloadDir() (ou le dossier
 *   Téléchargements de l'OS par défaut) et trackés via onDownloadStarted/
 *   onDownloadUpdated/onDownloadDone. Quand = false (défaut), comportement
 *   inchangé : annulation + notification 'download-blocked'.
 *
 * Extrait de main.js v0.4.5 pour améliorer la maintenabilité open source.
 */

'use strict';

const { session, app } = require('electron');
const path = require('path');
const fs   = require('fs');

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
 * @param {Function} [opts.getAllowDownloads]       getter → boolean (v0.7.1)
 * @param {Function} [opts.getDownloadDir]          getter → string (v0.7.1)
 * @param {Function} [opts.getDownloadAskPath]      getter → boolean (v0.7.1)
 * @param {Function} [opts.onDownloadStarted]       callback(item) (v0.7.1)
 * @param {Function} [opts.onDownloadUpdated]       callback(item) (v0.7.1)
 * @param {Function} [opts.onDownloadDone]          callback(item) (v0.7.1)
 */
function setupSessionSecurity({
    getPendingImageSavePath,
    clearPendingImageSavePath,
    getLandscapeWin,
    getAllowDownloads,
    getDownloadDir,
    getDownloadAskPath,
    onDownloadStarted,
    onDownloadUpdated,
    onDownloadDone,
}) {
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

    // ── Gestion des téléchargements (v0.7.1) ─────────────────────────────────
    // Deux modes :
    //   - allowDownloads = false (défaut sécurisé) : annulation + toast
    //   - allowDownloads = true  : sauvegarde automatique + tracking
    ses.on('will-download', (event, item) => {
        // Exception prioritaire : enregistrement d'image via clic droit
        // (flag _pendingImageSavePath positionné avant downloadURL() dans context-menu.js)
        const savePath = getPendingImageSavePath();
        if (savePath) {
            item.setSavePath(savePath);
            clearPendingImageSavePath();
            return;
        }

        // Téléchargements activés dans les paramètres ?
        if (getAllowDownloads && getAllowDownloads()) {
            // ── Mode "Toujours demander" (v0.7.1) ────────────────────────────
            // Si downloadAskPath est actif, on NE fixe PAS setSavePath() →
            // Electron affiche le dialogue natif de l'OS (Enregistrer sous…).
            // Le tracking est lancé avant le dialogue ; path sera renseigné
            // après confirmation via item.getSavePath() dans les callbacks.
            if (getDownloadAskPath && getDownloadAskPath()) {
                const dlTrackAsk = {
                    id:            Date.now().toString() + '_' + Math.random().toString(36).slice(2, 7),
                    filename:      item.getFilename() || 'fichier',
                    path:          '',        // inconnu tant que l'utilisateur n'a pas choisi
                    url:           item.getURL(),
                    totalBytes:    item.getTotalBytes(),
                    receivedBytes: 0,
                    state:         'in-progress',
                    startTime:     Date.now(),
                    endTime:       null,
                    askPath:       true,
                };

                item.on('updated', (_e, state) => {
                    dlTrackAsk.receivedBytes = item.getReceivedBytes();
                    dlTrackAsk.path          = item.getSavePath() || dlTrackAsk.path;
                    dlTrackAsk.state         = state;
                    if (onDownloadUpdated) onDownloadUpdated({ ...dlTrackAsk });
                });

                item.once('done', (_e, state) => {
                    dlTrackAsk.state   = state;
                    dlTrackAsk.path    = item.getSavePath() || dlTrackAsk.path;
                    dlTrackAsk.endTime = Date.now();
                    if (onDownloadDone) onDownloadDone({ ...dlTrackAsk });
                });

                if (onDownloadStarted) onDownloadStarted({ ...dlTrackAsk });
                // Ne PAS appeler setSavePath() → dialogue natif OS
                return;
            }

            // ── Mode dossier fixe (défaut quand downloadAskPath = false) ─────
            // Dossier de destination : paramètre utilisateur OU Téléchargements de l'OS
            let dlDir = (getDownloadDir && getDownloadDir()) || '';
            if (!dlDir) dlDir = app.getPath('downloads');
            try { fs.mkdirSync(dlDir, { recursive: true }); } catch { /* non bloquant */ }

            // Sanitisation du nom de fichier (caractères interdits sur tous les OS)
            const rawName = item.getFilename() || 'fichier';
            const safeName = rawName.replace(/[/\\:*?"<>|]/g, '_');

            // Éviter les collisions de nom : suffixe numérique si nécessaire
            let destPath = path.join(dlDir, safeName);
            if (fs.existsSync(destPath)) {
                const ext  = path.extname(safeName);
                const base = path.basename(safeName, ext);
                let n = 1;
                while (fs.existsSync(destPath)) {
                    destPath = path.join(dlDir, `${base} (${n})${ext}`);
                    n++;
                }
            }
            item.setSavePath(destPath);

            // Objet de tracking partagé entre les callbacks
            const dlTrack = {
                id:            Date.now().toString() + '_' + Math.random().toString(36).slice(2, 7),
                filename:      safeName,
                path:          destPath,
                url:           item.getURL(),
                totalBytes:    item.getTotalBytes(),
                receivedBytes: 0,
                state:         'in-progress',
                startTime:     Date.now(),
                endTime:       null,
            };

            item.on('updated', (_e, state) => {
                dlTrack.receivedBytes = item.getReceivedBytes();
                dlTrack.state         = state; // 'progressing' | 'interrupted'
                if (onDownloadUpdated) onDownloadUpdated({ ...dlTrack });
            });

            item.once('done', (_e, state) => {
                dlTrack.state   = state; // 'completed' | 'cancelled' | 'interrupted'
                dlTrack.endTime = Date.now();
                if (onDownloadDone) onDownloadDone({ ...dlTrack });
            });

            if (onDownloadStarted) onDownloadStarted({ ...dlTrack });
            return;
        }

        // Téléchargements désactivés — comportement par défaut
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