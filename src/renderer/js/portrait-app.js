/*
 * DualView - Application fenêtre portrait
 * Version: 0.4.4
 *
 * Logique principale du renderer portrait :
 *   - Constantes (UA_MOBILE, DRIFT_THRESHOLD, PENDING_CMD_TTL)
 *   - État global (webviewPool, activeTabId, currentSyncState)
 *   - Indicateur sync (updateSyncIndicator)
 *   - Pool de webviews (createWebview, destroyWebview, showWebview)
 *   - Injection executor + reset flags de navigation
 *   - IPC handlers (thème, onglets, settings overlay, navigation URL,
 *                   scroll, commandes vidéo, back/forward/reload,
 *                   resize, login overlay, pub YouTube overlay)
 *   - Bouton remute (polling 2 s, MUTE_CHECK_SCRIPT)
 *   - Initialisation (startMuteCheck, applyPortraitTranslations)
 *
 * Utilisé par : portrait.html
 * Dépendances : portrait-i18n.js (PORTRAIT_I18N, tp, applyPortraitTranslations,
 *               portraitLang)
 *               portrait-webview.js (VIDEO_EXECUTOR_SCRIPT, AUTO_PAUSE_SCRIPT)
 */

    // ============================================================
    // DualView — portrait.html  v0.4.3
    // ============================================================
    // PRINCIPE FONDAMENTAL (v0.4.3)
    // ──────────────────────────────
    // Portrait est un webview INDÉPENDANT dans lequel landscape
    // injecte des commandes via IPC. Il ne génère jamais d'événements
    // vers landscape : le flux est UNIDIRECTIONNEL.
    //
    // Protocole de commandes vidéo reçues (action dans video-cmd) :
    //
    //   'pause'       → video.pause()      (exécution immédiate)
    //   'seek-to'     → video.currentTime = t  SEULEMENT si vidéo à l'arrêt
    //                   (évite de déclencher seeked → play loop)
    //   'play'        → video.play()       (exécution immédiate, pas de currentTime forcé)
    //   'drift-check' → correctif de drift : seek-to(t) SEULEMENT si
    //                   |portrait.currentTime - t| > DRIFT_THRESHOLD ET vidéo à l'arrêt
    //
    // Un seul MutationObserver par webview, détruit à chaque navigation
    // (flag __dualviewObserverActive). Aucun double-observer possible.
    //
    // pendingCmd expire après PENDING_CMD_TTL ms pour éviter l'application
    // d'une commande obsolète sur une mauvaise vidéo.
    // ============================================================

const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const DRIFT_THRESHOLD = 2.0;   // secondes — seuil pour drift-check
const PENDING_CMD_TTL = 5000;  // ms — durée de vie d'une commande en attente

const webviewCont = document.getElementById('webview-container');
const emptyState = document.getElementById('empty-state');
const syncIndicator = document.getElementById('sync-indicator');

const webviewPool = new Map();
let activeTabId = null;
let currentSyncState = 'paused';

// ── Indicateur sync ────────────────────────────────────────────────────────────
function updateSyncIndicator(state) {
    currentSyncState = state;
    if (state === 'active') {
        syncIndicator.classList.remove('paused');
        syncIndicator.textContent = tp('syncActive');
        syncIndicator.classList.add('visible');
        setTimeout(() => syncIndicator.classList.remove('visible'), 2000);
    } else {
        syncIndicator.classList.add('paused');
        syncIndicator.textContent = tp('syncPaused');
        syncIndicator.classList.add('visible');
    }
}

window.dualview.getSyncState().then(s => updateSyncIndicator(s));
window.dualview.on('sync-state-changed', s => updateSyncIndicator(s));

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO EXECUTOR SCRIPT — injecté UNE SEULE FOIS par webview (dom-ready)
// ══════════════════════════════════════════════════════════════════════════════
//
// Expose window.__dualviewApplyCmd(cmd) dans le contexte de la page web.
//
// Commandes supportées :
//   { action: 'pause' }        → video.pause()
//   { action: 'seek-to',  currentTime: t } → video.currentTime = t  (si paused)
//   { action: 'play' }         → video.play()
//   { action: 'drift-check', currentTime: t } → seek-to si drift > seuil ET paused
//
// Garanties anti-boucle :
//   1. 'seek-to' ne touche JAMAIS une vidéo en lecture → pas de seeked émis
//   2. 'play' ne force JAMAIS currentTime → pas de seeked émis
//   3. 'drift-check' conditionnel → idem
//   4. Un seul MutationObserver (flag __dualviewObserverActive)
//   5. pendingCmd expire après PENDING_CMD_TTL ms
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// POOL DE WEBVIEWS
// ══════════════════════════════════════════════════════════════════════════════

