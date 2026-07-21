/*
 * DualView - Pool de webviews + popup login
 * Version: 0.9.0
 *
 * Création/destruction/affichage des webviews (une par onglet),
 * injection des scripts (watcher, scroll, auto-pause, cosmétique),
 * détection des pages de connexion et popup associé.
 *
 * v0.9.0 : pile de navigation persistante. Chaque onglet maintient
 *   navStack[] + navIndex en mémoire, synchronisés dans tabs[] pour
 *   être persistés via saveTabs(). Après redémarrage, la pile native
 *   Chromium est vide mais notre pile est restaurée → les boutons ←/→
 *   restent fonctionnels (mode simulé = rechargement de l'URL précédente).
 *   Dès qu'une navigation organique survient, on repasse en mode natif.
 *   Les navHooks (définis dans landscape-ui.js) sont overridés ici pour
 *   être sim-aware de façon non-destructive.
 *
 * v0.7.1 : indicateur de chargement (barre 3px) ; find-in-page (Ctrl+F) ;
 *   zoom par domaine (Ctrl+/−/0) ; restauration zoom sur navigation ;
 *   plugins="true" documenté (PDF natif v0.7.0).
 *
 * v0.7.0 : plugins="true" (lecteur PDF natif Chromium) ; récupération
 *   après crash webview (render-process-gone/unresponsive).
 *
 * Dépendances : landscape-i18n.js, landscape-ui.js (webviewPool,
 *               activeTabId, showToast, updateNavButtons, navHooks, …),
 *               landscape-webview.js (VIDEO_WATCHER_SCRIPT, SCROLL_INJECT,
 *               AUTO_PAUSE_SCRIPT, resetWatcherFlags, injectWatcher,
 *               injectAutoPause)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Pile de navigation persistante (v0.9.0)
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_NAV_STACK = 50; // entrées max par onglet

/**
 * Map : tabId → { stack: string[], index: number }
 * Miroir mémoire de tab.navStack / tab.navIndex (persistés dans saveTabs).
 */
const navStacks = new Map();

/**
 * Set des tabIds dont la prochaine did-navigate est une navigation simulée.
 * Empêche _pushNavUrl d'ajouter l'URL à la pile (on est déjà dedans).
 */
const _simNavFlags = new Set();

/**
 * Set des tabIds actuellement en "mode simulé" (pile native vide après restart).
 * En mode simulé : ← → utilisent notre pile au lieu de goBack/goForward natifs.
 * Sortie du mode simulé : dès qu'une navigation organique (adresse, lien) arrive.
 */
const _simModeSet = new Set();

/**
 * Initialise la pile d'un onglet depuis les données restaurées (startup).
 * Doit être appelé avant createWebview.
 * @param {string} tabId
 * @param {string[]} savedStack  — tab.navStack persisté (peut être undefined)
 * @param {number}   savedIndex  — tab.navIndex persisté (peut être undefined)
 */
function initNavStack(tabId, savedStack, savedIndex) {
    const stack = Array.isArray(savedStack) && savedStack.length > 0
        ? savedStack.slice(-MAX_NAV_STACK)  // limiter au cas où l'ancienne version avait stocké plus
        : [];
    const maxIdx = stack.length - 1;
    const index  = (typeof savedIndex === 'number' && savedIndex >= 0 && savedIndex <= maxIdx)
        ? savedIndex : maxIdx;
    navStacks.set(tabId, { stack, index });
    // Activer le mode simulé si la pile a au moins 2 entrées
    // (= il y a quelque chose en arrière ou en avant de l'URL courante)
    if (stack.length > 1) {
        _simModeSet.add(tabId);
    }
}

/**
 * Pousse une URL dans la pile de navigation d'un onglet (navigation organique).
 * Tronque l'historique "forward" si l'utilisateur était dans le milieu de la pile.
 * Synchronise automatiquement dans l'objet tab pour saveTabs().
 */
function _pushNavUrl(tabId, url) {
    if (!url || url === 'about:blank') return;
    if (!navStacks.has(tabId)) navStacks.set(tabId, { stack: [], index: -1 });
    const ns = navStacks.get(tabId);

    // Tronquer le "forward" si on navigue depuis le milieu
    if (ns.index < ns.stack.length - 1) {
        ns.stack = ns.stack.slice(0, ns.index + 1);
    }
    // Dédupliquer les URL consécutives identiques
    if (ns.stack[ns.index] === url) return;

    ns.stack.push(url);
    ns.index = ns.stack.length - 1;

    // Limiter la taille de la pile (FIFO sur les plus anciennes)
    if (ns.stack.length > MAX_NAV_STACK) {
        const excess = ns.stack.length - MAX_NAV_STACK;
        ns.stack.splice(0, excess);
        ns.index = Math.max(0, ns.index - excess);
    }

    // Synchroniser dans l'objet tab → sera persisté au prochain saveTabs()
    const tab = typeof tabs !== 'undefined' ? tabs.find(t => t.id === tabId) : null;
    if (tab) { tab.navStack = ns.stack.slice(); tab.navIndex = ns.index; }
}

