/*
 * DualView - Onglets, navigation et omnibar
 * Version: 0.4.4
 *
 * Gestion des onglets (créer, fermer, switcher, persister),
 * commandes OBS, résolution d'URL, barre d'adresse, omnibar
 * (suggestions historique + moteur de recherche), screenshot.
 *
 * Dépendances : landscape-i18n.js, landscape-ui.js, landscape-views.js
 */

// ── Onglets ────────────────────────────────────────────────────────────────────
function isSettingsTab(tab) { return tab && tab.id === SETTINGS_TAB_ID; }

function renderTabs() {
    const bar = document.getElementById('tab-bar');
    const addBtn = document.getElementById('add-tab-btn');
    bar.querySelectorAll('.tab').forEach(el => el.remove());
    tabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = 'tab' + (tab.id === activeTabId ? ' active' : '') + (isSettingsTab(tab) ? ' settings-tab' : '');
        el.dataset.id = tab.id;
        const title = document.createElement('span');
        title.className = 'tab-title';
        title.textContent = isSettingsTab(tab) ? '⚙ ' + t('settings') : (tab.title || t('newTab'));
        el.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });
        el.appendChild(closeBtn);
        el.addEventListener('click', () => switchTab(tab.id));
        bar.insertBefore(el, addBtn);
    });
}

function switchTab(id) {
    activeTabId = id;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    // Reset popup login state au switch (main.js envoie login-page-cleared si nécessaire)
    if (isSettingsTab(tab)) {
        webviewPool.forEach(wv => wv.classList.remove('active'));
        emptyState.style.display = 'none';
        webviewCont.style.display = 'none';
        settingsPanel.classList.add('show');
        document.getElementById('url-input').value = 'dualview://paramètres';
        document.getElementById('url-input').classList.add('settings-url');
        document.getElementById('go-btn').disabled = true;
        updateNavButtons({ canGoBack: false, canGoForward: false });
        // Désactiver le bouton étoile sur l'onglet paramètres (v0.4.7)
        updateFavoriteBtn(false);
        // Notifier main.js → portrait reçoit 'tab-switched' avec SETTINGS_TAB_ID
        // et affiche l'overlay "Personnalisation en cours / stream reprendra"
        window.dualview.switchTab(SETTINGS_TAB_ID);
    } else {
        webviewCont.style.display = 'flex';
        settingsPanel.classList.remove('show');
        document.getElementById('url-input').classList.remove('settings-url');
        document.getElementById('go-btn').disabled = false;
        document.getElementById('url-input').value = tab.url || '';
        const isNewWebview = !webviewPool.has(id);
        if (isNewWebview) createWebview(id, tab.url || '');
        showWebview(id);
        const wv = getActiveWebview();
        if (!isNewWebview && wv && wv.canGoBack) {
            // Webview déjà dans le pool avec un historique intact :
            // lire l'état réel directement plutôt que de tout remettre à false.
            // dom-ready ne se déclenche plus pour une webview déjà chargée.
            // Guard try/catch : canGoBack() lève si dom-ready n'a pas encore été émis
            // (ex. rechargement rapide ou page vide en cours d'initialisation).
            try {
                updateNavButtons({
                    canGoBack: wv.canGoBack(),
                    canGoForward: wv.canGoForward ? wv.canGoForward() : false
                });
            } catch (_) {
                // dom-ready pas encore émis → dom-ready appellera sendNavState
                updateNavButtons({ canGoBack: false, canGoForward: false });
            }
        } else {
            // Nouvelle webview — dom-ready appellera sendNavState une fois prête.
            updateNavButtons({ canGoBack: false, canGoForward: false });
        }
        window.dualview.switchTab(id);
        // Rafraîchir le bouton étoile favoris (v0.4.7)
        refreshFavoriteBtnForUrl(tab.url || '');
    }
    renderTabs(); saveTabs(); resetVideoCounters();
}

function openSettingsTab(section) {
    const existing = tabs.find(t => t.id === SETTINGS_TAB_ID);
    if (existing) {
        switchTab(SETTINGS_TAB_ID);
    } else {
        tabs.push({ id: SETTINGS_TAB_ID, title: 'Paramètres', url: 'dualview://settings' });
        switchTab(SETTINGS_TAB_ID);
    }
    if (section) {
        setTimeout(() => activateSettingsSection(section), 50);
    }
}

