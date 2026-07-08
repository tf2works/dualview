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
// MODE VIDÉO SEULE (v0.9.0)
// ══════════════════════════════════════════════════════════════════════════════
//
// Même principe que côté paysage (landscape-webview.js) : on ré-parente le
// <video> détecté dans un conteneur plein écran plutôt que de masquer le
// reste du DOM en CSS. Contrairement au paysage, l'activation ici ne nécessite
// PAS de conserver de référence persistante au nœud : __dualviewApplyCmd()
// (VIDEO_EXECUTOR_SCRIPT) recherche déjà la vidéo à chaque commande reçue via
// findBestVideo(), et la retrouvera où qu'elle soit dans le DOM tant qu'elle y
// est toujours — le portrait n'est jamais la source de la lecture (toujours
// pilotée depuis le paysage), donc aucune logique de contrôle locale ici.
const FOCUS_VIDEO_ACTIVATE_SCRIPT = `
(function() {
    if (window.__dualviewFocusActive) return { ok: true };
    function detectPlatform() {
        const h = location.hostname;
        if (h.includes('youtube.com'))   return 'youtube';
        if (h.includes('tiktok.com'))    return 'tiktok';
        if (h.includes('instagram.com')) return 'instagram';
        return 'generic';
    }
    function getSelectors(p) {
        if (p==='youtube')   return ['video.html5-main-video','#movie_player video','ytd-player video','video'];
        if (p==='tiktok')    return ['video[class*="video"]','.video-player video','[class*="player"] video','video'];
        if (p==='instagram') return ['video[playsinline]','article video','[role="presentation"] video','video'];
        return ['video'];
    }
    function findBestVideo(sels) {
        for (const s of sels) {
            const list = Array.from(document.querySelectorAll(s)).filter(v=>{
                const r=v.getBoundingClientRect(); return r.width>50&&r.height>50;
            });
            if (list.length>0) { list.sort((a,b)=>{ const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect(); return(rb.width*rb.height)-(ra.width*ra.height); }); return list[0]; }
        }
        return document.querySelector('video');
    }
    const video = findBestVideo(getSelectors(detectPlatform()));
    if (!video) return { ok: false };
    // v0.9.0 — style forcé + réapplication continue (voir commentaire complet
    // dans landscape-webview.js : beaucoup de lecteurs réappliquent leur
    // propre style inline en continu, un cssText posé une seule fois se fait
    // écraser peu après).
    const FORCED_VIDEO_STYLE = 'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;max-width:none !important;max-height:none !important;min-width:0 !important;min-height:0 !important;margin:0 !important;padding:0 !important;transform:none !important;object-fit:contain !important;object-position:center center !important;background:#000 !important;';
    function applyForcedStyle(v) {
        if (v.getAttribute('style') !== FORCED_VIDEO_STYLE) v.setAttribute('style', FORCED_VIDEO_STYLE);
        if (v.getAttribute('class')) v.removeAttribute('class');
    }

    window.__dualviewFocusActive = true;
    window.__dualviewVideoFocusActive = true; // garde AUTO_PAUSE_SCRIPT
    window.__dualviewFocusOriginalParent = video.parentNode;
    window.__dualviewFocusOriginalNext   = video.nextSibling;
    window.__dualviewFocusOriginalVideoStyle = video.getAttribute('style') || '';
    window.__dualviewFocusOriginalVideoClass = video.getAttribute('class');
    window.__dualviewFocusOriginalVideoId    = video.getAttribute('id');

    const container = document.createElement('div');
    container.id = '__dualview-focus-container';
    container.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;background:#000;z-index:2147483647;display:flex;align-items:center;justify-content:center;margin:0;padding:0;';
    document.documentElement.appendChild(container);
    video.removeAttribute('id');
    container.appendChild(video);
    applyForcedStyle(video);
    window.__dualviewFocusOriginalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    if (window.__dualviewFocusStyleObserver) window.__dualviewFocusStyleObserver.disconnect();
    window.__dualviewFocusStyleObserver = new MutationObserver(function(mutations) {
        for (const m of mutations) applyForcedStyle(m.target);
    });
    window.__dualviewFocusStyleObserver.observe(video, { attributes: true, attributeFilter: ['style', 'class'] });

    // v0.9.0 — suivi du mouvement de souris côté PAGE (voir commentaire
    // complet dans landscape-webview.js) : indispensable pour l'auto-hide de
    // la barre custom portrait puisque la webview occupe quasi toute la fenêtre.
    window.__dualviewFocusLastMove = Date.now();
    if (!window.__dualviewFocusMouseHooked) {
        window.__dualviewFocusMouseHooked = true;
        document.addEventListener('mousemove', function() {
            window.__dualviewFocusLastMove = Date.now();
        }, true);
    }
    return { ok: true };
})();`;