/** Retourne true si on peut reculer dans la pile simulée. */
function simCanGoBack(tabId) {
    const ns = navStacks.get(tabId);
    return !!(ns && ns.index > 0);
}

/** Retourne true si on peut avancer dans la pile simulée. */
function simCanGoForward(tabId) {
    const ns = navStacks.get(tabId);
    return !!(ns && ns.stack && ns.index < ns.stack.length - 1);
}

/**
 * Calcule canGoBack / canGoForward en tenant compte du mode simulé.
 * Utilisé par navHooks.navState (overridé ci-dessous) et switchTab.
 */
function getNavState(wv, tabId) {
    if (_simModeSet.has(tabId)) {
        return { canGoBack: simCanGoBack(tabId), canGoForward: simCanGoForward(tabId) };
    }
    return {
        canGoBack:    wv && wv.canGoBack    ? wv.canGoBack()    : false,
        canGoForward: wv && wv.canGoForward ? wv.canGoForward() : false,
    };
}

/**
 * Exécute un goBack simulé : décrémente navIndex et charge l'URL précédente.
 * @returns {boolean} true si la navigation a été lancée
 */
function simGoBack(wv, tabId) {
    const ns = navStacks.get(tabId);
    if (!ns || ns.index <= 0) return false;
    ns.index--;
    const url = ns.stack[ns.index];
    // Synchroniser dans l'objet tab avant de naviguer
    const tab = typeof tabs !== 'undefined' ? tabs.find(t => t.id === tabId) : null;
    if (tab) { tab.navStack = ns.stack.slice(); tab.navIndex = ns.index; }
    // Poser le flag AVANT de modifier wv.src pour que did-navigate le trouve
    _simNavFlags.add(tabId);
    wv.src = url;
    return true;
}

/**
 * Exécute un goForward simulé : incrémente navIndex et charge l'URL suivante.
 * @returns {boolean} true si la navigation a été lancée
 */
function simGoForward(wv, tabId) {
    const ns = navStacks.get(tabId);
    if (!ns || ns.index >= ns.stack.length - 1) return false;
    ns.index++;
    const url = ns.stack[ns.index];
    const tab = typeof tabs !== 'undefined' ? tabs.find(t => t.id === tabId) : null;
    if (tab) { tab.navStack = ns.stack.slice(); tab.navIndex = ns.index; }
    _simNavFlags.add(tabId);
    wv.src = url;
    return true;
}

// ── Override des navHooks (définis dans landscape-ui.js) ──────────────────────
// landscape-views.js est chargé après landscape-ui.js → on peut remplacer
// les implémentations par défaut sans toucher à landscape-ui.js.

navHooks.goBack = (wv) => {
    const id = activeTabId;
    if (!_simModeSet.has(id) && wv && wv.canGoBack && wv.canGoBack()) {
        wv.goBack();
    } else if (!simGoBack(wv, id)) {
        return; // rien à faire
    }
    // Mettre à jour les boutons après un court délai (did-navigate arrive async)
    setTimeout(() => {
        const state = getNavState(wv, id);
        updateNavButtons(state);
        window.dualview.notifyNavState(state);
    }, 120);
};

navHooks.goForward = (wv) => {
    const id = activeTabId;
    if (!_simModeSet.has(id) && wv && wv.canGoForward && wv.canGoForward()) {
        wv.goForward();
    } else if (!simGoForward(wv, id)) {
        return;
    }
    setTimeout(() => {
        const state = getNavState(wv, id);
        updateNavButtons(state);
        window.dualview.notifyNavState(state);
    }, 120);
};

navHooks.navState = (wv) => getNavState(wv, activeTabId);

// ── Nettoyage à la fermeture d'un onglet ──────────────────────────────────────
// closeTab() (landscape-tabs.js) appelle destroyWebview puis supprime l'onglet.
// On nettoie les structures ici. closeTab est défini après ce fichier mais
// _cleanupNavStack est appelé depuis destroyWebview (ou on patche closeTab).
function _cleanupNavStack(tabId) {
    navStacks.delete(tabId);
    _simModeSet.delete(tabId);
    _simNavFlags.delete(tabId);
}

// ── Barre de chargement (P5 — v0.7.1) ────────────────────────────────────────
// Barre de progression linéaire 3px, theme-aware, fade-out 0.5s à la fin.
// Simule une progression jusqu'à 90% (asynchronisme réel inconnu du renderer),
// puis saute à 100% + fade-out quand did-stop-loading est reçu.
const _loadBar = document.getElementById('load-progress-bar');
let _loadBarTimer = null;
let _loadBarPct   = 0;
let _loadBarActive = false;  // vrai si une webview est en cours de chargement

