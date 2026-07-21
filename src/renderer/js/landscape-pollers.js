/*
 * DualView - Pollers et initialisation
 * Version: 0.6.1
 *
 * Polling pub YouTube (500 ms), polling vidéo/drift-check (v0.4.3),
 * polling scroll (100 ms).
 * Initialisation complète de l'application au chargement.
 *
 * v0.9.3 : branche 'seek' du protocole vidéo — route désormais vers
 *   sendVideoSeekWhilePlaying() (au lieu de sendVideoPlay()) quand la vidéo
 *   landscape est déjà en lecture au moment du seek, pour corriger les
 *   seeks non synchronisés vers portrait (flèches, j/l, touches 0-9 YouTube).
 *
 * v0.6.1 : restauration des onglets épinglés au démarrage (pinnedTabs
 *   transmis à groupsLoad — désormais persistés entre sessions).
 *
 * v0.5.4 : suppression du bloc getIsDev / toggleDevTools / dev-btn / F12.
 *   DevTools accessibles via Ctrl+Maj+I (natif Electron).
 *
 * Dépendances : tous les modules landscape-*.js
 */

// ── Pollers ────────────────────────────────────────────────────────────────────
let lastVideoEvent = null, lastTimeSyncAt = 0;

// ── Polling pub YouTube ───────────────────────────────────────────────────────
// Toutes les 500ms : détecte si une pub est en cours + extrait le compte à rebours.
// Le compte à rebours YouTube est dans .ytp-ad-duration-remaining (texte "0:15")
// ou dans .ytp-time-display sur le player pub.
let _lastAdState = false;
const AD_POLL_SCRIPT = `
(function(){
    const player = document.getElementById('movie_player');
    if (!player) return { isAd: false, remaining: null };
    const isAd = player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
    if (!isAd) return { isAd: false, remaining: null };
    // Tenter d'extraire la durée restante
    // YouTube affiche le temps restant dans plusieurs éléments selon la version du player
    let remaining = null;
    const selectors = [
'.ytp-ad-duration-remaining',
'.video-ads .ytp-time-display .ytp-time-current',
'.ytp-ad-preview-container .ytp-ad-duration-remaining',
    ];
    for (const sel of selectors) {
const el = document.querySelector(sel);
if (el && el.textContent.trim()) {
    const text = el.textContent.trim(); // format "0:15" ou "15"
    const parts = text.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        remaining = parts[0] * 60 + parts[1];
    } else if (parts.length === 1 && !isNaN(parts[0])) {
        remaining = parts[0];
    }
    if (remaining !== null) break;
}
    }
    return { isAd: true, remaining };
})()`;

function pollAdState(wv) {
    wv.executeJavaScript(AD_POLL_SCRIPT).then(result => {
        if (!result) return;
        const isAd = result.isAd;
        // Envoyer uniquement si l'état change OU si pub en cours (pour mettre à jour le compte à rebours)
        if (isAd !== _lastAdState || isAd) {
            _lastAdState = isAd;
            window.dualview.sendAdState({ isAd, remaining: result.remaining });
        }
    }).catch(() => { });
}

// ── Polling vidéo (v0.4.3 — séquençage strict ; v0.9.3 — 3e chemin) ──────
//
// Trois chemins distincts selon l'action détectée :
//
//  play  → sendVideoPlay(t)             main.js envoie ① seek-to(t) puis ② play() +100ms
//  pause → sendVideoPause(t)            main.js envoie ① pause()    puis ② seek-to(t) +50ms
//  seek  → on lit l'état courant (playing/paused) et on dispatche :
//            - vidéo landscape en pause  → sendVideoPause(t)  (seek-to appliqué directement)
//            - vidéo landscape en lecture → sendVideoSeekWhilePlaying(t)  (v0.9.3)
//              main.js envoie ① pause() ② seek-to(t) +50ms ③ play() +150ms
//              Nécessaire pour tout seek qui arrive SANS pause préalable
//              (flèches ←/→, j/l, touches 0-9 YouTube, scrub qui ne pause
//              pas la vidéo...) : à cet instant le portrait est déjà en
//              lecture lui aussi, donc un simple seek-to serait ignoré par
//              la garde anti-boucle de portrait-webview.js.
//
// Drift guard (toutes les 5s, lecture en cours) :
//  → sendVideoDriftCheck(t)   portrait n'applique ce seek QUE si sa vidéo est à l'arrêt
//    Ainsi la correction de drift ne peut jamais déclencher seeked dans landscape.

