/*
 * DualView - Mode vidéo seule (v0.9.0)
 *
 * Isole la vidéo de la page active dans les deux fenêtres (paysage puis
 * portrait) et affiche une barre de contrôle custom (lecture/pause,
 * timeline, quitter) qui se cache automatiquement après 1 s d'inactivité
 * souris.
 *
 * Activation : UNIQUEMENT depuis cette fenêtre (paysage), via :
 *   - clic droit sur une vidéo → item "Vidéo seule" (context-menu.js
 *     → action 'video-focus-on' relayée sur le canal 'context-menu-action',
 *     déjà écouté dans landscape-tabs.js/landscape-ui.js — voir handler
 *     ajouté ci-dessous)
 *   - raccourci Ctrl+Shift+V (landscape-settings.js)
 *
 * Sortie : bouton "Quitter", Échap, ou nouvelle activation — depuis
 * n'importe laquelle des deux fenêtres (synchronisation demandée).
 *
 * Ne JAMAIS provoquer de wv.reload()/navigation pendant l'activation —
 * voir garde __dualviewVideoFocusActive dans landscape-webview.js
 * (AUTO_PAUSE_SCRIPT) et sortie propre sur did-navigate (landscape-views.js).
 *
 * Dépend de : landscape-webview.js (focusVideoActivate/Deactivate/GetState/
 *             Play/Pause/Seek), landscape-views.js (getActiveWebview,
 *             _compareActive/toggleCompareMode), landscape-ui.js (showToast, t)
 */

let videoFocusActive = false;
let videoFocusPollTimer = null;
let videoFocusMissCount = 0;
let videoFocusHideTimer = null;
let videoFocusSeeking = false; // true pendant que l'utilisateur fait glisser la timeline

const vfBar        = document.getElementById('video-focus-bar');
const vfPlayPause   = document.getElementById('vf-playpause');
const vfProgress    = document.getElementById('vf-progress');
const vfTimeCurrent = document.getElementById('vf-time-current');
const vfTimeTotal   = document.getElementById('vf-time-duration');
const vfExitBtn     = document.getElementById('vf-exit');

function _fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
}

// ── Activation ──────────────────────────────────────────────────────────────
async function activateVideoFocus() {
    if (videoFocusActive) return;
    const wv = typeof getActiveWebview === 'function' ? getActiveWebview() : null;
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') {
        if (typeof showToast === 'function') showToast(t('videoFocusNoVideo'), 2500);
        return;
    }
    // Le mode comparaison affiche une seconde webview → incompatible avec "vidéo seule"
    if (typeof _compareActive !== 'undefined' && _compareActive && typeof toggleCompareMode === 'function') {
        toggleCompareMode();
    }

    const result = await focusVideoActivate(wv);
    if (!result || !result.ok) {
        if (typeof showToast === 'function') showToast(t('videoFocusNoVideo'), 2500);
        return;
    }

    videoFocusActive = true;
    document.body.classList.add('video-focus-mode');
    vfBar.classList.remove('vf-hidden');
    if (typeof showToast === 'function') showToast(t('videoFocusOn'), 2000);

    videoFocusMissCount = 0;
    videoFocusStartPolling(wv);
    videoFocusScheduleAutoHide();

    // Relayé à portrait par main.js après un court délai (voir 'video-focus-enter')
    window.dualview.videoFocusEnter();
}

// ── Désactivation ───────────────────────────────────────────────────────────
// opts.skipWvScript : true si le contexte de la webview a déjà disparu
// (navigation complète) — inutile/risqué d'y exécuter du JS dans ce cas.
// opts.skipIpc      : true si on réagit à un ordre déjà reçu par IPC
// (évite de renvoyer l'IPC vers l'émetteur d'origine).
function deactivateVideoFocus(opts) {
    opts = opts || {};
    if (!videoFocusActive) return;
    videoFocusActive = false;

    clearInterval(videoFocusPollTimer);
    videoFocusPollTimer = null;
    clearTimeout(videoFocusHideTimer);

    document.body.classList.remove('video-focus-mode');
    vfBar.classList.remove('vf-hidden');

    if (!opts.skipWvScript) {
        const wv = typeof getActiveWebview === 'function' ? getActiveWebview() : null;
        if (wv) focusVideoDeactivate(wv);
    }
    if (typeof showToast === 'function') showToast(t('videoFocusOff'), 2000);
    if (!opts.skipIpc) window.dualview.videoFocusExit();
}

// Sortie appelée depuis landscape-views.js sur did-navigate (navigation
// complète ayant détruit le conteneur "vidéo seule" — voir commentaire dédié
// dans ce fichier). Le contexte de page est déjà reparti à zéro : on ne tente
// pas d'y exécuter FOCUS_VIDEO_DEACTIVATE_SCRIPT.
function videoFocusHandleHardNavigation() {
    if (!videoFocusActive) return;
    deactivateVideoFocus({ skipWvScript: true });
}

function toggleVideoFocus() {
    if (videoFocusActive) deactivateVideoFocus();
    else activateVideoFocus();
}