function _loadBarStart() {
    if (_loadBarActive) return;          // déjà en cours (ex. ressources lentes)
    _loadBarActive = true;
    _loadBarPct = 5;
    _loadBar.style.transition = 'width 0.2s ease';
    _loadBar.style.width      = _loadBarPct + '%';
    _loadBar.classList.add('loading');
    _loadBar.classList.remove('done');
    clearInterval(_loadBarTimer);
    // Progression simulée : asymptote vers 90% (ralentit naturellement)
    _loadBarTimer = setInterval(() => {
        if (_loadBarPct < 88) {
            _loadBarPct += (88 - _loadBarPct) * 0.08 + 0.5;
            _loadBar.style.width = Math.min(_loadBarPct, 88) + '%';
        }
    }, 200);
}

function _loadBarFinish() {
    if (!_loadBarActive) return;
    _loadBarActive = false;
    clearInterval(_loadBarTimer);
    // Complétion instantanée à 100%
    _loadBar.style.transition = 'width 0.1s ease';
    _loadBar.style.width = '100%';
    // Fade-out après 150ms
    setTimeout(() => {
        _loadBar.classList.add('done');
        // Reset complet après la transition
        setTimeout(() => {
            _loadBar.classList.remove('loading', 'done');
            _loadBar.style.width = '0%';
            _loadBarPct = 0;
        }, 550);
    }, 150);
}

// ── Zoom par domaine (P5 — v0.7.1) ───────────────────────────────────────────
// Persistance via localStorage (renderer) : clé 'dv_zoom_<hostname>'.
// Fonctions exposées globalement pour landscape-settings.js (adjustZoom).

function _getDomainZoom(url) {
    try {
        const host = new URL(url).hostname;
        const stored = localStorage.getItem('dv_zoom_' + host);
        return stored ? parseFloat(stored) : 1.0;
    } catch { return 1.0; }
}

function _setDomainZoom(url, factor) {
    try {
        const host = new URL(url).hostname;
        if (factor === 1.0) {
            localStorage.removeItem('dv_zoom_' + host);
        } else {
            localStorage.setItem('dv_zoom_' + host, factor.toFixed(2));
        }
    } catch { }
}

/**
 * Ajuste le zoom de la webview active.
 * @param {number|null} delta  Variation (ex. 0.1, -0.1). null ou 0 = reset à 1.0.
 */
function adjustZoom(delta) {
    const wv = getActiveWebview();
    if (!wv || !wv.getURL) return;
    const url = wv.getURL ? wv.getURL() : '';
    if (!url || url === 'about:blank') return;

    let factor;
    if (!delta) {
        factor = 1.0;
    } else {
        // getZoomFactor() peut renvoyer undefined si non encore chargé → fallback 1.0
        const current = (wv.getZoomFactor && typeof wv.getZoomFactor() === 'number')
            ? wv.getZoomFactor()
            : _getDomainZoom(url);
        factor = Math.max(0.25, Math.min(5.0, current + delta));
        factor = Math.round(factor * 20) / 20; // arrondi au 5% le plus proche
    }

    if (wv.setZoomFactor) wv.setZoomFactor(factor);
    _setDomainZoom(url, factor);

    const pct = Math.round(factor * 100);
    const msg = factor === 1.0
        ? t('zoomReset')
        : t('zoomLevel') + ' : ' + pct + '%';
    showToast(msg, 1500);
}

// ── Find-in-page (P5 — v0.7.1) ───────────────────────────────────────────────
// Les fonctions openFindBar / closeFindBar / findInPage sont globales pour
// être appelées depuis landscape-settings.js (raccourcis clavier Ctrl+F / Esc).
// Le DOM #find-bar est dans landscape.html.

const _findBar      = document.getElementById('find-bar');
const _findInput    = document.getElementById('find-input');
const _findCounter  = document.getElementById('find-counter');
let _findOpen = false;

function openFindBar() {
    if (activeTabId === SETTINGS_TAB_ID) return; // pas de recherche dans les paramètres
    _findBar.classList.remove('hidden');
    _findInput.focus();
    _findInput.select();
    _findOpen = true;
    // Lancer la recherche immédiatement si une valeur est déjà présente
    if (_findInput.value) _execFind(true);
}

function closeFindBar() {
    if (!_findOpen) return;
    _findBar.classList.add('hidden');
    _findOpen = false;
    _findCounter.textContent = '';
    const wv = getActiveWebview();
    if (wv && wv.stopFindInPage) wv.stopFindInPage('clearSelection');
}

function _execFind(forward) {
    const wv = getActiveWebview();
    if (!wv || !wv.findInPage) return;
    const q = _findInput.value.trim();
    if (!q) { _findCounter.textContent = ''; return; }
    wv.findInPage(q, { forward: forward !== false, findNext: true, matchCase: false });
}

// Listeners find-bar UI
_findInput.addEventListener('input',   () => {
    const wv = getActiveWebview();
    // stopFindInPage puis relancer pour reset le compteur
    if (wv && wv.stopFindInPage) wv.stopFindInPage('clearSelection');
    _execFind(true);
});
_findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); _execFind(!e.shiftKey); }
    if (e.key === 'Escape') { e.preventDefault(); closeFindBar(); }
});
document.getElementById('find-prev').addEventListener('click', () => _execFind(false));
document.getElementById('find-next').addEventListener('click', () => _execFind(true));
document.getElementById('find-close').addEventListener('click', () => closeFindBar());