function createWebview(tabId, url) {
    if (webviewPool.has(tabId)) return webviewPool.get(tabId);
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:dualview');
    wv.setAttribute('useragent', UA_MOBILE);
    wv.setAttribute('allowpopups', '');
    wv.className = 'wv-portrait';
    wv.dataset.tabId = tabId;
    // Attacher les listeners AVANT appendChild
    attachWebviewListeners(wv, tabId);
    webviewCont.appendChild(wv);
    // Assigner src APRÈS l'attachement au DOM
    wv.src = url || 'about:blank';
    webviewPool.set(tabId, wv);
    wv.addEventListener('did-fail-load', (e) => {
        if (e.errorCode === -3) return; // ERR_ABORTED ignoré (navigation annulée)
        console.warn('[portrait] did-fail-load', e.errorCode, e.errorDescription, e.validatedURL);
    });
    return wv;
}

function destroyWebview(tabId) {
    const wv = webviewPool.get(tabId);
    if (!wv) return;
    try { wv.stop(); } catch (_) { }
    wv.remove();
    webviewPool.delete(tabId);
}

function showWebview(tabId) {
    webviewPool.forEach((wv, id) => { wv.classList.toggle('active', id === tabId); });
    const wv = webviewPool.get(tabId);
    const hasUrl = wv && wv.src && wv.src !== 'about:blank';
    emptyState.style.display = hasUrl ? 'none' : 'flex';
}

function getActiveWebview() { return webviewPool.get(activeTabId) || null; }

// ── Helper : détecte si une URL est un YouTube Short ──────────────────────
// Utilisé côté renderer (URL toujours fiable ici, contrairement au script
// injecté dans la page où le DOM Shorts peut ne pas être encore construit).
function isYouTubeShort(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const u = new URL(url);
        return (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com')
            && u.pathname.startsWith('/shorts/');
    } catch (_) { return false; }
}

// ── Injection de l'executor ────────────────────────────────────────────────
// Appelée depuis dom-ready. Réinitialise les flags de page SANS mettre
// __dualviewExecutorReady à false avant de ré-injecter — cela éviterait
// de créer un double MutationObserver si le script s'exécute deux fois.
// Le script lui-même sort immédiatement si le flag est déjà true.
function injectExecutor(wv) {
    wv.executeJavaScript(VIDEO_EXECUTOR_SCRIPT).catch(() => { });
}

// Réinitialise les flags de navigation (dom-ready ou did-navigate).
// NE touche PAS __dualviewExecutorReady : le script le gère lui-même.
function resetPageFlags(wv) {
    wv.executeJavaScript(
        // __dualviewAutoPauseAborted : annule les retries setTimeout en vol
        // (evite qu'un doPause() lance sur la page suivante apres navigation rapide).
        'window.__dualviewAutoPauseAborted=true;' +
        'window.__dualviewAutoPauseDone=false;' +
        'window.__dualviewObserverActive=false;' +
        'window.__dualviewExecutorReady=false;' +
        'window.__dualviewAutoMuteEnabled=' + autoMutePortrait + ';' +
        // Remettre à false pour que le prochain AUTO_PAUSE_SCRIPT puisse s'exécuter
        'window.__dualviewAutoPauseAborted=false;' +
        'true;'
    ).catch(() => { });
}