const FOCUS_VIDEO_DEACTIVATE_SCRIPT = `
(function() {
    if (!window.__dualviewFocusActive) return true;
    window.__dualviewFocusActive = false;
    window.__dualviewVideoFocusActive = false;
    if (window.__dualviewFocusStyleObserver) {
        window.__dualviewFocusStyleObserver.disconnect();
        window.__dualviewFocusStyleObserver = null;
    }
    const container = document.getElementById('__dualview-focus-container');
    const video = container ? container.querySelector('video') : null;
    if (video) {
        video.setAttribute('style', window.__dualviewFocusOriginalVideoStyle || '');
        if (window.__dualviewFocusOriginalVideoClass !== null && window.__dualviewFocusOriginalVideoClass !== undefined) {
            video.setAttribute('class', window.__dualviewFocusOriginalVideoClass);
        } else {
            video.removeAttribute('class');
        }
        if (window.__dualviewFocusOriginalVideoId !== null && window.__dualviewFocusOriginalVideoId !== undefined) {
            video.setAttribute('id', window.__dualviewFocusOriginalVideoId);
        } else {
            video.removeAttribute('id');
        }
        const parent = window.__dualviewFocusOriginalParent;
        if (parent && document.contains(parent)) {
            if (window.__dualviewFocusOriginalNext && parent.contains(window.__dualviewFocusOriginalNext)) {
                parent.insertBefore(video, window.__dualviewFocusOriginalNext);
            } else {
                parent.appendChild(video);
            }
        }
    }
    if (container) container.remove();
    document.documentElement.style.overflow = window.__dualviewFocusOriginalOverflow || '';
    return true;
})();`;

// Lecture d'état pour la timeline de la barre custom portrait. Le portrait
// n'est jamais la source de vérité : cet état reflète simplement où en est
// SA copie de la vidéo, tenue à jour par VIDEO_EXECUTOR_SCRIPT (sync depuis
// le paysage).
const FOCUS_VIDEO_STATE_SCRIPT = `
(function() {
    if (!window.__dualviewFocusActive) return null;
    const c = document.getElementById('__dualview-focus-container');
    const v = c ? c.querySelector('video') : null;
    if (!v) return null;
    return { currentTime: v.currentTime || 0, duration: v.duration || 0, paused: v.paused, lastMove: window.__dualviewFocusLastMove || 0 };
})();`;

function focusVideoActivate(wv)   { return wv.executeJavaScript(FOCUS_VIDEO_ACTIVATE_SCRIPT).catch(() => ({ ok: false })); }
function focusVideoDeactivate(wv) { return wv.executeJavaScript(FOCUS_VIDEO_DEACTIVATE_SCRIPT).catch(() => { }); }
function focusVideoGetState(wv)   { return wv.executeJavaScript(FOCUS_VIDEO_STATE_SCRIPT).catch(() => null); }

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
    // v0.9.0 — ne jamais pauser pendant que le Mode vidéo seule est actif
    if (window.__dualviewVideoFocusActive) return;

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