// ── Pool de webviews ───────────────────────────────────────────────────────────
// opts.skipIpc (v0.7.0) : utilisé uniquement par la récupération de crash —
// remplace l'élément <webview> dont le processus de rendu est mort sans
// déclencher tab-closed/tab-created vers main.js, qui relaierait inutilement
// vers la fenêtre portrait (dont la webview, elle, n'a pas planté).
function createWebview(tabId, url, opts) {
    if (webviewPool.has(tabId)) return webviewPool.get(tabId);
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:dualview');
    wv.setAttribute('useragent', UA_DESKTOP);
    wv.setAttribute('allowpopups', '');
    // v0.7.0 : active le lecteur PDF natif de Chromium — sans cet attribut,
    // toute navigation vers un .pdf déclenche will-download (→ toast
    // "téléchargement bloqué") au lieu d'afficher le document.
    wv.setAttribute('plugins', 'true');
    wv.className = 'wv-landscape';
    wv.dataset.tabId = tabId;
    // Attacher les listeners AVANT appendChild puis assigner src APRÈS
    // appendChild pour éviter ERR_ABORTED sur les webviews nouvellement créées
    attachWebviewListeners(wv, tabId);
    webviewCont.appendChild(wv);
    // src après DOM attachment — sinon Electron lève ERR_ABORTED
    wv.src = url || 'about:blank';
    webviewPool.set(tabId, wv);
    if (!opts || !opts.skipIpc) window.dualview.createTab(tabId, url || '');
    return wv;
}

function destroyWebview(tabId, opts) {
    const wv = webviewPool.get(tabId);
    if (!wv) return;
    try { wv.stop(); } catch (_) { }
    wv.remove();
    webviewPool.delete(tabId);
    if (!opts || !opts.skipIpc) window.dualview.closeTab(tabId);
    // v0.7.0 — un onglet fermé alors qu'il était en récupération de crash
    // ne doit pas déclencher recoverCrashedTab() plus tard (timer en vol).
    crashedTabs.delete(tabId);
    if (crashRecoveryOverlay.dataset.tabId === tabId) {
        clearTimeout(crashRecoveryTimer);
        crashRecoveryOverlay.classList.remove('show');
    }
}

function showWebview(tabId) {
    // v0.7.0 — onglet en état planté : afficher la page de récupération
    // plutôt qu'une webview (détruite) ou un empty-state trompeur.
    if (crashedTabs.has(tabId)) {
        webviewPool.forEach((wv) => wv.classList.remove('active'));
        emptyState.classList.add('hidden');
        showCrashRecovery(tabId);
        return;
    }
    crashRecoveryOverlay.classList.remove('show');
    clearTimeout(crashRecoveryTimer);
    webviewPool.forEach((wv, id) => {
        const active = id === tabId;
        wv.classList.toggle('active', active);
        if (active) {
            // .is-blank sur la webview active vide → elle ne capte pas les clics topsites (fix v0.5.1)
            wv.classList.toggle('is-blank', !wv.src || wv.src === 'about:blank');
        } else {
            wv.classList.remove('is-blank');
        }
    });
    const wv = webviewPool.get(tabId);
    const hasUrl = wv && wv.src && wv.src !== 'about:blank';
    // .hidden remplace style.display inline — évite d'écraser pointer-events (fix v0.5.1)
    emptyState.classList.toggle('hidden', !!hasUrl);
    if (!hasUrl) maybeShowTopSites();
    // ── Sync comparaison (P4-K — v0.8.0) — mettre à jour la colonne mobile
    if (typeof _compareSync === 'function' && wv) _compareSync(wv.src || '');
}

function getActiveWebview() { return webviewPool.get(activeTabId) || null; }

// ── Récupération après crash webview (v0.7.0) ─────────────────────────────────
// TODO.md priorité 0 : si le processus de rendu d'une webview plante (page
// JS trop lourde, fuite mémoire, etc.), l'onglet restait figé sans aucun
// feedback ni mécanisme de récupération — critique pour un outil utilisé en
// direct (OBS). Chaque webview dont le processus meurt est marquée
// "crashed" ; l'ancien <webview> (process mort, état non garanti) est
// détruit et un nouveau est recréé sur la même URL, automatiquement après
// 10 s d'inactivité ou immédiatement via le bouton manuel.
const crashRecoveryOverlay = document.getElementById('crash-recovery');
const crashRecoveryReloadBtn = document.getElementById('crash-recovery-reload');
const crashedTabs = new Set();
let crashRecoveryTimer = null;