function pollVideoState() {
    if (currentSyncState !== 'active') return;
    const wv = getActiveWebview();
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;

    // Polling pub (toutes les 150ms, script léger)
    pollAdState(wv);

    wv.executeJavaScript('window.__dualviewVideoEvent||null').then(evt => {
        if (!evt) return;
        const key = evt.type + '_' + Math.round(evt.time * 10);
        if (key === lastVideoEvent) return;
        lastVideoEvent = key;
        wv.executeJavaScript('window.__dualviewVideoEvent=null;true;').catch(() => { });

        if (evt.type === 'play') {
            showIndicator('Lecture (' + evt.platform + ')', false);
            window.dualview.sendVideoPlay(evt.time);
        }
        if (evt.type === 'pause') {
            showIndicator('Pause (' + evt.platform + ')', true);
            window.dualview.sendVideoPause(evt.time);
        }
        // seek SPA (YouTube navigation entre vidéos) OU seek manuel
        // (flèches, j/l, touches 0-9, scrub...) : on lit l'état réel du
        // player avant d'envoyer la commande. v0.9.3 : si la vidéo joue déjà,
        // on passe par sendVideoSeekWhilePlaying (pause→seek→play) plutôt que
        // sendVideoPlay, sinon le seek-to est ignoré côté portrait (déjà en
        // lecture à ce moment-là — voir commentaire du bloc ci-dessus).
        if (evt.type === 'seek') {
            wv.executeJavaScript('(window.__dualviewVideoState&&window.__dualviewVideoState.playing)||false')
                .then(isPlaying => {
                    if (isPlaying) window.dualview.sendVideoSeekWhilePlaying(evt.time);
                    else window.dualview.sendVideoPause(evt.time);
                }).catch(() => { });
        }
    }).catch(() => { });

    // Drift guard toutes les 5s (seulement si lecture en cours dans landscape)
    const now = Date.now();
    if (now - lastTimeSyncAt >= 5000) {
        lastTimeSyncAt = now;
        wv.executeJavaScript('window.__dualviewVideoState||null').then(s => {
            if (s && s.hasVideo && s.playing) {
                showIndicator('Lecture (' + s.platform + ')', false);
                // drift-check : portrait corrige seulement si sa vidéo est à l'arrêt
                window.dualview.sendVideoDriftCheck(s.currentTime);
            } else if (s && s.hasVideo) {
                showIndicator('Pause (' + s.platform + ')', true);
            } else {
                hideIndicator();
            }
        }).catch(() => { });
    }
}
setInterval(pollVideoState, 150);

function resetVideoCounters() { lastVideoEvent = null; lastTimeSyncAt = 0; hideIndicator(); }

let lastScrollPct = -1;
function pollScroll() {
    if (currentSyncState !== 'active') return;
    const wv = getActiveWebview();
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;
    wv.executeJavaScript('window.__dualviewScrollPct||0').then(pct => {
        if (typeof pct === 'number' && Math.abs(pct - lastScrollPct) > 0.001) {
            lastScrollPct = pct;
            window.dualview.sendScroll(pct);
            // ── Scroll synchronisé sur le compare-wv (P4-K — v0.8.0) ──────────
            // Même % de scroll que la webview desktop, appliqué en pixels
            // relatifs à la hauteur scrollable de la page mobile.
            const cwv = typeof getCompareWebview === 'function' ? getCompareWebview() : null;
            if (cwv) {
                cwv.executeJavaScript(
                    `(function(){const el=document.documentElement,max=el.scrollHeight-el.clientHeight;if(max>0)window.scrollTo(0,max*${pct});})();true;`
                ).catch(() => { });
            }
        }
    }).catch(() => { });
}
setInterval(pollScroll, 100);