function activateSettingsSection(section) {
    document.querySelectorAll('.s-nav').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.s-section').forEach(s => s.classList.remove('active'));
    const nav = document.querySelector(`.s-nav[data-section="${section}"]`);
    if (nav) nav.classList.add('active');
    const sec = document.getElementById(`section-${section}`);
    if (sec) sec.classList.add('active');
    if (section === 'services') loadServicesStatus();
    if (section === 'obs') loadObsInfo();
}

function addTab() {
    const id = 'tab-' + Date.now();
    const url = getNewTabUrl();
    tabs.push({ id, title: url ? '' : t('newTab'), url });
    // Ne pas appeler createWebview ici : switchTab détecte isNewWebview=true
    // et crée la webview lui-même, évitant un appel canGoBack() avant dom-ready.
    switchTab(id);
}

// Ouvre un nouvel onglet avec une URL spécifique (v0.4.1 — new-window redirect)
function addTabWithUrl(url) {
    const id = 'tab-' + Date.now();
    let title = '';
    try { title = new URL(url).hostname.replace('www.', ''); } catch { title = url.slice(0, 20); }
    tabs.push({ id, title, url });
    // Ne pas appeler createWebview ici : switchTab gère la création.
    switchTab(id);
}

function getNewTabUrl() {
    const mode = currentSettings.newTabMode || 'homepage';
    if (mode === 'empty') return '';
    const hp = currentSettings.homepageMode || 'knack3';
    if (hp === 'empty') return '';
    if (hp === 'custom') return currentSettings.customHomepageUrl || '';
    return 'https://marketplace.atlassian.com/vendors/920480808/';
}

function closeTab(id) {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    tabs = tabs.filter(t => t.id !== id);
    destroyWebview(id);
    if (activeTabId === id) switchTab(tabs[Math.max(0, idx - 1)].id);
    else { renderTabs(); saveTabs(); }
}

function saveTabs() {
    const persist = tabs.filter(t => t.id !== SETTINGS_TAB_ID);
    window.dualview.saveTabs({ tabs: persist.length ? persist : tabs, activeTabId });
}

document.getElementById('add-tab-btn').addEventListener('click', addTab);

// ── Commandes OBS (v0.3.2) ───────────────────────────────────────────────────
// Reçues depuis le dock OBS / les hotkeys via le serveur de contrôle local.
// Chaque commande appelle la MÊME fonction que l'UI native → comportement
// strictement identique, aucune logique dupliquée.
window.dualview.on('obs-command', ({ action, payload }) => {
    payload = payload || {};
    switch (action) {
        case 'nav-back':
            if (!backBtn.disabled) window.dualview.navBack();
            break;
        case 'nav-forward':
            if (!forwardBtn.disabled) window.dualview.navForward();
            break;
        case 'nav-reload':
            document.getElementById('reload-btn').click();
            break;
        case 'nav-home':
            document.getElementById('home-btn').click();
            break;
        case 'navigate':
            if (payload.url && activeTabId !== SETTINGS_TAB_ID) navigate(payload.url);
            break;
        case 'tab-new':
            addTab();
            break;
        case 'tab-close':
            // tabId fourni par le dock, sinon onglet actif
            closeTab(payload.tabId || activeTabId);
            break;
        case 'tab-switch':
            if (payload.tabId && tabs.some(t => t.id === payload.tabId)) switchTab(payload.tabId);
            break;
        default:
            break;
    }
});


// ── Résolution input v0.4.0 ────────────────────────────────────────────────────
// TLDs reconnus — si l'input contient un de ces TLDs sans espace, c'est une URL.
const KNOWN_TLDS = new Set([
    'com','net','org','fr','io','co','uk','de','app','dev','ai','eu',
    'info','biz','me','tv','us','ca','au','jp','it','es','nl','be','ch',
    'at','pl','ru','br','in','cn','kr','se','no','fi','dk','nz','sg',
    'gov','edu','mil','int','museum',
]);

/**
 * Détermine si la saisie est une URL directe ou un terme de recherche.
 * Retourne l'URL finale à charger (directe ou URL du moteur de recherche).
 */