function showCrashRecovery(tabId) {
    crashRecoveryOverlay.dataset.tabId = tabId;
    crashRecoveryOverlay.classList.add('show');
    clearTimeout(crashRecoveryTimer);
    crashRecoveryTimer = setTimeout(() => recoverCrashedTab(tabId), 10000);
}

function recoverCrashedTab(tabId) {
    clearTimeout(crashRecoveryTimer);
    crashedTabs.delete(tabId);
    crashRecoveryOverlay.classList.remove('show');
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return; // l'onglet a été fermé pendant la récupération
    const url = tab.url || '';
    // Le processus de rendu précédent est mort : on ne réutilise pas le même
    // élément <webview>, on en recrée un propre sur la même URL. skipIpc:true
    // car ce n'est pas une fermeture/réouverture logique d'onglet — la
    // fenêtre portrait (dont la webview n'a pas planté) n'a pas à recharger.
    destroyWebview(tabId, { skipIpc: true });
    createWebview(tabId, url, { skipIpc: true });
    if (tabId === activeTabId) showWebview(tabId);
}

crashRecoveryReloadBtn.addEventListener('click', () => {
    const tabId = crashRecoveryOverlay.dataset.tabId;
    if (tabId) recoverCrashedTab(tabId);
});

function attachWebviewListeners(wv, tabId) {
    // render-process-gone : le processus de rendu de cette webview est mort
    // (crash, kill OOM, etc.). 'clean-exit' correspond à une fermeture normale
    // (ex. wv.stop()/remove() dans destroyWebview) — ce n'est pas un crash.
    wv.addEventListener('render-process-gone', (e) => {
        if (e && e.reason === 'clean-exit') return;
        if (crashedTabs.has(tabId)) return;
        crashedTabs.add(tabId);
        showToast(t('tabCrashedToast'), 5000);
        if (tabId === activeTabId) showCrashRecovery(tabId);
    });
    // unresponsive/responsive : la page bloque le thread principal (boucle
    // infinie, calcul trop lourd). Electron détecte ce hang nativement —
    // on se contente de prévenir l'utilisateur, la page n'est pas détruite.
    wv.addEventListener('unresponsive', () => {
        if (tabId === activeTabId) showToast(t('tabUnresponsiveToast'), 4000);
    });

    // ── Barre de chargement (P5 — v0.7.1) ────────────────────────────────────
    wv.addEventListener('did-start-loading', () => {
        if (tabId === activeTabId) _loadBarStart();
    });
    wv.addEventListener('did-stop-loading', () => {
        if (tabId === activeTabId) _loadBarFinish();
    });

    // ── Found-in-page (P5 — v0.7.1) ──────────────────────────────────────────
    // Met à jour le compteur "X de Y" dans la barre de recherche.
    wv.addEventListener('found-in-page', (e) => {
        if (tabId !== activeTabId || !_findOpen) return;
        const r = e.result;
        if (!r) return;
        if (r.matches === 0) {
            _findCounter.textContent = t('findNoResult');
            _findCounter.classList.add('no-result');
        } else {
            _findCounter.textContent = r.activeMatchOrdinal + ' ' + t('findOf') + ' ' + r.matches;
            _findCounter.classList.remove('no-result');
        }
    });

    wv.addEventListener('dom-ready', () => {
        // resetWatcherFlags remet __dualviewAutoPauseDone=false → injectAutoPause
        // peut s'exécuter immédiatement (flag propre).
        resetWatcherFlags(wv);
        injectWatcher(wv);
        wv.executeJavaScript(SCROLL_INJECT).catch(() => { });
        wv.executeJavaScript(ZOOM_WHEEL_INJECT).catch(() => { }); // v1.0.1 — Ctrl+molette
        wv.executeJavaScript(MOUSE_NAV_INJECT).catch(() => { }); // v1.0.2 — boutons latéraux
        // Tentative immédiate : player peut déjà être présent sur rechargement
        injectAutoPause(wv);
        // Injection CSS/JS utilisateur (P4-J — v0.8.0)
        if (typeof applyUserScripts === 'function') applyUserScripts(wv, wv.getURL ? wv.getURL() : '');
        // Réinjection à 2s : couvre les pages lentes à initialiser leur player
        setTimeout(() => {
            if (!webviewPool.has(tabId)) return;
            injectWatcher(wv);
            injectAutoPause(wv);
        }, 2000);
        // Réinjection à 5s : filet de sécurité pour les connexions lentes
        setTimeout(() => {
            if (!webviewPool.has(tabId)) return;
            injectWatcher(wv);
            injectAutoPause(wv);
        }, 5000);
        if (tabId === activeTabId) sendNavState(wv);
        applyWebviewTheme(wv);
        // v0.6.0 — extraction du favicon réel de la page (balises <link rel="icon">)
        if (typeof extractFaviconFromWebview === 'function') extractFaviconFromWebview(wv, tabId);
    });

    // ── Liens target="_blank" → nouvel onglet DualView (v0.4.1) ──────────
    // Intercepter AVANT que Electron ouvre une BrowserWindow séparée.
    // Les popups OAuth/lecteurs sont aussi capturés en onglet (sauf Services connectés).
    wv.addEventListener('new-window', (e) => {
        e.preventDefault();
        const url = e.url;
        if (!url || url === 'about:blank') return;
        // Valider le protocole (http/https uniquement)
        try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol)) return;
        } catch { return; }
        // Ouvrir dans un nouvel onglet DualView
        addTabWithUrl(url);
    });

    wv.addEventListener('did-navigate', (e) => {
        // ── Mode vidéo seule (v0.9.0) ──────────────────────────────────────────
        // Une navigation COMPLÈTE (pas SPA) détruit le contexte de la page :
        // le conteneur plein écran créé par FOCUS_VIDEO_ACTIVATE_SCRIPT et le
        // flag __dualviewVideoFocusActive disparaissent avec elle. On sort
        // donc proprement du mode côté UI Electron plutôt que de le laisser
        // dans un état incohérent (barre custom affichée sur une page qui n'a
        // plus été isolée). Cas rare (ex. YouTube change de page hors SPA).
        if (tabId === activeTabId && typeof videoFocusHandleHardNavigation === 'function') {
            videoFocusHandleHardNavigation();
        }
        resetWatcherFlags(wv);
        if (e.url && e.url !== 'about:blank') {
            wv.classList.remove('is-blank'); // fix v0.5.1

            // ── Pile de navigation persistante (v0.9.0) ───────────────────────
            const isSimNav = _simNavFlags.has(tabId);
            if (isSimNav) {
                // Navigation déclenchée par notre simulateur (goBack/goForward
                // simulé) → la pile et l'index ont déjà été mis à jour dans
                // simGoBack/simGoForward. Ne pas modifier la pile, rester en
                // mode simulé.
                _simNavFlags.delete(tabId);

            } else if (_simModeSet.has(tabId)) {
                // L'onglet est en mode simulé. Deux cas possibles :
                //
                // A) Chargement initial au redémarrage : la webview vient de
                //    charger l'URL restaurée (= sommet de notre pile sauvegardée).
                //    On NE sort PAS du mode simulé — c'est exactement ce qui
                //    cassait les boutons ← → dans v0.9.0 initial.
                //
                // B) L'utilisateur navigue vers une URL différente depuis le
                //    mode simulé (clic sur un lien, barre d'adresse).
                //    → sortir du mode simulé, empiler la nouvelle URL.
                //
                const ns = navStacks.get(tabId);
                const isRestoredLoad = ns && ns.stack[ns.index] === e.url;
                if (!isRestoredLoad) {
                    // Cas B : nouvelle navigation organique depuis mode simulé
                    _simModeSet.delete(tabId);
                    _pushNavUrl(tabId, e.url);
                }
                // Cas A : chargement initial — ne rien faire, le mode simulé reste actif

            } else {
                // Mode natif : navigation organique ordinaire (pendant une session).
                // Empiler l'URL normalement.
                _pushNavUrl(tabId, e.url);
            }

            if (tabId === activeTabId) {
                if (isLoginPage(e.url)) {
                    window.dualview.notifyLoginPage(e.url, tabId);
                } else {
                    // L'utilisateur a quitté la page de connexion
                    window.dualview.notifyLoginPageLeft(tabId);
                }
            }
            const tab = tabs.find(t => t.id === tabId);
            if (tab) {
                tab.url = e.url;
                try { const host = new URL(e.url).hostname.replace('www.', ''); tab.title = host.length > 18 ? host.slice(0, 18) + '…' : host; } catch { tab.title = e.url.slice(0, 20); }
                if (tabId === activeTabId) { renderTabs(); saveTabs(); document.getElementById('url-input').value = e.url; window.dualview.sendNavigate(e.url); }
            }
            // Alimenter l'historique omnibar (v0.4.0)
            addToHistory(tabId, e.url);
            // Alimenter l'historique persistant (v0.4.0)
            if (tabId === activeTabId) {
                const htab = tabs.find(t => t.id === tabId);
                window.dualview.historyAdd(e.url, htab ? htab.title : '', tabId);
            }
            // Rafraîchir le bouton étoile favoris (v0.4.7)
            if (tabId === activeTabId) refreshFavoriteBtnForUrl(e.url);
            // Pause auto sur navigation complète (vidéo classique ou Short direct)
            // Délai 1.5s : laisser le player YouTube s'initialiser
            if (tabId === activeTabId) setTimeout(() => injectAutoPause(wv), 1500);
            // ── Restaurer le zoom du domaine (P5 — v0.7.1) ───────────────────
            const zf = _getDomainZoom(e.url);
            if (zf !== 1.0 && wv.setZoomFactor) wv.setZoomFactor(zf);
            // ── Injection CSS/JS utilisateur (P4-J — v0.8.0) ─────────────────
            if (tabId === activeTabId && typeof applyUserScripts === 'function')
                applyUserScripts(wv, e.url);
            // ── Sync webview de comparaison (P4-K — v0.8.0) ──────────────────
            if (tabId === activeTabId) _compareSync(e.url);
        }
        if (tabId === activeTabId) sendNavState(wv);
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
        resetWatcherFlags(wv);
        if (e.url && e.url !== 'about:blank') {
            // ── Pile de navigation (v0.9.0) ───────────────────────────────────
            const isSimNav = _simNavFlags.has(tabId);
            if (isSimNav) {
                _simNavFlags.delete(tabId);
            } else if (_simModeSet.has(tabId)) {
                const ns = navStacks.get(tabId);
                const isRestoredLoad = ns && ns.stack[ns.index] === e.url;
                if (!isRestoredLoad) {
                    _simModeSet.delete(tabId);
                    _pushNavUrl(tabId, e.url);
                }
            } else {
                _pushNavUrl(tabId, e.url);
            }

            if (tabId === activeTabId) {
                if (isLoginPage(e.url)) {
                    window.dualview.notifyLoginPage(e.url, tabId);
                } else {
                    window.dualview.notifyLoginPageLeft(tabId);
                }
            }
            const tab = tabs.find(t => t.id === tabId);
            if (tab) {
                tab.url = e.url;
                if (tabId === activeTabId) { renderTabs(); saveTabs(); document.getElementById('url-input').value = e.url; window.dualview.sendNavigate(e.url); }
            }
            // ── Restaurer le zoom du domaine sur navigation SPA (P5 — v0.7.1)
            if (tabId === activeTabId) {
                const zf = _getDomainZoom(e.url);
                if (zf !== 1.0 && wv.setZoomFactor) wv.setZoomFactor(zf);
            }
        }
        if (tabId === activeTabId) sendNavState(wv);
        // Réinjecter scroll + vidéo après navigation SPA (Google Search,
        // YouTube, etc.) — dom-ready ne se redéclenche pas pour ces navigations
        if (webviewPool.has(tabId)) {
            wv.executeJavaScript(SCROLL_INJECT).catch(() => { });
            wv.executeJavaScript(ZOOM_WHEEL_INJECT).catch(() => { }); // v1.0.1 — Ctrl+molette
            wv.executeJavaScript(MOUSE_NAV_INJECT).catch(() => { }); // v1.0.2 — boutons latéraux
            injectWatcher(wv);
            // Pause auto sur navigation SPA (clic vidéo YouTube, nouveau Short)
            // Délai 1.2s : légèrement plus court car le player est déjà initialisé
            if (tabId === activeTabId) setTimeout(() => injectAutoPause(wv), 1200);
        }
    });
}