// ── Polling zoom Ctrl+molette (v1.0.1) ────────────────────────────────────
// Lit le delta accumulé par ZOOM_WHEEL_INJECT (landscape-webview.js) et
// applique le zoom via adjustZoom() — la même fonction déjà utilisée par les
// raccourcis clavier Ctrl+/Ctrl-/Ctrl+0 (landscape-views.js).
// Seuil de conversion : ~100 unités de deltaY natif ≈ un cran de molette
// standard → on le traduit en un pas de zoom de 10% (cohérent avec le pas
// des raccourcis clavier, qui font ±5% par pression).
function pollZoomWheel() {
    const wv = getActiveWebview();
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;
    wv.executeJavaScript('(function(){const d=window.__dualviewZoomWheelDelta||0;window.__dualviewZoomWheelDelta=0;return d;})()')
        .then(delta => {
            if (typeof delta !== 'number' || delta === 0) return;
            // deltaY > 0 = molette vers le bas = dézoomer ; < 0 = zoomer
            const steps = delta / 100;
            if (typeof adjustZoom === 'function') adjustZoom(steps > 0 ? -0.1 : 0.1);
        }).catch(() => { });
}
setInterval(pollZoomWheel, 150);

// ── Polling boutons latéraux souris (v1.0.2) ──────────────────────────────
// Lit la commande accumulée par MOUSE_NAV_INJECT (landscape-webview.js) et
// déclenche la même navigation que les boutons ← → de la toolbar
// (window.dualview.navBack/navForward, déjà utilisés par backBtn/forwardBtn
// dans landscape-ui.js — comportement 100% cohérent avec la sync portrait,
// la pile de navigation simulée, etc.)
function pollMouseNav() {
    const wv = getActiveWebview();
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;
    wv.executeJavaScript('(function(){const c=window.__dualviewMouseNavCmd;window.__dualviewMouseNavCmd=null;return c;})()')
        .then(cmd => {
            if (cmd === 'back' && !backBtn.disabled) window.dualview.navBack();
            else if (cmd === 'forward' && !forwardBtn.disabled) window.dualview.navForward();
        }).catch(() => { });
}
setInterval(pollMouseNav, 100);

// ── Initialisation ─────────────────────────────────────────────────────────────
window.dualview.getSyncState().then(state => updateSyncUI(state));

// v0.5.4 : bloc getIsDev / toggleDevTools / dev-btn / F12 supprimé.
// DevTools accessibles via Ctrl+Maj+I (natif Electron, toutes les fenêtres).

window.dualview.getStore().then(({ tabs: st, activeTabId: sa, settings, groups, tabGroupOf, pinnedTabs }) => {
    loadSettingsUI(settings || {});
    const restore = settings && settings.restoreTabs !== false;
    let initTabs, initActiveId;
    if (restore && st && st.length > 0) {
        initTabs = st; initActiveId = sa || st[0].id;
    } else {
        const homepageUrl = getNewTabUrl();
        initTabs = [{ id: 'tab-1', title: homepageUrl ? '' : t('newTab'), url: homepageUrl }];
        initActiveId = 'tab-1';
    }
    // v0.6.0 : restaurer les groupes depuis le store
    // v0.6.1 : restaurer aussi les onglets épinglés (désormais persistés entre sessions)
    if (typeof groupsLoad === 'function') {
        groupsLoad({ groups: groups || [], tabGroupOf: tabGroupOf || {}, pinnedTabs: pinnedTabs || [] });
    }
    tabs = initTabs; activeTabId = initActiveId;
    tabs.forEach(tab => {
        if (!isSettingsTab(tab)) {
            // v0.9.0 — initialiser la pile de navigation simulée avant createWebview
            if (typeof initNavStack === 'function') {
                initNavStack(tab.id, tab.navStack, tab.navIndex);
            }
            createWebview(tab.id, tab.url || '');
        }
    });
    if (activeTabId === SETTINGS_TAB_ID) {
        const firstWeb = tabs.find(t => t.id !== SETTINGS_TAB_ID);
        activeTabId = firstWeb ? firstWeb.id : tabs[0].id;
    }
    showWebview(activeTabId);
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.url) {
        document.getElementById('url-input').value = activeTab.url;
        // Initialiser le bouton étoile favoris (v0.4.7)
        refreshFavoriteBtnForUrl(activeTab.url);
    }
    window.dualview.switchTab(activeTabId);
    renderTabs();

    // v0.9.0 — Activer les boutons ← → immédiatement si la pile simulée
    // contient de l'historique, sans attendre did-navigate (~500 ms plus tard).
    if (typeof simCanGoBack !== 'undefined' && activeTabId !== SETTINGS_TAB_ID) {
        const canBack = simCanGoBack(activeTabId);
        const canFwd  = simCanGoForward ? simCanGoForward(activeTabId) : false;
        if (canBack || canFwd) updateNavButtons({ canGoBack: canBack, canGoForward: canFwd });
    }
});