/*
 * DualView - Scripts injectés dans les webviews (fenêtre portrait)
 * Version: 0.4.4
 *
 * Contient les scripts exécutés dans le contexte des pages web via
 * executeJavaScript(). Ces scripts tournent dans la page visitée,
 * pas dans le renderer Electron.
 *
 * Constantes (utilisées par portrait-app.js) :
 *   VIDEO_EXECUTOR_SCRIPT  — gestion vidéo anti-boucle (pause/seek/play/drift)
 *   AUTO_PAUSE_SCRIPT      — pause auto YouTube classique au chargement
 *
 * ⚠️  VIDEO_EXECUTOR_SCRIPT utilise les variables DRIFT_THRESHOLD et
 *     PENDING_CMD_TTL définies dans portrait-app.js via interpolation
 *     de template string. portrait-webview.js doit être chargé APRÈS
 *     portrait-app.js a défini ces constantes.
 *
 * Utilisé par : portrait.html
 * Dépendances : portrait-app.js (DRIFT_THRESHOLD, PENDING_CMD_TTL,
 *               autoMutePortrait)
 */

const VIDEO_EXECUTOR_SCRIPT = `
(function() {
    if (window.__dualviewExecutorReady) return;
    window.__dualviewExecutorReady = true;
    const DRIFT_THRESHOLD = ${DRIFT_THRESHOLD};
    const PENDING_TTL     = ${PENDING_CMD_TTL};

    // ── Sélecteurs par plateforme ──────────────────────────────────────────────
    function detectPlatform() {
const h = location.hostname;
if (h.includes('youtube.com'))   return 'youtube';
if (h.includes('tiktok.com'))    return 'tiktok';
if (h.includes('instagram.com')) return 'instagram';
return 'generic';
    }
    function getSelectors(p) {
if (p === 'youtube')   return ['video.html5-main-video','#movie_player video','ytd-player video','video'];
if (p === 'tiktok')    return ['video[class*="video"]','.video-player video','[class*="player"] video','video'];
if (p === 'instagram') return ['video[playsinline]','article video','[role="presentation"] video','video'];
return ['video'];
    }
    function findBestVideo(sels) {
for (const s of sels) {
    const list = Array.from(document.querySelectorAll(s)).filter(v => {
        const r = v.getBoundingClientRect();
        return r.width > 100 && r.height > 100;
    });
    if (list.length) {
        list.sort((a, b) => {
            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            return (rb.width * rb.height) - (ra.width * ra.height);
        });
        return list[0];
    }
}
return null;
    }

    const platform = detectPlatform();
    const sels     = getSelectors(platform);

    // ── Mute forcé (portrait toujours muet si autoMuteEnabled) ───────────────
    function ensureMuted(v) {
if (!window.__dualviewAutoMuteEnabled) return;
if (!v.__dualviewMuteApplied) { v.muted = true; v.__dualviewMuteApplied = true; }
    }

    // ── Commande en attente (avec TTL) ────────────────────────────────────────
    let pendingCmd   = null;
    let pendingExpiry = 0;

    function storePending(cmd) {
pendingCmd    = cmd;
pendingExpiry = Date.now() + PENDING_TTL;
    }
    function consumePending() {
if (!pendingCmd) return null;
if (Date.now() > pendingExpiry) { pendingCmd = null; return null; }
const c = pendingCmd; pendingCmd = null; return c;
    }

    // ── Application d'une commande ────────────────────────────────────────────
    // RÈGLES ANTI-BOUCLE :
    //   'pause'       → video.pause()  (pas de currentTime → pas de seeked)
    //   'seek-to'     → currentTime = t SEULEMENT si paused
    //   'play'        → video.play()   (pas de currentTime → pas de seeked)
    //   'drift-check' → currentTime = t SEULEMENT si paused ET drift > seuil
    window.__dualviewApplyCmd = function(cmd) {
const video = findBestVideo(sels);
if (!video) { storePending(cmd); return false; }
ensureMuted(video);

if (cmd.action === 'pause') {
    video.pause();

} else if (cmd.action === 'seek-to') {
    // Ne jamais toucher currentTime si la vidéo est en cours de lecture.
    // Un seeked sur une vidéo en lecture déclencherait landscape → play → boucle.
    if (video.paused) {
        video.currentTime = cmd.currentTime;
    }

} else if (cmd.action === 'play') {
    // Lancer la lecture SANS forcer currentTime.
    // Le seek-to a déjà été envoyé 100 ms avant par main.js.
    const p = video.play();
    if (p && p.catch) p.catch(() => {});

} else if (cmd.action === 'drift-check') {
    // Correctif périodique : ne corriger que si la vidéo est à l'arrêt
    // ET que l'écart dépasse le seuil.
    if (video.paused) {
        const drift = Math.abs(video.currentTime - cmd.currentTime);
        if (drift > DRIFT_THRESHOLD) {
            video.currentTime = cmd.currentTime;
        }
    }
}
return true;
    };

    // ── MutationObserver pour les commandes en attente ────────────────────────
    // Un seul observer, protégé par le flag __dualviewObserverActive.
    if (!window.__dualviewObserverActive) {
window.__dualviewObserverActive = true;
new MutationObserver(function() {
    // Mute toute nouvelle vidéo insérée dans le DOM
    const v = findBestVideo(sels);
    if (v) ensureMuted(v);
    // Rejouer la commande en attente si elle n'a pas expiré
    const cmd = consumePending();
    if (cmd) window.__dualviewApplyCmd(cmd);
}).observe(document.body, { childList: true, subtree: true });
    }
    true;
})();`;

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-PAUSE SCRIPT — YouTube classique uniquement (Shorts exclus)
// ══════════════════════════════════════════════════════════════════════════════
//
// Pause la vidéo YouTube classique au chargement.
// Si une pub est en cours, attend sa fin avant de pauser.
// Retry toutes les 200 ms pendant 10 s max (50 tentatives).
//
// Garde primaire : portrait-app.js ne l'injecte PAS si isYouTubeShort(url)
// est vrai côté renderer (URL toujours fiable avant injection).
// Ce script contient uniquement un filet de sécurité URL minimal.
//
// v0.4.6 — Corrections :
//   - Ne force PLUS currentTime = 0 si l'executor a déjà reçu une commande
//     (évite le conflit avec le protocole seek-to de la sync vidéo)
//   - Flag d'abandon __dualviewAutoPauseAborted : annule les retries en vol
//     quand resetPageFlags() est appelé sur la navigation suivante
// ══════════════════════════════════════════════════════════════════════════════
const AUTO_PAUSE_SCRIPT = `
(function() {
    if (window.__dualviewAutoPauseDone) return;
    if (window.__dualviewAutoPauseAborted) return;

    const url = location.href;
    // Filet de sécurité : ne jamais s'exécuter sur un Short
    // (la garde principale est dans portrait-app.js avant injection)
    if (!url.includes('youtube.com') || url.includes('/shorts/')) return;

    const sels = ['video.html5-main-video','#movie_player video','ytd-player video','video'];
    function findVideo() {
        for (const s of sels) {
            const list = Array.from(document.querySelectorAll(s))
                .filter(v => { const r = v.getBoundingClientRect(); return r.width > 50 && r.height > 50; });
            if (list.length) return list[0];
        }
        return null;
    }
    function isAdPlaying() {
        const p = document.getElementById('movie_player');
        return p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'));
    }
    function doPause(attempts) {
        if (window.__dualviewAutoPauseDone || window.__dualviewAutoPauseAborted) return;
        const video = findVideo();
        if (video) {
            video.muted = true;
            if (isAdPlaying()) {
                let waited = 0;
                const poll = setInterval(() => {
                    waited += 500;
                    if (window.__dualviewAutoPauseAborted) { clearInterval(poll); return; }
                    if (!isAdPlaying() || waited > 120000) {
                        clearInterval(poll);
                        if (!window.__dualviewAutoPauseDone && !window.__dualviewAutoPauseAborted) {
                            window.__dualviewAutoPauseDone = true;
                            const v = findVideo();
                            if (v) { v.muted = true; if (!window.__dualviewExecutorReady) v.currentTime = 0; v.pause(); }
                        }
                    }
                }, 500);
            } else {
                window.__dualviewAutoPauseDone = true;
                video.muted = true;
                if (!window.__dualviewExecutorReady) video.currentTime = 0;
                video.pause();
            }
            return;
        }
        if (attempts < 50) setTimeout(() => doPause(attempts + 1), 200);
    }
    doPause(0);
    true;
})();`;