// Détection page de connexion côté renderer (patterns URL)
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

// ── Popup page de connexion ────────────────────────────────────────────────────
const loginPopup = document.getElementById('login-popup');
const ignoreConfirm = document.getElementById('ignore-confirm');
let loginPopupActive = false;

let loginPopupServiceKey = null;

window.dualview.on('show-login-popup', ({ url, tabId, serviceKey }) => {
    if (loginPopupActive) return;
    loginPopupActive = true;
    loginPopupServiceKey = serviceKey || null;
    // Afficher le bouton "Se connecter" uniquement pour les services connus
    const connectBtn = document.getElementById('login-popup-connect');
    if (serviceKey) {
        connectBtn.style.display = '';
        connectBtn.textContent = 'Se connecter (' + (SERVICE_LABELS[serviceKey] || serviceKey) + ')';
    } else {
        connectBtn.style.display = 'none';
    }
    loginPopup.classList.add('show');
});

// main.js confirme que l'URL active n'est plus une page de login → fermer le popup
window.dualview.on('login-page-cleared', () => {
    loginPopup.classList.remove('show');
    ignoreConfirm.classList.remove('show');
    loginPopupActive = false;
});

document.getElementById('login-popup-back').addEventListener('click', () => {
    loginPopup.classList.remove('show');
    loginPopupActive = false;
    const wv = getActiveWebview();
    if (wv && wv.canGoBack && wv.canGoBack()) wv.goBack();
    else window.dualview.navBack();
});