// ── Polling état vidéo (alimente la timeline + auto-hide souris) ─────────────
let _lastGuestMove = 0;
function videoFocusStartPolling(wv) {
    clearInterval(videoFocusPollTimer);
    _lastGuestMove = 0;
    videoFocusPollTimer = setInterval(async () => {
        const s = await focusVideoGetState(wv);
        if (!s) {
            // Deux échecs consécutifs (~400ms) : le conteneur a probablement
            // disparu (SPA ayant recréé son arbre au-delà de ce que le
            // MutationObserver de secours peut rattraper) → sortie propre.
            videoFocusMissCount++;
            if (videoFocusMissCount >= 2) videoFocusHandleHardNavigation();
            return;
        }
        videoFocusMissCount = 0;
        if (!videoFocusSeeking) {
            vfProgress.value = s.duration > 0 ? String(Math.round((s.currentTime / s.duration) * 1000)) : '0';
        }
        vfTimeCurrent.textContent = _fmtTime(s.currentTime);
        vfTimeTotal.textContent   = _fmtTime(s.duration);
        vfPlayPause.textContent   = s.paused ? '▶' : '⏸';
        vfPlayPause.title         = t(s.paused ? 'videoFocusPlay' : 'videoFocusPause');

        // v0.9.0 — mouvement de souris détecté CÔTÉ PAGE (voir
        // window.__dualviewFocusLastMove dans landscape-webview.js) : un
        // <webview> étant un WebContents séparé, un mousemove posé sur le
        // document hôte ne se déclenche jamais pour un mouvement au-dessus
        // du contenu de la webview — indispensable ici puisque la webview
        // occupe la quasi-totalité de la fenêtre en mode vidéo seule.
        if (s.lastMove && s.lastMove !== _lastGuestMove) {
            _lastGuestMove = s.lastMove;
            videoFocusResetAutoHide();
        }
    }, 200);
}

// ── Barre de contrôle — actions ────────────────────────────────────────────
vfPlayPause.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (!wv) return;
    if (vfPlayPause.textContent === '▶') focusVideoPlay(wv);
    else focusVideoPause(wv);
    videoFocusResetAutoHide();
});

vfProgress.addEventListener('input', () => { videoFocusSeeking = true; videoFocusResetAutoHide(); });
// La timeline est exprimée en millièmes (0-1000) pour rester indépendante de
// la durée réelle (input[type=range] n'accepte pas facilement un pas variable).
// On relit l'état courant au relâchement pour convertir en secondes exactes.
vfProgress.addEventListener('change', async () => {
    videoFocusSeeking = false;
    const wv = getActiveWebview();
    if (!wv) return;
    const s = await focusVideoGetState(wv);
    if (!s || !s.duration) return;
    const target = (Number(vfProgress.value) / 1000) * s.duration;
    focusVideoSeek(wv, target);
});

vfExitBtn.addEventListener('click', () => deactivateVideoFocus());

// ── Auto-hide de la barre (1 s d'inactivité souris, point 3 du besoin) ───────
function videoFocusScheduleAutoHide() {
    clearTimeout(videoFocusHideTimer);
    videoFocusHideTimer = setTimeout(() => {
        if (videoFocusActive) vfBar.classList.add('vf-hidden');
    }, 1000);
}
function videoFocusResetAutoHide() {
    if (!videoFocusActive) return;
    vfBar.classList.remove('vf-hidden');
    videoFocusScheduleAutoHide();
}
document.addEventListener('mousemove', () => { if (videoFocusActive) videoFocusResetAutoHide(); });
vfBar.addEventListener('mouseenter', () => { clearTimeout(videoFocusHideTimer); });
vfBar.addEventListener('mouseleave', () => { if (videoFocusActive) videoFocusScheduleAutoHide(); });

// ── Réception des ordres venant de l'autre fenêtre / du menu contextuel ──────
window.dualview.on('context-menu-action', (payload) => {
    if (!payload) return;
    if (payload.action === 'video-focus-on') activateVideoFocus();
    // v0.9.0 — raccourci clavier intercepté au niveau WebContents (main.js),
    // fonctionne même si le focus clavier est dans la webview (voir main.js).
    if (payload.action === 'video-focus-toggle') toggleVideoFocus();
    if (payload.action === 'video-focus-exit-request' && videoFocusActive) deactivateVideoFocus();
});

// Sortie demandée depuis le portrait (relayée par main.js)
window.dualview.on('video-focus-cmd', (payload) => {
    if (!payload) return;
    if (payload.action === 'exit') deactivateVideoFocus({ skipIpc: true });
});

// Play/pause/seek déclenchés depuis la barre custom du PORTRAIT
window.dualview.on('video-focus-control-cmd', (payload) => {
    if (!payload || !videoFocusActive) return;
    const wv = getActiveWebview();
    if (!wv) return;
    if (payload.action === 'play')  focusVideoPlay(wv);
    if (payload.action === 'pause') focusVideoPause(wv);
    if (payload.action === 'seek' && typeof payload.time === 'number') focusVideoSeek(wv, payload.time);
});
