/*
 * DualView - Scripts injectés dans les webviews (fenêtre paysage)
 * Version: 0.4.4
 *
 * Ce fichier contient les scripts exécutés à l'intérieur des webviews
 * via executeJavaScript() et les fonctions utilitaires associées.
 * Ces scripts tournent dans le contexte de la page web visitée,
 * pas dans le renderer Electron.
 *
 * Constantes exportées (utilisées par landscape-app.js) :
 *   VIDEO_WATCHER_SCRIPT  - détecte l'état vidéo (play/pause/currentTime)
 *   SCROLL_INJECT         - remonte le % de scroll via __dualviewScrollPct
 *   AUTO_PAUSE_SCRIPT     - pause automatique YouTube au chargement
 *
 * Fonctions exportées :
 *   resetWatcherFlags(wv) - réinitialise les flags de la webview
 *   injectWatcher(wv)     - injecte VIDEO_WATCHER_SCRIPT
 *   injectAutoPause(wv)   - injecte AUTO_PAUSE_SCRIPT (YouTube uniquement)
 *
 * Utilisé par : landscape.html + landscape-app.js
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
const AUTO_PAUSE_SCRIPT = `
(function() {
    if (window.__dualviewAutoPauseDone) return;
    const url = location.href;
    if (!url.includes('youtube.com')) return;
    // Shorts : sortir immédiatement, aucune pause
    if (url.includes('/shorts/') ||
!!document.getElementById('shorts-container') ||
!!document.querySelector('ytd-reel-video-renderer')) return;
    window.__dualviewAutoPauseDone = true;
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
const video = findVideo();
if (video) {
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

function resetWatcherFlags(wv) {
    wv.executeJavaScript('window.__dualviewVideoWatcher=false;window.__dualviewVideoState={playing:false,currentTime:0,platform:"generic",hasVideo:false};window.__dualviewVideoEvent=null;window.__dualviewAutoPauseDone=false;true;').catch(() => { });
}
function injectWatcher(wv) { wv.executeJavaScript(VIDEO_WATCHER_SCRIPT).catch(() => { }); }

function injectAutoPause(wv) {
    if (currentSettings.autoPauseVideo === false) return;
    const url = wv.getURL ? wv.getURL() : '';
    if (!url || !url.includes('youtube.com')) return;
    wv.executeJavaScript(AUTO_PAUSE_SCRIPT).catch(() => { });
}