// ── Listeners de webview ───────────────────────────────────────────────────
function attachWebviewListeners(wv, tabId) {
    let _safetyTimer = null;  // référence au timer de sécurité, pour annulation

    wv.addEventListener('dom-ready', () => {
        // Annuler le timer précédent si une nouvelle dom-ready arrive
        // (navigation rapide) avant que le timer ait tiré.
        if (_safetyTimer) { clearTimeout(_safetyTimer); _safetyTimer = null; }

        const currentUrl = (() => { try { return wv.getURL(); } catch (_) { return ''; } })();

        // 1. Réinitialiser les flags (nouvelle page = nouvel executor)
        resetPageFlags(wv);
        // 2. Réinitialiser le dismiss du bouton remute
        resetRemuteDismiss();
        // 3. Injecter l'executor (garde interne : sort si déjà présent)
        injectExecutor(wv);
        // 4. Pause auto YouTube — exclure les Shorts (détection côté renderer,
        //    plus fiable que le test DOM/URL injecté dans la page).
        if (!isYouTubeShort(currentUrl)) {
            wv.executeJavaScript(AUTO_PAUSE_SCRIPT).catch(() => { });
        }
        // 5. Filet de sécurité à 3s (pages lentes ou SPAs)
        _safetyTimer = setTimeout(() => {
            _safetyTimer = null;
            if (!webviewPool.has(tabId)) return;
            injectExecutor(wv);
            const urlNow = (() => { try { return wv.getURL(); } catch (_) { return ''; } })();
            if (!isYouTubeShort(urlNow)) {
                wv.executeJavaScript(AUTO_PAUSE_SCRIPT).catch(() => { });
            }
        }, 3000);
    });

    // SPA navigation (YouTube, etc.) : dom-ready ne se redéclenche pas
    wv.addEventListener('did-navigate-in-page', (e) => {
        resetPageFlags(wv);
        resetRemuteDismiss();
        injectExecutor(wv);
        // e.url contient la nouvelle URL SPA — fiable ici
        if (!isYouTubeShort(e.url)) {
            wv.executeJavaScript(AUTO_PAUSE_SCRIPT).catch(() => { });
        }
    });

    // Navigation complète : même chose + AUTO_PAUSE (nouvelle vraie page)
    wv.addEventListener('did-navigate', (e) => {
        if (_safetyTimer) { clearTimeout(_safetyTimer); _safetyTimer = null; }
        resetPageFlags(wv);
        resetRemuteDismiss();
        injectExecutor(wv);
        if (!isYouTubeShort(e.url)) {
            wv.executeJavaScript(AUTO_PAUSE_SCRIPT).catch(() => { });
        }
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

// ── Thème ──────────────────────────────────────────────────────────────────
window.dualview.getTheme().then(t => document.documentElement.setAttribute('data-theme', t));
window.dualview.on('theme-changed', t => document.documentElement.setAttribute('data-theme', t));

// ── Pool d'onglets ─────────────────────────────────────────────────────────
window.dualview.on('tab-created', ({ tabId, url }) => {
    if (!webviewPool.has(tabId)) createWebview(tabId, url || '');
});

// ── Settings overlay ───────────────────────────────────────────────────────
const settingsOverlay = document.getElementById('settings-overlay');
const resumeToast     = document.getElementById('resume-toast');
const SETTINGS_TAB_ID = '__settings__';
let _resumeToastTimer = null;

function showResumeToast() {
    if (_resumeToastTimer) clearTimeout(_resumeToastTimer);
    resumeToast.classList.add('show');
    _resumeToastTimer = setTimeout(() => {
        resumeToast.classList.remove('show');
        _resumeToastTimer = null;
    }, 2500);
}

window.dualview.on('tab-switched', tabId => {
    const wasOnSettings = activeTabId === SETTINGS_TAB_ID;
    activeTabId = tabId;
    if (tabId === SETTINGS_TAB_ID) {
        settingsOverlay.classList.add('show');
        webviewPool.forEach(wv => wv.classList.remove('active'));
        emptyState.style.display = 'none';
    } else {
        settingsOverlay.classList.remove('show');
        if (!webviewPool.has(tabId)) createWebview(tabId, '');
        showWebview(tabId);
        if (wasOnSettings) showResumeToast();
    }
});

window.dualview.on('tab-closed', tabId => { destroyWebview(tabId); });

// ── Navigation URL ─────────────────────────────────────────────────────────
window.dualview.on('load-url', payload => {
    let tabId, url;
    if (typeof payload === 'string') { tabId = activeTabId; url = payload; }
    else { tabId = payload.tabId; url = payload.url; }
    if (!url || url === 'about:blank') return;
    // Créer le webview si nécessaire AVANT d'assigner src
    if (!webviewPool.has(tabId)) {
        createWebview(tabId, url);
        if (tabId === activeTabId) showWebview(tabId);
        return;
    }
    const wv = webviewPool.get(tabId);
    // Assigner src seulement si l'URL change réellement
    try {
        if (wv.getURL() !== url) wv.src = url;
    } catch (e) {
        wv.addEventListener('dom-ready', () => { wv.src = url; }, { once: true });
    }
    if (tabId === activeTabId) {
        emptyState.style.display = 'none';
        wv.classList.add('active');
    }
});

// Reprise de sync (scénario B) : l'executor est déjà présent,
// on attend simplement la prochaine commande vidéo de landscape.
window.dualview.on('sync-resume-state', ({ tabId }) => {
    const wv = webviewPool.get(tabId);
    if (!wv) return;
    // Ré-injecter l'executor au cas où la page aurait été rechargée
    // pendant la pause. Ne crée pas de double observer (flag interne).
    injectExecutor(wv);
});

// ── Scroll ─────────────────────────────────────────────────────────────────
window.dualview.on('apply-scroll', scrollPct => {
    const wv = getActiveWebview();
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;
    wv.executeJavaScript(`
        (function(){
            const el = document.documentElement;
            const max = el.scrollHeight - el.clientHeight;
            if (max > 0) window.scrollTo({ top: ${+scrollPct} * max, behavior: 'smooth' });
        })(); true;
    `).catch(() => { });
});

// ── Commandes vidéo ────────────────────────────────────────────────────────
// Reçoit { action, currentTime } depuis main.js.
// L'executor dans la webview implémente la logique anti-boucle.
window.dualview.on('video-cmd', cmd => {
    const wv = getActiveWebview();
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;
    const cmdStr = JSON.stringify(cmd);
    // Vérifier que l'executor est prêt avant d'appeler la commande.
    // Si non, l'injecter d'abord. La commande en attente sera reprise
    // par le MutationObserver de l'executor.
    wv.executeJavaScript('!!window.__dualviewExecutorReady')
        .then(ready => {
            if (ready) {
                return wv.executeJavaScript('window.__dualviewApplyCmd(' + cmdStr + '); true;');
            } else {
                return wv.executeJavaScript(VIDEO_EXECUTOR_SCRIPT)
                    .then(() => wv.executeJavaScript('window.__dualviewApplyCmd(' + cmdStr + '); true;'));
            }
        })
        .catch(() => { });
});

// ── Navigation (back / forward / reload) ───────────────────────────────────
window.dualview.on('webview-go-back',    () => { const wv = getActiveWebview(); if (wv && wv.canGoBack    && wv.canGoBack())    wv.goBack();    });
window.dualview.on('webview-go-forward', () => { const wv = getActiveWebview(); if (wv && wv.canGoForward && wv.canGoForward()) wv.goForward(); });
window.dualview.on('reload-webview',     () => { const wv = getActiveWebview(); if (wv && wv.getURL && wv.getURL() !== 'about:blank') wv.reload(); });

// ── Resize ─────────────────────────────────────────────────────────────────
window.dualview.on('resize-mode', active => { document.body.classList.toggle('resize-mode', active); });

// ── Login overlay ──────────────────────────────────────────────────────────
const loginOverlay = document.getElementById('login-overlay');
window.dualview.on('show-login-popup', () => { loginOverlay.classList.add('show'); });
window.dualview.on('login-page-cleared', () => { loginOverlay.classList.remove('show'); });

// ── Pub YouTube overlay ────────────────────────────────────────────────────
const adOverlay   = document.getElementById('ad-overlay');
const adCountdown = document.getElementById('ad-overlay-countdown');

window.dualview.on('ad-state', ({ isAd, remaining }) => {
    if (isAd) {
        adOverlay.classList.add('show');
        if (remaining !== null && remaining > 0) {
            const m = Math.floor(remaining / 60);
            const s = String(remaining % 60).padStart(2, '0');
            adCountdown.textContent = m > 0 ? tp('adCountdownMin', m, s) : tp('adCountdownSec', remaining);
            adCountdown.classList.add('show');
        } else {
            adCountdown.classList.remove('show');
        }
    } else {
        adOverlay.classList.remove('show');
        adCountdown.classList.remove('show');
    }
});

// ── Bouton remute ──────────────────────────────────────────────────────────
// Conditions d'affichage (toutes requises) :
//   1. autoMutePortrait === true  (paramètre Paramètres → Général)
//   2. Une vidéo est en cours de lecture dans le webview actif  (!video.paused)
//   3. Cette vidéo n'est pas en mute  (!video.muted)
//
// Bouton X : masque définitivement jusqu'au prochain rechargement de page
//   (flag _remuteUserDismissed remis à false à chaque dom-ready)
//
// autoMutePortrait désactivé : arrête de forcer muted dans l'executor
//   (la vidéo reste dans son état actuel, pas de démute forcé)

const remuteBtn     = document.getElementById('remute-btn');
const remuteAction  = document.getElementById('remute-action');
const remuteDismiss = document.getElementById('remute-dismiss');

let autoMutePortrait    = true;  // valeur par défaut, corrigée au démarrage
let _remuteUserDismissed = false; // remis à false à chaque dom-ready
let _muteCheckInterval   = null;

// Lire le paramètre initial
window.dualview.getAutoMutePortrait().then(v => { autoMutePortrait = v; });

// Réagir aux changements en temps réel depuis Paramètres
window.dualview.on('auto-mute-portrait-changed', enabled => {
    autoMutePortrait = enabled;
    if (!enabled) {
        // Désactivé : masquer le bouton, ne plus forcer le mute
        remuteBtn.classList.remove('show');
        _remuteUserDismissed = false;
    }
    // Mettre à jour l'executor dans le webview actif
    const wv = getActiveWebview();
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;
    wv.executeJavaScript(
        'window.__dualviewAutoMuteEnabled = ' + enabled + '; true;'
    ).catch(() => { });
});

// Réinitialiser le flag de dismiss à chaque navigation
// (appelé depuis attachWebviewListeners → dom-ready)
function resetRemuteDismiss() { _remuteUserDismissed = false; }

// Script de détection injecté dans le webview pour lire l'état vidéo
const MUTE_CHECK_SCRIPT =
    '(function(){' +
    '  const sels=["video.html5-main-video","#movie_player video","[class*=\'player\'] video","video"];' +
    '  for(const s of sels){' +
    '    const list=Array.from(document.querySelectorAll(s))' +
    '      .filter(v=>{const r=v.getBoundingClientRect();return r.width>100&&r.height>100;});' +
    '    if(list.length){' +
    '      const v=list[0];' +
    '      return {playing:!v.paused,muted:v.muted};' +
    '    }' +
    '  }' +
    '  return null;' +
    '})()';

function startMuteCheck() {
    if (_muteCheckInterval) return;
    _muteCheckInterval = setInterval(() => {
        if (!autoMutePortrait) return;
        if (_remuteUserDismissed) return;
        const wv = getActiveWebview();
        if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;
        wv.executeJavaScript(MUTE_CHECK_SCRIPT).then(state => {
            // Afficher seulement si : vidéo en lecture ET non mute
            const shouldShow = state && state.playing && !state.muted;
            remuteBtn.classList.toggle('show', !!shouldShow);
        }).catch(() => { });
    }, 2000);
}

// Zone gauche : remettre en mute
remuteAction.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (!wv) return;
    wv.executeJavaScript(
        '(function(){ document.querySelectorAll("video").forEach(v => { v.muted = true; v.__dualviewMuteApplied = true; }); return true; })()'
    ).then(() => { remuteBtn.classList.remove('show'); }).catch(() => { });
});

// Zone droite (X) : masquer définitivement jusqu'au prochain chargement
remuteDismiss.addEventListener('click', () => {
    _remuteUserDismissed = true;
    remuteBtn.classList.remove('show');
});

startMuteCheck();

// ── Traductions et langue ──────────────────────────────────────────────────────
// Lire la langue depuis les paramètres landscape et appliquer les traductions
window.dualview.getSettings().then(s => {
    if (s && s.language) portraitLang = s.language;
    applyPortraitTranslations();
});
window.dualview.on('language-changed', lang => {
    portraitLang = lang;
    applyPortraitTranslations();
    // Mettre à jour l'indicateur sync dynamiquement
    updateSyncIndicator(currentSyncState);
});