function resolveInput(raw) {
    const text = raw.trim();
    if (!text) return '';
    // 1. Protocole explicite → URL directe
    if (/^https?:\/\//i.test(text) || /^file:\/\//i.test(text)) return text;
    // 2. localhost / IP → URL directe
    if (/^localhost(:\d+)?(\/.*)?$/.test(text) || /^\d{1,3}(\.\d{1,3}){3}/.test(text)) return 'http://' + text;
    // 3. Contient un espace → recherche
    if (/\s/.test(text)) return buildSearchUrl(text);
    // 4. Vérifier si c'est un domaine avec TLD reconnu
    const parts = text.split('.');
    if (parts.length >= 2) {
        const tld = parts[parts.length - 1].toLowerCase().split('/')[0].split('?')[0];
        if (KNOWN_TLDS.has(tld)) return 'https://' + text;
    }
    // 5. Sinon → recherche
    return buildSearchUrl(text);
}

function buildSearchUrl(query) {
    const engineUrl = currentSettings.searchEngineUrl || 'https://duckduckgo.com/?q=';
    return engineUrl + encodeURIComponent(query);
}

function getEngineName() {
    return currentSettings.searchEngineName || 'DuckDuckGo';
}

// ── Navigation URL ─────────────────────────────────────────────────────────────
function navigate(rawInput) {
    if (!rawInput || activeTabId === SETTINGS_TAB_ID) return;
    closeOmnibar();
    const url = resolveInput(rawInput);
    if (!url) return;
    document.getElementById('url-input').value = url;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && !isSettingsTab(tab)) {
        tab.url = url;
        try { const host = new URL(url).hostname.replace('www.', ''); tab.title = host.length > 18 ? host.slice(0, 18) + '…' : host; } catch { tab.title = url.slice(0, 20); }
        renderTabs(); saveTabs();
    }
    updateNavButtons({ canGoBack: false, canGoForward: false });
    const wv = getActiveWebview();
    if (wv) {
        if (wv.getURL !== undefined) {
            try {
                wv.src = url;
            } catch (e) {
                console.warn('Unexpected error while loading URL', e);
                wv.addEventListener('dom-ready', () => { wv.src = url; }, { once: true });
            }
        } else {
            wv.addEventListener('dom-ready', () => { wv.src = url; }, { once: true });
        }
    }
    window.dualview.navigate(url);
}

// ── Omnibar ────────────────────────────────────────────────────────────────────
const urlInput = document.getElementById('url-input');
const omniDropdown = document.getElementById('omnibar-dropdown');
let omniItems = [];       // liste des items rendus [{type, url, label, sub}]
let omniSelectedIdx = -1; // index sélectionné au clavier
// Historique en mémoire par onglet — enrichi lors des navigations
const tabHistory = new Map(); // tabId → string[]

function addToHistory(tabId, url) {
    if (!url || url === 'about:blank') return;
    if (!tabHistory.has(tabId)) tabHistory.set(tabId, []);
    const hist = tabHistory.get(tabId);
    const existing = hist.indexOf(url);
    if (existing !== -1) hist.splice(existing, 1);
    hist.unshift(url);
    if (hist.length > 10) hist.pop();
}

function buildOmniItems(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const items = [];
    // Historique de tous les onglets (dédupliqué)
    const seen = new Set();
    for (const [, hist] of tabHistory) {
        for (const url of hist) {
            if (!seen.has(url) && url.toLowerCase().includes(q)) {
                seen.add(url);
                let label = url;
                try { label = new URL(url).hostname.replace('www.', ''); } catch { }
                items.push({ type: 'history', url, label, sub: url });
                if (items.length >= 4) break;
            }
        }
        if (items.length >= 4) break;
    }
    // Suggestion de domaine simple si l'input ressemble à un début de domaine
    if (!/\s/.test(q) && q.length > 2 && !q.includes('/')) {
        const suggestion = q.endsWith('.com') ? q : q + '.com';
        if (!seen.has('https://' + suggestion)) {
            items.push({ type: 'domain', url: 'https://' + suggestion, label: suggestion, sub: '' });
        }
    }
    // Recherche toujours en dernier
    items.push({ type: 'search', url: buildSearchUrl(query), label: query, sub: getEngineName() });
    return items;
}

