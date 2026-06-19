/*
 * DualView - Pool de webviews + popup login
 * Version: 0.7.0
 *
 * Création/destruction/affichage des webviews (une par onglet),
 * injection des scripts (watcher, scroll, auto-pause, cosmétique),
 * détection des pages de connexion et popup associé.
 *
 * v0.7.0 : attribut plugins="true" (lecteur PDF natif Chromium) ; récupération
 *   après crash webview (render-process-gone/unresponsive, page de
 *   récupération #crash-recovery, reconstruction automatique après 10 s ou
 *   bouton manuel — voir showCrashRecovery/recoverCrashedTab).
 *
 * Dépendances : landscape-i18n.js, landscape-ui.js (webviewPool,
 *               activeTabId, showToast, updateNavButtons, …),
 *               landscape-webview.js (VIDEO_WATCHER_SCRIPT, SCROLL_INJECT,
 *               AUTO_PAUSE_SCRIPT, resetWatcherFlags, injectWatcher,
 *               injectAutoPause)
 */

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

    wv.addEventListener('dom-ready', () => {
        // resetWatcherFlags remet __dualviewAutoPauseDone=false → injectAutoPause
        // peut s'exécuter immédiatement (flag propre).
        resetWatcherFlags(wv);
        injectWatcher(wv);
        wv.executeJavaScript(SCROLL_INJECT).catch(() => { });
        // Tentative immédiate : player peut déjà être présent sur rechargement
        injectAutoPause(wv);
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
        resetWatcherFlags(wv);
        if (e.url && e.url !== 'about:blank') {
            wv.classList.remove('is-blank'); // fix v0.5.1
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
        }
        if (tabId === activeTabId) sendNavState(wv);
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
        resetWatcherFlags(wv);
        if (e.url && e.url !== 'about:blank') {
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
        }
        if (tabId === activeTabId) sendNavState(wv);
        // Réinjecter scroll + vidéo après navigation SPA (Google Search,
        // YouTube, etc.) — dom-ready ne se redéclenche pas pour ces navigations
        if (webviewPool.has(tabId)) {
            wv.executeJavaScript(SCROLL_INJECT).catch(() => { });
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