document.getElementById('login-popup-services').addEventListener('click', () => {
    loginPopup.classList.remove('show');
    loginPopupActive = false;
    openSettingsTab('services');
});

// Bouton "Se connecter" — ouvre directement la fenêtre d'auth pour le service détecté
document.getElementById('login-popup-connect').addEventListener('click', async () => {
    loginPopup.classList.remove('show');
    loginPopupActive = false;
    if (loginPopupServiceKey) {
        await connectService(loginPopupServiceKey, null, null);
        loadServicesStatus();
    }
    loginPopupServiceKey = null;
});

document.getElementById('login-popup-backdrop').addEventListener('click', () => {
    loginPopup.classList.remove('show');
    ignoreConfirm.classList.add('show');
});

document.getElementById('ignore-cancel').addEventListener('click', () => {
    ignoreConfirm.classList.remove('show');
    loginPopup.classList.add('show');
});

document.getElementById('ignore-ok').addEventListener('click', () => {
    ignoreConfirm.classList.remove('show');
    loginPopupActive = false;
});

document.getElementById('ignore-confirm-backdrop').addEventListener('click', () => {
    ignoreConfirm.classList.remove('show');
    loginPopup.classList.add('show');
});

// Confirmation auth personnalisée (depuis auth-window.js)
window.dualview.on('auth-custom-confirm', ({ serviceLabel, hasCookies, cookieCount }) => {
    const dialog = document.getElementById('auth-confirm-dialog');
    document.getElementById('auth-confirm-title').textContent = `Confirmation — ${serviceLabel}`;
    document.getElementById('auth-confirm-desc').textContent = hasCookies
        ? `${cookieCount} cookie(s) de session détecté(s). Confirmez-vous que vous êtes bien connecté au service "${serviceLabel}" ?`
        : `Aucun cookie de session détecté automatiquement. Confirmez-vous que vous êtes bien connecté au service "${serviceLabel}" ?`;
    dialog.classList.add('show');
});