function renderOmnibar(query) {
    omniItems = buildOmniItems(query);
    omniSelectedIdx = -1;
    if (!omniItems.length) { closeOmnibar(); return; }
    omniDropdown.innerHTML = '';
    let hasHistory = omniItems.some(i => i.type === 'history');
    let hasDomain  = omniItems.some(i => i.type === 'domain');
    omniItems.forEach((item, idx) => {
        if (item.type === 'search') {
            const row = document.createElement('div');
            row.className = 'omni-search-row';
            row.innerHTML = `<span>🔍</span><span>Rechercher &ldquo;${escHtml(item.label)}&rdquo; avec</span><span class="omni-engine-pill">${escHtml(item.sub)}</span>`;
            row.addEventListener('mousedown', e => { e.preventDefault(); navigate(item.label); });
            omniDropdown.appendChild(row);
        } else {
            if (item.type === 'history' && idx === 0 && hasHistory) {
                const lbl = document.createElement('div');
                lbl.className = 'omni-section-lbl';
                lbl.textContent = 'Historique';
                omniDropdown.appendChild(lbl);
            }
            if (item.type === 'domain' && hasDomain) {
                const div2 = document.createElement('div');
                div2.className = 'omni-divider';
                omniDropdown.appendChild(div2);
                const lbl2 = document.createElement('div');
                lbl2.className = 'omni-section-lbl';
                lbl2.textContent = 'Suggestion';
                omniDropdown.appendChild(lbl2);
            }
            const row = document.createElement('div');
            row.className = 'omni-item';
            row.dataset.idx = idx;
            const icon = item.type === 'history' ? '🕐' : '🌐';
            row.innerHTML = `<span class="omni-icon">${icon}</span><span class="omni-url">${escHtml(item.url)}</span>${item.sub ? `<span class="omni-sub">${escHtml(item.sub)}</span>` : ''}`;
            row.addEventListener('mousedown', e => { e.preventDefault(); navigate(item.url); });
            omniDropdown.appendChild(row);
        }
    });
    omniDropdown.classList.add('open');
}

function closeOmnibar() {
    omniDropdown.classList.remove('open');
    omniItems = [];
    omniSelectedIdx = -1;
}

function omniSelectIdx(idx) {
    omniDropdown.querySelectorAll('.omni-item,.omni-search-row').forEach((el, i) => {
        el.classList.toggle('selected', i === idx);
    });
    omniSelectedIdx = idx;
}

// ── Events barre URL ───────────────────────────────────────────────────────────
// Sélection automatique au focus (v0.4.0)
urlInput.addEventListener('focus', () => {
    if (activeTabId !== SETTINGS_TAB_ID) urlInput.select();
});

// Échap : annule la saisie, restore l'URL courante, perd le focus
urlInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab && !isSettingsTab(tab)) urlInput.value = tab.url || '';
        closeOmnibar();
        urlInput.blur();
        return;
    }
    if (e.key === 'Enter') {
        const selItems = omniDropdown.querySelectorAll('.omni-item,.omni-search-row');
        if (omniSelectedIdx >= 0 && omniSelectedIdx < selItems.length) {
            const selectedItem = omniItems[omniSelectedIdx] || omniItems[omniItems.length - 1];
            if (selectedItem) { navigate(selectedItem.type === 'search' ? selectedItem.label : selectedItem.url); return; }
        }
        navigate(urlInput.value);
        return;
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const total = omniDropdown.querySelectorAll('.omni-item,.omni-search-row').length;
        omniSelectIdx(Math.min(omniSelectedIdx + 1, total - 1));
        return;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        omniSelectIdx(Math.max(omniSelectedIdx - 1, 0));
        return;
    }
});

urlInput.addEventListener('input', () => {
    const q = urlInput.value;
    if (q.trim().length < 2) { closeOmnibar(); return; }
    renderOmnibar(q);
});

urlInput.addEventListener('blur', () => {
    setTimeout(closeOmnibar, 150);
});

document.getElementById('go-btn').addEventListener('click', () => navigate(urlInput.value));

window.dualview.on('update-addressbar', url => {
    if (activeTabId === SETTINGS_TAB_ID) return;
    document.getElementById('url-input').value = url;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && !isSettingsTab(tab)) {
        tab.url = url;
        try { const host = new URL(url).hostname.replace('www.', ''); tab.title = host.length > 18 ? host.slice(0, 18) + '…' : host; } catch { tab.title = url.slice(0, 20); }
        renderTabs(); saveTabs();
    }
    // Rafraîchir le bouton étoile favoris (v0.4.7)
    refreshFavoriteBtnForUrl(url);
});

window.dualview.on('load-url', url => {
    if (activeTabId === SETTINGS_TAB_ID) return;
    const wv = getActiveWebview();
    if (!wv || !url || url === 'about:blank') return;
    try {
        wv.src = url;
    } catch (e) {
        wv.addEventListener('dom-ready', () => { wv.src = url; }, { once: true });
    }
    emptyState.style.display = 'none';
    wv.classList.add('active');
});

// ── Screenshot (v0.4.0) ────────────────────────────────────────────────────────
document.getElementById('screenshot-btn').addEventListener('click', async () => {
    const result = await window.dualview.takeScreenshot();
    if (result && result.success) {
        showToast(t('screenshotOk') + ' — ' + result.dir, 4000);
    } else {
        showToast(t('screenshotErr'));
    }
});