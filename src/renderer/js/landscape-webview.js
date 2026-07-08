/*
 * DualView - Scripts injectés dans les webviews (fenêtre paysage)
 * Version: 0.9.2
 *
 * Changements v0.9.2 :
 * - Fix : focusVideoSeek() pause/reprend désormais la vidéo autour du seek
 *   (mode vidéo seule) pour que la synchro portrait fonctionne aussi pendant
 *   la lecture, pas seulement en pause (voir commentaire sur la fonction).
 *
 * Ce fichier contient les scripts exécutés à l'intérieur des webviews
 * via executeJavaScript() et les fonctions utilitaires associées.
 * Ces scripts tournent dans le contexte de la page web visitée,
 * pas dans le renderer Electron.
 *
 * Constantes exportées (utilisées par landscape-views.js) :
 *   VIDEO_WATCHER_SCRIPT  - détecte l'état vidéo (play/pause/currentTime)
 *   SCROLL_INJECT         - remonte le % de scroll via __dualviewScrollPct
 *   AUTO_PAUSE_SCRIPT     - pause automatique YouTube au chargement
 *
 * Fonctions exportées :
 *   resetWatcherFlags(wv) - réinitialise les flags de la webview
 *   injectWatcher(wv)     - injecte VIDEO_WATCHER_SCRIPT
 *   injectAutoPause(wv)   - injecte AUTO_PAUSE_SCRIPT (YouTube uniquement)
 *
 * Utilisé par : landscape-views.js (chargé via <script src> dans landscape.html)
 * Dépendances : aucune (pas de référence au DOM du renderer)
 */

// ── Scripts webview ────────────────────────────────────────────────────────────
const VIDEO_WATCHER_SCRIPT = `
(function() {
if (window.__dualviewVideoWatcher) return;
window.__dualviewVideoWatcher = true;
window.__dualviewVideoState = { playing:false, currentTime:0, platform:'generic', hasVideo:false };
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
            const r=v.getBoundingClientRect(); return r.width>100&&r.height>100;
        });
        if (list.length>0) { list.sort((a,b)=>{ const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect(); return(rb.width*rb.height)-(ra.width*ra.height); }); return list[0]; }
    }
    return null;
}
const platform=detectPlatform(), sels=getSelectors(platform);
let videoEl=null, attempts=0;
function attach(video) {
    if (video.__dualviewAttached) return;
    video.__dualviewAttached=true; videoEl=video;
    window.__dualviewVideoState={hasVideo:true,platform,playing:!video.paused,currentTime:video.currentTime};
    video.addEventListener('play',  ()=>{ window.__dualviewVideoState.playing=true;  window.__dualviewVideoState.currentTime=video.currentTime; window.__dualviewVideoEvent={type:'play', time:video.currentTime,platform}; });
    video.addEventListener('pause', ()=>{ window.__dualviewVideoState.playing=false; window.__dualviewVideoState.currentTime=video.currentTime; window.__dualviewVideoEvent={type:'pause',time:video.currentTime,platform}; });
    video.addEventListener('seeked',()=>{ window.__dualviewVideoState.currentTime=video.currentTime; window.__dualviewVideoEvent={type:'seek',time:video.currentTime,platform}; });
}
const findInt=setInterval(()=>{ attempts++; const v=findBestVideo(sels); if(v){attach(v);clearInterval(findInt);} else if(attempts>=60)clearInterval(findInt); if(videoEl&&!document.contains(videoEl)){const nv=findBestVideo(sels);if(nv){videoEl.__dualviewAttached=false;attach(nv);}} },500);
new MutationObserver(()=>{ if(!videoEl||!document.contains(videoEl)){const v=findBestVideo(sels);if(v)attach(v);} }).observe(document.body,{childList:true,subtree:true});
true;
})();`;

const SCROLL_INJECT = `
(function(){
if(window.__dualviewScrollWatcher)return;
window.__dualviewScrollWatcher=true;
let last=-1;
window.addEventListener('scroll',()=>{
    const el=document.documentElement,top=el.scrollTop||document.body.scrollTop,max=el.scrollHeight-el.clientHeight;
    if(max<=0)return; const pct=top/max;
    if(Math.abs(pct-last)>0.001){last=pct;window.__dualviewScrollPct=pct;}
},{passive:true});
})();true;`;