document.getElementById('auth-confirm-ok').addEventListener('click', () => {
    document.getElementById('auth-confirm-dialog').classList.remove('show');
    window.dualview.confirmCustomAuth(true);
    loadServicesStatus();
});

document.getElementById('auth-confirm-cancel').addEventListener('click', () => {
    document.getElementById('auth-confirm-dialog').classList.remove('show');
    window.dualview.cancelCustomAuth();
});

document.getElementById('auth-confirm-backdrop').addEventListener('click', () => {
    document.getElementById('auth-confirm-dialog').classList.remove('show');
    window.dualview.cancelCustomAuth();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mode comparaison Desktop / Mobile (P4-K — v0.8.0)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Affiche une colonne mobile (390 px) à droite de la webview active pour
// comparer le rendu desktop et mobile de la même URL en live.
// Le mode est un toggle sans état persisté (désactivé au redémarrage).
//
// Architecture :
//   - #compare-col (HTML) : conteneur de la colonne mobile, masqué par défaut
//   - #compare-wv  (HTML) : <webview> dédié, UA mobile, même session dualview
//   - body.compare-mode (CSS) : active le layout split via les règles CSS dédiées
//   - _compareSync(url)  : synchronise l'URL du compare-wv avec la tab active

const _compareBtn = document.getElementById('compare-btn');
const _compareCol = document.getElementById('compare-col');
const _compareWv  = document.getElementById('compare-wv');
let _compareActive = false;

// User-agent iPhone 15 (Safari 17) — force le rendu mobile des sites
const _MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/**
 * Synchronise l'URL du panneau de comparaison avec l'URL fournie.
 * Sans effet si le mode comparaison est inactif.
 * @param {string} url
 */
function _compareSync(url) {
    if (!_compareActive || !_compareWv) return;
    if (!url || url === 'about:blank') { _compareWv.src = 'about:blank'; return; }
    // Ne recharger que si l'URL a changé (éviter les reloads inutiles)
    try { if (new URL(_compareWv.src).href === new URL(url).href) return; } catch { /* ignore */ }
    _compareWv.src = url;
}

/**
 * Active ou désactive le mode comparaison.
 */
function toggleCompareMode() {
    _compareActive = !_compareActive;
    document.body.classList.toggle('compare-mode', _compareActive);

    if (_compareBtn) {
        _compareBtn.classList.toggle('active', _compareActive);
        _compareBtn.title = t(_compareActive ? 'compareModeOff' : 'compareModeOn');
    }

    if (_compareActive) {
        // Synchroniser immédiatement avec l'onglet actif
        const wv = getActiveWebview();
        const url = wv && wv.getURL ? wv.getURL() : '';
        _compareSync(url || '');
        if (typeof showToast === 'function') showToast(t('compareModeOn'));
    } else {
        // Décharger le contenu et libérer les ressources réseau
        if (_compareWv) _compareWv.src = 'about:blank';
        if (typeof showToast === 'function') showToast(t('compareModeOff'));
    }
}

// Listener bouton
if (_compareBtn) {
    _compareBtn.addEventListener('click', toggleCompareMode);
}

// Raccourci clavier Ctrl+Shift+C
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        toggleCompareMode();
    }
});

// Initialisation du user-agent mobile sur le compare-wv (attribut HTML)
// L'attribut useragent= sur <webview> est lu avant la première navigation.
// On le pose ici en JS au cas où le DOM est déjà prêt.
if (_compareWv && !_compareWv.getAttribute('useragent')) {
    _compareWv.setAttribute('useragent', _MOBILE_UA);
}

/**
 * Retourne le compare-webview si le mode comparaison est actif, null sinon.
 * Utilisé par landscape-pollers.js pour le scroll synchronisé (P4-K — v0.8.0).
 * Déclaré avec function pour être accessible globalement depuis les autres scripts.
 */
function getCompareWebview() {
    return (_compareActive && _compareWv) ? _compareWv : null;
}