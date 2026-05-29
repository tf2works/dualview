/**
 * DualView - Landscape Webview Pool
 * Version: 0.4.2
 *
 * Création, destruction et gestion du pool de webviews :
 *   createWebview, destroyWebview, showWebview,
 *   getActiveWebview, attachWebviewListeners
 *
 * Dépend de : state.js, i18n.js, ui-utils.js, navigation.js (navigate),
 *             tabs-manager.js (renderTabs, saveTabs, addToHistory)
 */

'use strict';

// ── Scripts injectés dans les webviews ────────────────────────────────────────

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

// ── Helpers scripts ───────────────────────────────────────────────────────────

function resetWatcherFlags(wv) {
    wv.executeJavaScript(
        'window.__dualviewVideoWatcher=false;window.__dualviewVideoState={playing:false,currentTime:0,platform:"generic",hasVideo:false};window.__dualviewVideoEvent=null;true;'
    ).catch(() => { });
}

function injectWatcher(wv) {
    wv.executeJavaScript(VIDEO_WATCHER_SCRIPT).catch(() => { });
}

// ── Détection pages de connexion (renderer) ───────────────────────────────────
// Duplication intentionnelle depuis url-detector.js (Node) — le renderer
// n'a pas accès aux modules Node ; la logique est identique.

const LOGIN_PATTERNS = [
    /\/login\b/i, /\/signin\b/i, /\/sign-in\b/i, /\/sign_in\b/i,
    /\/auth\b/i, /\/oauth\b/i, /\/connexion\b/i, /\/identification\b/i,
    /\/compte\/connexion/i, /\/account\/login/i,
];
const LOGIN_WHITELIST = ['localhost', '127.0.0.1'];

function isLoginPage(url) {
    try {
        const u = new URL(url);
        if (LOGIN_WHITELIST.some(d => u.hostname.includes(d))) return false;
        if (/\/callback|\/token|\/redirect/i.test(u.pathname)) return false;
        return LOGIN_PATTERNS.some(re => re.test(u.pathname + u.search));
    } catch { return false; }
}

// ── Gestion du pool ───────────────────────────────────────────────────────────

function createWebview(tabId, url) {
    if (webviewPool.has(tabId)) return webviewPool.get(tabId);
    const webviewCont = document.getElementById('webview-container');
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:dualview');
    wv.setAttribute('useragent', UA_DESKTOP);
    wv.setAttribute('allowpopups', '');
    wv.className = 'wv-landscape';
    wv.dataset.tabId = tabId;
    // Attacher les listeners AVANT appendChild, puis assigner src APRÈS
    attachWebviewListeners(wv, tabId);
    webviewCont.appendChild(wv);
    wv.src = url || 'about:blank';
    webviewPool.set(tabId, wv);
    window.dualview.createTab(tabId, url || '');
    return wv;
}

function destroyWebview(tabId) {
    const wv = webviewPool.get(tabId);
    if (!wv) return;
    try { wv.stop(); } catch (_) { }
    wv.remove();
    webviewPool.delete(tabId);
    window.dualview.closeTab(tabId);
}

function showWebview(tabId) {
    webviewPool.forEach((wv, id) => { wv.classList.toggle('active', id === tabId); });
    const wv = webviewPool.get(tabId);
    const hasUrl = wv && wv.src && wv.src !== 'about:blank';
    document.getElementById('empty-state').style.display = hasUrl ? 'none' : 'flex';
}

function getActiveWebview() {
    return webviewPool.get(activeTabId) || null;
}

function sendNavState(wv) {
    if (!wv) wv = getActiveWebview();
    window.dualview.notifyNavState({
        canGoBack:    wv && wv.canGoBack    ? wv.canGoBack()    : false,
        canGoForward: wv && wv.canGoForward ? wv.canGoForward() : false,
    });
}

// ── Listeners webview ─────────────────────────────────────────────────────────

function attachWebviewListeners(wv, tabId) {
    wv.addEventListener('dom-ready', () => {
        resetWatcherFlags(wv);
        injectWatcher(wv);
        wv.executeJavaScript(SCROLL_INJECT).catch(() => { });
        setTimeout(() => { if (webviewPool.has(tabId)) injectWatcher(wv); }, 2000);
        setTimeout(() => { if (webviewPool.has(tabId)) injectWatcher(wv); }, 5000);
        if (tabId === activeTabId) sendNavState(wv);
        applyWebviewTheme(wv);
    });

    // Liens target="_blank" → nouvel onglet DualView (v0.4.1)
    wv.addEventListener('new-window', (e) => {
        e.preventDefault();
        const url = e.url;
        if (!url || url === 'about:blank') return;
        try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol)) return;
        } catch { return; }
        addTabWithUrl(url);
    });

    wv.addEventListener('did-navigate', (e) => {
        resetWatcherFlags(wv);
        if (e.url && e.url !== 'about:blank') {
            if (tabId === activeTabId) {
                if (isLoginPage(e.url)) window.dualview.notifyLoginPage(e.url, tabId);
                else window.dualview.notifyLoginPageLeft(tabId);
            }
            const tab = tabs.find(t => t.id === tabId);
            if (tab) {
                tab.url = e.url;
                try {
                    const host = new URL(e.url).hostname.replace('www.', '');
                    tab.title = host.length > 18 ? host.slice(0, 18) + '…' : host;
                } catch { tab.title = e.url.slice(0, 20); }
                if (tabId === activeTabId) {
                    renderTabs();
                    saveTabs();
                    document.getElementById('url-input').value = e.url;
                    window.dualview.sendNavigate(e.url);
                }
            }
            addToHistory(tabId, e.url);
            if (tabId === activeTabId) {
                const htab = tabs.find(t => t.id === tabId);
                window.dualview.historyAdd(e.url, htab ? htab.title : '', tabId);
            }
        }
        if (tabId === activeTabId) sendNavState(wv);
    });

    wv.addEventListener('did-navigate-in-page', (e) => {
        resetWatcherFlags(wv);
        if (e.url && e.url !== 'about:blank') {
            if (tabId === activeTabId) {
                if (isLoginPage(e.url)) window.dualview.notifyLoginPage(e.url, tabId);
                else window.dualview.notifyLoginPageLeft(tabId);
            }
            const tab = tabs.find(t => t.id === tabId);
            if (tab) {
                tab.url = e.url;
                if (tabId === activeTabId) {
                    renderTabs();
                    saveTabs();
                    document.getElementById('url-input').value = e.url;
                    window.dualview.sendNavigate(e.url);
                }
            }
        }
        if (tabId === activeTabId) sendNavState(wv);
        if (webviewPool.has(tabId)) {
            wv.executeJavaScript(SCROLL_INJECT).catch(() => { });
            injectWatcher(wv);
        }
    });
}