// ── Pause automatique YouTube (vidéos classiques uniquement) ──────────────────
// Shorts exclus — aucune interférence avec leur autoplay.
// Si pub en cours → attendre fin pub → pauser. Sinon → pause directe.
// v0.4.6 : flag __dualviewAutoPauseDone posé UNIQUEMENT quand la vidéo est
// trouvée, pas avant — sinon les retries sont bloqués si le player n'est
// pas encore dans le DOM au premier appel (cas sans pub).
const AUTO_PAUSE_SCRIPT = `
(function() {
    if (window.__dualviewAutoPauseDone) return;
    // v0.9.0 — ne jamais pauser pendant que le Mode vidéo seule est actif
    // (ce flag vit dans le contexte de LA PAGE, il persiste tant qu'il n'y a
    // pas de navigation complète — voir FOCUS_VIDEO_ACTIVATE_SCRIPT).
    if (window.__dualviewVideoFocusActive) return;
    const url = location.href;
    if (!url.includes('youtube.com')) return;
    // Shorts : sortir immédiatement, aucune pause
    if (url.includes('/shorts/') ||
!!document.getElementById('shorts-container') ||
!!document.querySelector('ytd-reel-video-renderer')) return;
    const selectors = ['video.html5-main-video','#movie_player video','ytd-player video','video'];
    function findVideo() {
for (const s of selectors) {
    const list = Array.from(document.querySelectorAll(s))
        .filter(v => { const r = v.getBoundingClientRect(); return r.width > 100 && r.height > 100; });
    if (list.length) return list[0];
}
return null;
    }
    function isAdPlaying() {
const player = document.getElementById('movie_player');
return player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
    }
    function doPause(attempts) {
if (window.__dualviewAutoPauseDone) return;
const video = findVideo();
if (video) {
    window.__dualviewAutoPauseDone = true;
    if (isAdPlaying()) {
        let waited = 0;
        const poll = setInterval(() => {
            waited += 500;
            if (!isAdPlaying() || waited > 120000) {
                clearInterval(poll);
                const v = findVideo();
                if (v) v.pause();
            }
        }, 500);
    } else {
        video.pause();
    }
    return;
}
if (attempts < 20) setTimeout(() => doPause(attempts + 1), 300);
    }
    doPause(0);
    true;
})()`;

