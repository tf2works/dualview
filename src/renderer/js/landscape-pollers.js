/*
 * DualView - Pollers et initialisation
 * Version: 0.4.4
 *
 * Polling pub YouTube (500 ms), polling vidéo/drift-check (v0.4.3),
 * polling scroll (100 ms).
 * Initialisation complète de l'application au chargement.
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

// ── Polling vidéo (v0.4.3 — séquençage strict) ────────────────────────────
//
// Trois chemins distincts selon l'action détectée :
//
//  play  → sendVideoPlay(t)   main.js envoie ① seek-to(t) puis ② play() +100ms
//  pause → sendVideoPause(t)  main.js envoie ① pause()    puis ② seek-to(t) +50ms
//  seek  → on lit l'état courant (playing/paused) et on dispatche en play ou pause
//          (identique à avant mais sans jamais envoyer un play supplémentaire sur seek)
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
        // seek SPA (YouTube navigation entre vidéos) :
        // on lit l'état réel du player avant d'envoyer la commande
        if (evt.type === 'seek') {
            wv.executeJavaScript('(window.__dualviewVideoState&&window.__dualviewVideoState.playing)||false')
                .then(isPlaying => {
                    if (isPlaying) window.dualview.sendVideoPlay(evt.time);
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
        }
    }).catch(() => { });
}
setInterval(pollScroll, 100);

// ── Initialisation ─────────────────────────────────────────────────────────────
window.dualview.getSyncState().then(state => updateSyncUI(state));

// Mode dev : activer classe CSS + raccourci bouton 🔧
window.dualview.getIsDev().then(isDev => {
    if (!isDev) return;

    document.body.classList.add('dev-mode');

    // ── Bouton 🔧 : DevTools de la webview active ──────────────────────────
    document.getElementById('dev-btn').addEventListener('click', () => {
        const wv = getActiveWebview();
        if (!wv) return;
        if (wv.isDevToolsOpened()) wv.closeDevTools();
        else wv.openDevTools();
    });

    // ── F12 : DevTools de la fenêtre landscape (renderer) ──────────────────
    // Géré dans le renderer car main n'a pas accès aux webviews du pool.
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'F12') return;
        e.preventDefault();

        if (e.ctrlKey || e.metaKey) {
            // Ctrl+F12 → DevTools de la webview active
            const wv = getActiveWebview();
            if (!wv) return;
            if (wv.isDevToolsOpened()) wv.closeDevTools();
            else wv.openDevTools();
        } else {
            // F12 → DevTools de la fenêtre landscape elle-même
            // Passe par IPC car le renderer ne peut pas appeler
            // webContents.openDevTools() sur sa propre fenêtre directement
            window.dualview.toggleDevTools();
        }
    });
});

window.dualview.getStore().then(({ tabs: st, activeTabId: sa, settings }) => {
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
    tabs = initTabs; activeTabId = initActiveId;
    tabs.forEach(tab => { if (!isSettingsTab(tab)) createWebview(tab.id, tab.url || ''); });
    if (activeTabId === SETTINGS_TAB_ID) {
        const firstWeb = tabs.find(t => t.id !== SETTINGS_TAB_ID);
        activeTabId = firstWeb ? firstWeb.id : tabs[0].id;
    }
    showWebview(activeTabId);
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.url) document.getElementById('url-input').value = activeTab.url;
    window.dualview.switchTab(activeTabId);
    renderTabs();
});