// ── Mode vidéo seule (v0.9.0) ──────────────────────────────────────────────────
// Isole le <video> détecté (mêmes sélecteurs/plateformes que VIDEO_WATCHER_SCRIPT)
// dans un conteneur plein écran, et masque le reste de la page.
//
// Choix technique : on RÉ-PARENTE le <video> existant (appendChild) au lieu de
// masquer le reste du DOM en CSS. Un <video> déplacé dans le même document ne
// perd pas sa lecture ni ses listeners (ceux posés par VIDEO_WATCHER_SCRIPT
// restent donc actifs → play()/pause()/currentTime déclenchés par ce mode
// continuent de remonter par le pipeline de sync existant, sans code
// supplémentaire). Cette approche est plus robuste qu'un `display:none` en
// cascade, qui casse sur les sites utilisant `position:fixed`/z-index élevés
// ou des conteneurs avec `contain`.
//
// ⚠️ Limite connue, non testée sur toutes les plateformes : sur un site en
// React/Polymer (YouTube, Instagram, TikTok), si le framework re-render son
// arbre autour du <video> pendant que celui-ci a été déplacé, il peut le
// recréer/supprimer et casser la lecture. Le MutationObserver ci-dessous
// tente de ré-attacher un nouveau <video> trouvé dans ce cas, mais ce
// comportement doit être vérifié manuellement sur YouTube/TikTok/Instagram
// avant de considérer le correctif complet.
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
                const r=v.getBoundingClientRect(); return r.width>100&&r.height>100;
            });
            if (list.length>0) { list.sort((a,b)=>{ const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect(); return(rb.width*rb.height)-(ra.width*ra.height); }); return list[0]; }
        }
        return document.querySelector('video');
    }
    // v0.9.0 — style forcé, appliqué en continu (voir plus bas). Beaucoup de
    // lecteurs (YouTube en tête) ont leur propre boucle JS qui réapplique
    // périodiquement un style inline sur le <video> (recalcul de taille sur
    // resize/qualité/etc.) — un simple style.cssText posé UNE fois se fait
    // donc écraser peu après. On le réapplique via MutationObserver dès que
    // le site y retouche.
    const FORCED_VIDEO_STYLE = 'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;max-width:none !important;max-height:none !important;min-width:0 !important;min-height:0 !important;margin:0 !important;padding:0 !important;transform:none !important;object-fit:contain !important;object-position:center center !important;background:#000 !important;';
    function applyForcedStyle(v) {
        if (v.getAttribute('style') !== FORCED_VIDEO_STYLE) v.setAttribute('style', FORCED_VIDEO_STYLE);
        if (v.getAttribute('class')) v.removeAttribute('class');
    }
    const platform = detectPlatform();
    const video = findBestVideo(getSelectors(platform));
    if (!video) return { ok: false };

    window.__dualviewFocusActive = true;
    window.__dualviewVideoFocusActive = true; // garde AUTO_PAUSE_SCRIPT
    window.__dualviewFocusVideo = video;
    window.__dualviewFocusOriginalParent = video.parentNode;
    window.__dualviewFocusOriginalNext   = video.nextSibling;

    const container = document.createElement('div');
    container.id = '__dualview-focus-container';
    container.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;background:#000;z-index:2147483647;display:flex;align-items:center;justify-content:center;margin:0;padding:0;';
    document.documentElement.appendChild(container);
    window.__dualviewFocusOriginalVideoStyle = video.getAttribute('style') || '';
    window.__dualviewFocusOriginalVideoClass = video.getAttribute('class');
    window.__dualviewFocusOriginalVideoId    = video.getAttribute('id');
    // v0.9.0 — correctif centrage : le CSS du site (YouTube notamment) fixe
    // souvent le <video> en position:absolute + une largeur/max-width figée
    // via des classes (ex. .html5-main-video), parfois en !important. On
    // retire class/id (pour ne plus matcher les sélecteurs du site) et on
    // force chaque propriété en !important dans le style inline.
    video.removeAttribute('id');
    container.appendChild(video);
    applyForcedStyle(video);
    window.__dualviewFocusOriginalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    // Réapplique notre style/le retrait de classe dès que le site y retouche
    // (boucle interne du lecteur qui recalcule sa propre mise en page).
    if (window.__dualviewFocusStyleObserver) window.__dualviewFocusStyleObserver.disconnect();
    window.__dualviewFocusStyleObserver = new MutationObserver(function(mutations) {
        for (const m of mutations) applyForcedStyle(m.target);
    });
    window.__dualviewFocusStyleObserver.observe(video, { attributes: true, attributeFilter: ['style', 'class'] });

    // v0.9.0 — Suivi de la souris côté PAGE : un <webview> est un WebContents
    // séparé, un 'mousemove' posé sur le document hôte (Electron) ne se
    // déclenche jamais pour un mouvement de souris au-dessus du contenu de
    // la webview elle-même (même limite que le clavier, voir main.js). On
    // mémorise donc l'horodatage du dernier mouvement ICI, dans la page ;
    // landscape-video-focus.js sonde cette variable pour piloter l'auto-hide
    // de la barre de contrôle, quel que soit l'endroit de la fenêtre survolé.
    window.__dualviewFocusLastMove = Date.now();
    if (!window.__dualviewFocusMouseHooked) {
        window.__dualviewFocusMouseHooked = true;
        document.addEventListener('mousemove', function() {
            window.__dualviewFocusLastMove = Date.now();
        }, true);
    }

    // Filet de sécurité : si le framework de la page recrée son arbre et que
    // notre conteneur se retrouve vidé, on tente de raccrocher un nouveau
    // <video> trouvé ailleurs dans le DOM.
    if (!window.__dualviewFocusObserverActive) {
        window.__dualviewFocusObserverActive = true;
        new MutationObserver(function() {
            if (!window.__dualviewFocusActive) return;
            const c = document.getElementById('__dualview-focus-container');
            if (c && (!c.contains(window.__dualviewFocusVideo) || !document.contains(window.__dualviewFocusVideo))) {
                const nv = findBestVideo(getSelectors(platform));
                if (nv && nv !== window.__dualviewFocusVideo) {
                    window.__dualviewFocusVideo = nv;
                    nv.removeAttribute('id');
                    c.appendChild(nv);
                    applyForcedStyle(nv);
                    if (window.__dualviewFocusStyleObserver) {
                        window.__dualviewFocusStyleObserver.disconnect();
                        window.__dualviewFocusStyleObserver.observe(nv, { attributes: true, attributeFilter: ['style', 'class'] });
                    }
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
    }
    return { ok: true, duration: video.duration || 0 };
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
    const video = window.__dualviewFocusVideo;
    const container = document.getElementById('__dualview-focus-container');
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

// Lecture d'état pour alimenter la timeline de la barre custom (poll léger,
// voir landscape-video-focus.js). Renvoie null si le mode n'est plus actif
// côté page (ex. navigation complète ayant réinitialisé le contexte).
const FOCUS_VIDEO_STATE_SCRIPT = `
(function() {
    if (!window.__dualviewFocusActive || !window.__dualviewFocusVideo) return null;
    const v = window.__dualviewFocusVideo;
    return { currentTime: v.currentTime || 0, duration: v.duration || 0, paused: v.paused, lastMove: window.__dualviewFocusLastMove || 0 };
})();`;

function focusVideoActivate(wv)   { return wv.executeJavaScript(FOCUS_VIDEO_ACTIVATE_SCRIPT).catch(() => ({ ok: false })); }
function focusVideoDeactivate(wv) { return wv.executeJavaScript(FOCUS_VIDEO_DEACTIVATE_SCRIPT).catch(() => { }); }
function focusVideoGetState(wv)   { return wv.executeJavaScript(FOCUS_VIDEO_STATE_SCRIPT).catch(() => null); }
function focusVideoPlay(wv)  { wv.executeJavaScript('window.__dualviewFocusVideo&&window.__dualviewFocusVideo.play().catch(()=>{});true;').catch(() => { }); }
function focusVideoPause(wv) { wv.executeJavaScript('window.__dualviewFocusVideo&&window.__dualviewFocusVideo.pause();true;').catch(() => { }); }
// v0.9.2 — fix : un seek en mode vidéo seule pendant la LECTURE ne se
// synchronisait pas côté portrait. Cause : contrairement aux lecteurs natifs
// (ex. YouTube, qui pausent automatiquement pendant le scrub de leur propre
// barre de progression), cette fonction se contentait de modifier
// `currentTime` sans jamais mettre la vidéo en pause. Cela ne déclenchait
// qu'un `seeked` isolé (sans `pause`/`play` autour) sur window.__dualviewVideoEvent
// (voir écouteurs posés dans VIDEO_WATCHER_SCRIPT plus haut) → landscape-pollers.js
// route ça vers sendVideoPlay(t) → le protocole `video-cmd{seek-to}` envoyé au
// portrait est ignoré par la garde anti-boucle de portrait-webview.js
// (`if (video.paused) currentTime = t`), puisque le portrait était déjà en
// lecture à ce moment-là → seek perdu côté portrait.
// Fix : on reproduit le comportement d'un lecteur natif en pausant avant le
// seek (si la vidéo jouait) puis en relançant la lecture juste après. Cela
// déclenche la séquence pause → seeked → play, déjà gérée correctement par
// le protocole existant (le seek-to est accepté pendant la pause déclenchée
// par ce même appel). Aucune modification du protocole partagé
// (main.js / preload-landscape.js / landscape-pollers.js / portrait-webview.js)
// n'a été nécessaire.
function focusVideoSeek(wv, t) {
    const script = `(function(){
        const v = window.__dualviewFocusVideo;
        if (!v) return false;
        const wasPlaying = !v.paused;
        if (wasPlaying) v.pause();
        v.currentTime = ${Number(t)};
        if (wasPlaying) setTimeout(() => { v.play().catch(() => {}); }, 120);
        return true;
    })();`;
    wv.executeJavaScript(script).catch(() => { });
}

function resetWatcherFlags(wv) {
    wv.executeJavaScript('window.__dualviewVideoWatcher=false;window.__dualviewVideoState={playing:false,currentTime:0,platform:"generic",hasVideo:false};window.__dualviewVideoEvent=null;window.__dualviewAutoPauseDone=false;true;').catch(() => { });
}
function injectWatcher(wv) { wv.executeJavaScript(VIDEO_WATCHER_SCRIPT).catch(() => { }); }

function injectAutoPause(wv) {
    if (currentSettings.autoPauseVideo === false) return;
    const url = wv.getURL ? wv.getURL() : '';
    if (!url || !url.includes('youtube.com')) return;
    if (url.includes('/shorts/')) return;
    wv.executeJavaScript(AUTO_PAUSE_SCRIPT).catch(() => { });
}