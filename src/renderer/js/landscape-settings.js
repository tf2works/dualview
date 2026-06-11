/*
 * DualView - Paramètres, services connectés, historique, favoris
 * Version: 0.4.7
 *
 * Moteurs de recherche personnalisés, intégration OBS (settings),
 * chargement/sauvegarde des paramètres, services connectés,
 * panneau historique, panneau favoris, bouton étoile favoris,
 * dropdown nav hist, raccourcis clavier, boutons souris, menu contextuel.
 *
 * Dépendances : landscape-i18n.js, landscape-ui.js, landscape-tabs.js
 */

// ── Moteurs de recherche prédéfinis (v0.4.0) ──────────────────────────────────
const DEFAULT_SEARCH_ENGINES = [
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    { id: 'google',     name: 'Google',     url: 'https://www.google.com/search?q=' },
    { id: 'bing',       name: 'Bing',       url: 'https://www.bing.com/search?q=' },
    { id: 'brave',      name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
    { id: 'qwant',      name: 'Qwant',      url: 'https://www.qwant.com/?q=' },
];

function getSearchEngines() {
    const custom = currentSettings.customSearchEngines || [];
    return [...DEFAULT_SEARCH_ENGINES, ...custom];
}

function renderSearchEngineList() {
    const list = document.getElementById('s-engine-list');
    if (!list) return;
    list.innerHTML = '';
    const engines = getSearchEngines();
    const activeId = currentSettings.searchEngineId || 'duckduckgo';
    engines.forEach(engine => {
        const item = document.createElement('div');
        item.className = 'search-engine-item' + (engine.id === activeId ? ' active' : '');
        const radio = document.createElement('div');
        radio.className = 'search-engine-radio' + (engine.id === activeId ? ' checked' : '');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = engine.name;
        const urlSpan = document.createElement('span');
        urlSpan.className = 'search-engine-url';
        try { urlSpan.textContent = new URL(engine.url).hostname; } catch { urlSpan.textContent = engine.url; }
        item.appendChild(radio);
        item.appendChild(nameSpan);
        item.appendChild(urlSpan);
        item.addEventListener('click', () => {
            currentSettings.searchEngineId = engine.id;
            currentSettings.searchEngineUrl = engine.url;
            currentSettings.searchEngineName = engine.name;
            saveCurrentSettings();
            renderSearchEngineList();
        });
        list.appendChild(item);
    });
}

document.getElementById('s-engine-add-btn').addEventListener('click', () => {
    const nameEl = document.getElementById('s-engine-name');
    const urlEl = document.getElementById('s-engine-url');
    const msg = document.getElementById('s-engine-msg');
    const name = nameEl.value.trim();
    const url = urlEl.value.trim();
    if (!name || !url) { msg.textContent = 'Nom et URL requis.'; msg.className = 's-msg show err'; return; }
    if (!url.startsWith('http')) { msg.textContent = t('searchEngineInvalid'); msg.className = 's-msg show err'; return; }
    const engines = getSearchEngines();
    if (engines.some(e => e.url === url || e.name.toLowerCase() === name.toLowerCase())) {
        msg.textContent = t('searchEngineExists'); msg.className = 's-msg show err'; return;
    }
    const custom = currentSettings.customSearchEngines || [];
    custom.push({ id: 'custom-' + Date.now(), name, url });
    currentSettings.customSearchEngines = custom;
    saveCurrentSettings();
    nameEl.value = ''; urlEl.value = '';
    msg.className = 's-msg';
    renderSearchEngineList();
});

document.getElementById('s-screenshot-browse').addEventListener('click', async () => {
    const dir = await window.dualview.chooseScreenshotDir();
    if (dir) {
        currentSettings.screenshotDir = dir;
        document.getElementById('s-screenshot-dir').textContent = dir;
    }
});

function loadSettingsUI(s) {
    currentSettings = s;
    currentLang = s.language || 'fr';
    document.getElementById('s-restore').checked = s.restoreTabs !== false;
    document.getElementById('s-auto-pause').checked = s.autoPauseVideo !== false;
    document.getElementById('s-auto-mute-portrait').checked = s.autoMutePortrait !== false;
    document.getElementById('s-homepage').value = s.homepageMode || 'knack3';
    document.getElementById('s-newtab').value = s.newTabMode || 'homepage';
    document.getElementById('s-appearance').value = s.appearance || 'auto';
    document.getElementById('s-language').value = s.language || 'fr';
    if (s.customHomepageUrl) document.getElementById('s-custom-url-input').value = s.customHomepageUrl;
    document.getElementById('s-obs-enabled').checked = s.obsEnabled !== false;
    document.getElementById('s-obs-port').value = (s.obsPort != null ? s.obsPort : 0);
    toggleCustomUrl(s.homepageMode === 'custom');
    // v0.4.0
    renderSearchEngineList();
    const screenshotDir = s.screenshotDir || '';
    const dirEl = document.getElementById('s-screenshot-dir');
    if (dirEl) dirEl.textContent = screenshotDir || '(Dossier Images par défaut)';
    applyTranslations();
}



// ── Intégration OBS (paramètres) ─────────────────────────────────────────────
async function loadObsInfo() {
    let info = null;
    try { info = await window.dualview.getObsInfo(); } catch { /* ignore */ }
    const statusEl = document.getElementById('s-obs-status');
    const dockEl = document.getElementById('s-obs-dock-url');
    const portValEl = document.getElementById('s-obs-port-value');
    const tokenEl = document.getElementById('s-obs-token');
    if (!info || !info.enabled) {
        statusEl.textContent = t('obsStatusDisabled');
        dockEl.value = ''; portValEl.value = ''; tokenEl.value = '';
        return;
    }
    if (info.running) {
        statusEl.textContent = t('obsStatusRunning') + ' 127.0.0.1:' + info.port;
        dockEl.value = info.dockUrl || '';
        portValEl.value = String(info.port);
        tokenEl.value = info.token || '';
    } else {
        statusEl.textContent = t('obsStatusStopped');
        dockEl.value = ''; portValEl.value = ''; tokenEl.value = '';
    }
}

function copyToClipboard(text, btn) {
    if (!text) return;
    try { navigator.clipboard.writeText(text); } catch { /* ignore */ }
    const orig = btn.textContent;
    btn.textContent = t('copiedBtn');
    setTimeout(() => { btn.textContent = orig; }, 1500);
}

document.getElementById('s-obs-enabled').addEventListener('change', e => {
    currentSettings.obsEnabled = e.target.checked;
    saveCurrentSettings();
    setTimeout(loadObsInfo, 400);
});
document.getElementById('s-obs-port-apply').addEventListener('click', () => {
    const raw = parseInt(document.getElementById('s-obs-port').value, 10);
    const msg = document.getElementById('s-obs-port-msg');
    const port = Number.isInteger(raw) ? raw : 0;
    if (port < 0 || port > 65535) {
        msg.textContent = t('obsPortInvalid'); msg.className = 's-msg show err'; return;
    }
    currentSettings.obsPort = port;
    saveCurrentSettings();
    msg.textContent = t('obsPortApplied'); msg.className = 's-msg show ok';
    setTimeout(() => msg.classList.remove('show'), 3000);
    setTimeout(loadObsInfo, 400);
});
document.getElementById('s-obs-dock-copy').addEventListener('click', e =>
    copyToClipboard(document.getElementById('s-obs-dock-url').value, e.target));
document.getElementById('s-obs-port-copy').addEventListener('click', e =>
    copyToClipboard(document.getElementById('s-obs-port-value').value, e.target));
document.getElementById('s-obs-token-copy').addEventListener('click', e =>
    copyToClipboard(document.getElementById('s-obs-token').value, e.target));

function toggleCustomUrl(show) { document.getElementById('s-custom-url').classList.toggle('show', show); }
function saveCurrentSettings() { window.dualview.saveSettings(currentSettings); }

document.getElementById('s-homepage').addEventListener('change', e => {
    currentSettings.homepageMode = e.target.value;
    toggleCustomUrl(e.target.value === 'custom');
    if (e.target.value !== 'custom') saveCurrentSettings();
});
document.getElementById('s-validate-url').addEventListener('click', () => {
    const raw = document.getElementById('s-custom-url-input').value.trim();
    const msg = document.getElementById('s-url-msg');
    let url = raw;
    if (url && !/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) url = 'https://' + url;
    let isValid = false; try { const p = new URL(url); isValid = ['http:', 'https:'].includes(p.protocol); } catch { }
    if (isValid) {
        currentSettings.customHomepageUrl = url;
        document.getElementById('s-custom-url-input').value = url;
        msg.textContent = t('urlValid'); msg.className = 's-msg show ok'; saveCurrentSettings();
        setTimeout(() => msg.classList.remove('show'), 3000);
    } else { msg.textContent = t('urlInvalid'); msg.className = 's-msg show err'; }
});
document.getElementById('s-newtab').addEventListener('change', e => { currentSettings.newTabMode = e.target.value; saveCurrentSettings(); });
document.getElementById('s-restore').addEventListener('change', e => { currentSettings.restoreTabs = e.target.checked; saveCurrentSettings(); });
document.getElementById('s-auto-pause').addEventListener('change', e => { currentSettings.autoPauseVideo = e.target.checked; saveCurrentSettings(); });
document.getElementById('s-auto-mute-portrait').addEventListener('change', e => { currentSettings.autoMutePortrait = e.target.checked; saveCurrentSettings(); });

let restartPendingSave = null, restartRevertFn = null;
function showRestartDialog(titleKey, descKey, onConfirm, onCancel) {
    document.getElementById('restart-title').textContent = t(titleKey);
    document.getElementById('restart-desc').textContent = t(descKey);
    restartPendingSave = onConfirm; restartRevertFn = onCancel;
    document.getElementById('restart-dialog').classList.add('show');
}
document.getElementById('restart-confirm').addEventListener('click', () => {
    document.getElementById('restart-dialog').classList.remove('show');
    if (restartPendingSave) restartPendingSave();
    window.dualview.relaunchApp();
});
document.getElementById('restart-cancel').addEventListener('click', () => {
    document.getElementById('restart-dialog').classList.remove('show');
    if (restartRevertFn) restartRevertFn();
    restartPendingSave = restartRevertFn = null;
});
document.getElementById('s-appearance').addEventListener('change', e => {
    const newVal = e.target.value, prevVal = currentSettings.appearance || 'auto';
    currentSettings.appearance = newVal; saveCurrentSettings();
    showRestartDialog('restartTitle', 'restartAppearanceDesc', () => { }, () => { currentSettings.appearance = prevVal; document.getElementById('s-appearance').value = prevVal; saveCurrentSettings(); });
});
document.getElementById('s-language').addEventListener('change', e => {
    const newVal = e.target.value, prevVal = currentSettings.language || 'fr';
    currentSettings.language = newVal; saveCurrentSettings();
    showRestartDialog('restartTitle', 'restartLanguageDesc', () => { }, () => { currentSettings.language = prevVal; document.getElementById('s-language').value = prevVal; saveCurrentSettings(); });
});
document.querySelectorAll('.s-nav').forEach(nav => {
    nav.addEventListener('click', () => {
        document.querySelectorAll('.s-nav').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.s-section').forEach(s => s.classList.remove('active'));
        nav.classList.add('active');
        const sec = document.getElementById('section-' + nav.dataset.section);
        if (sec) sec.classList.add('active');
        if (nav.dataset.section === 'services') loadServicesStatus();
    });
});

// ── Services connectés ─────────────────────────────────────────────────────────
const SERVICE_ICONS = {
    google: '🔵', microsoft: '🪟', instagram: '📸', facebook: '👤',
    twitch: '💜', tiktok: '🎵', twitter: '🐦', discord: '🎮', steam: '🎮'
};
const SERVICE_LABELS = {
    google: 'Google', microsoft: 'Microsoft', instagram: 'Instagram', facebook: 'Facebook',
    twitch: 'Twitch', tiktok: 'TikTok', twitter: 'X / Twitter', discord: 'Discord', steam: 'Steam'
};

async function loadServicesStatus() {
    const loading = document.getElementById('svc-loading');
    const grid = document.getElementById('svc-grid');
    loading.style.display = 'flex';
    grid.style.display = 'none';

    const { known, custom } = await window.dualview.getConnectedServicesStatus();
    loading.style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = '';

    // Tuiles services connus
    for (const [key, label] of Object.entries(SERVICE_LABELS)) {
        const connected = known[key] === true;
        const tile = document.createElement('div');
        tile.className = 'svc-tile' + (connected ? ' connected' : '');
        tile.innerHTML = `
        <span class="svc-tile-icon">${SERVICE_ICONS[key] || '🌐'}</span>
        <span class="svc-tile-label">${label}</span>
        <span class="svc-tile-status">${connected ? t('servicesConnected') : t('servicesNotConnected')}</span>
        ${connected ? `<button class="svc-tile-disconnect" data-key="${key}" title="${t('servicesDisconnect')}">✕</button>` : ''}
    `;
        tile.addEventListener('click', async (e) => {
            if (e.target.classList.contains('svc-tile-disconnect')) return;
            if (connected) {
                // Proposer reconnecter ou déconnecter
                showSvcContextMenu(key, null, null, tile, connected);
            } else {
                await connectService(key, null, null);
                loadServicesStatus();
            }
        });
        const discBtn = tile.querySelector('.svc-tile-disconnect');
        if (discBtn) {
            discBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await window.dualview.disconnectService({ serviceKey: key });
                showToast(t('servicesDeleted'));
                loadServicesStatus();
            });
        }
        grid.appendChild(tile);
    }

    // Services personnalisés
    const customSection = document.getElementById('svc-custom-section');
    const customList = document.getElementById('svc-custom-list');
    customList.innerHTML = '';
    const customServices = custom || [];

    // Afficher la section uniquement si au moins un service personnalisé existe
    customSection.style.display = customServices.length > 0 ? 'block' : 'none';

    for (const svc of customServices) {
        const connected = svc.connected === true;
        const item = document.createElement('div');
        item.className = 'svc-tile' + (connected ? ' connected' : '');
        item.style.cssText = 'flex-direction:row;justify-content:space-between;margin-bottom:8px;padding:10px 12px;';
        item.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:18px">🌐</span>
            <div>
                <div class="svc-tile-label">${escHtml(svc.label)}</div>
                <div class="svc-tile-status" style="font-size:10px">${connected ? t('servicesConnected') : t('servicesNotConnected')}</div>
            </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
            <button class="s-validate-btn" style="font-size:11px;padding:4px 8px" data-action="${connected ? 'reconnect' : 'connect'}" data-id="${svc.id}" data-url="${escHtml(svc.url)}" data-label="${escHtml(svc.label)}">
                ${connected ? t('servicesReconnect') : t('servicesConnect')}
            </button>
            ${connected ? `<button class="restart-cancel" style="font-size:11px;padding:4px 8px" data-action="disconnect" data-id="${svc.id}" data-url="${escHtml(svc.url)}">${t('servicesDisconnect')}</button>` : ''}
            <button class="tab-close" style="font-size:16px" data-action="delete" data-id="${svc.id}">×</button>
        </div>
    `;
        item.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'connect' || action === 'reconnect') {
                    await connectService('custom', btn.dataset.url, btn.dataset.label);
                    loadServicesStatus();
                } else if (action === 'disconnect') {
                    await window.dualview.disconnectService({ serviceKey: 'custom', customUrl: btn.dataset.url });
                    showToast(t('servicesDeleted'));
                    loadServicesStatus();
                } else if (action === 'delete') {
                    await window.dualview.deleteCustomService({ serviceId: btn.dataset.id });
                    showToast(t('servicesDeleted'));
                    loadServicesStatus();
                }
            });
        });
        customList.appendChild(item);
    }
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function connectService(serviceKey, customUrl, customLabel) {
    showToast(t('servicesConnecting'), 8000);
    const result = await window.dualview.openAuthWindow({ serviceKey, customUrl, customLabel });
    if (result && result.success) showToast(t('servicesSuccess'));
    else showToast(t('servicesFailed'));
    return result && result.success;
}

function showSvcContextMenu(serviceKey, customUrl, customLabel, tileEl, isConnected) {
    // Afficher menu contextuel reconnect/déconnecter
    const existing = document.getElementById('svc-ctx-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'svc-ctx-menu';
    menu.style.cssText = `position:fixed;background:var(--bg);border:1px solid var(--border);
    border-radius:8px;padding:4px 0;min-width:160px;z-index:9000;
    box-shadow:0 2px 12px rgba(0,0,0,0.15)`;
    const rect = tileEl.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.innerHTML = `
    <div class="gear-item" id="ctx-reconnect"><span>↺</span><span>${t('servicesReconnect')}</span></div>
    <div class="gear-separator"></div>
    <div class="gear-item" id="ctx-disconnect" style="color:var(--danger)"><span>✕</span><span>${t('servicesDisconnect')}</span></div>
`;
    document.body.appendChild(menu);
    menu.querySelector('#ctx-reconnect').addEventListener('click', async () => {
        menu.remove();
        await connectService(serviceKey, customUrl, customLabel);
        loadServicesStatus();
    });
    menu.querySelector('#ctx-disconnect').addEventListener('click', async () => {
        menu.remove();
        await window.dualview.disconnectService({ serviceKey, customUrl });
        showToast(t('servicesDeleted'));
        loadServicesStatus();
    });
    setTimeout(() => {
        const closeMenu = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); } };
        document.addEventListener('click', closeMenu);
    }, 50);
}

// Formulaire ajout service perso
document.getElementById('svc-add-custom-btn').addEventListener('click', () => {
    document.getElementById('svc-custom-form').classList.add('show');
    document.getElementById('svc-custom-label').focus();
});
document.getElementById('svc-custom-cancel').addEventListener('click', () => {
    document.getElementById('svc-custom-form').classList.remove('show');
    document.getElementById('svc-custom-label').value = '';
    document.getElementById('svc-custom-url').value = '';
    document.getElementById('svc-custom-msg').className = 's-msg';
});
document.getElementById('svc-custom-connect').addEventListener('click', async () => {
    const label = document.getElementById('svc-custom-label').value.trim();
    let url = document.getElementById('svc-custom-url').value.trim();
    const msg = document.getElementById('svc-custom-msg');
    if (!label || !url) { msg.textContent = 'Nom et URL requis.'; msg.className = 's-msg show err'; return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let valid = false; try { new URL(url); valid = true; } catch { }
    if (!valid) { msg.textContent = t('urlInvalid'); msg.className = 's-msg show err'; return; }
    msg.textContent = t('servicesConnecting'); msg.className = 's-msg show ok';
    document.getElementById('svc-custom-form').classList.remove('show');
    document.getElementById('svc-custom-label').value = '';
    document.getElementById('svc-custom-url').value = '';
    await connectService('custom', url, label);
    loadServicesStatus();
});

// ── Panneau Historique (v0.4.0) ────────────────────────────────────────────────
const historyPanel = document.getElementById('history-panel');
const historyList  = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const histSearchInput = document.getElementById('history-search-input');
let historyOpen = false;
let histSearchTimer = null;

document.getElementById('history-panel-close').addEventListener('click', closeHistoryPanel);
document.getElementById('history-clear-all-btn').addEventListener('click', async () => {
    if (!confirm('Effacer tout l\'historique ?')) return;
    window.dualview.historyClearAll();
    renderHistoryList([]);
});

histSearchInput.addEventListener('input', () => {
    clearTimeout(histSearchTimer);
    histSearchTimer = setTimeout(async () => {
        const q = histSearchInput.value.trim();
        const results = await window.dualview.historySearch(q, 200);
        renderHistoryList(results);
    }, 200);
});

async function openHistoryPanel() {
    historyOpen = true;
    historyPanel.classList.add('open');
    histSearchInput.value = '';
    const entries = await window.dualview.historyGetAll();
    renderHistoryList(entries);
    setTimeout(() => histSearchInput.focus(), 250);
}

function closeHistoryPanel() {
    historyOpen = false;
    historyPanel.classList.remove('open');
}

// Fermeture sur clic extérieur au panneau
document.addEventListener('click', (e) => {
    if (historyOpen && !historyPanel.contains(e.target) && e.target.id !== 'menu-history') {
        closeHistoryPanel();
    }
    if (favoritesOpen && !favoritesPanel.contains(e.target) &&
        e.target.id !== 'menu-favorites' && e.target.id !== 'favorite-btn') {
        closeFavoritesPanel();
    }
});

// ── Panneau Favoris (v0.4.7) ──────────────────────────────────────────────────
const favoritesPanel      = document.getElementById('favorites-panel');
const favoritesList       = document.getElementById('favorites-list');
const favoritesEmpty      = document.getElementById('favorites-empty');
const favSearchInput      = document.getElementById('favorites-search-input');
const favoriteBtn         = document.getElementById('favorite-btn');
let favoritesOpen         = false;
let favSearchTimer        = null;

document.getElementById('favorites-panel-close').addEventListener('click', closeFavoritesPanel);

favSearchInput.addEventListener('input', () => {
    clearTimeout(favSearchTimer);
    favSearchTimer = setTimeout(async () => {
        const q = favSearchInput.value.trim();
        const results = await window.dualview.favoritesSearch(q, 200);
        renderFavoritesList(results);
    }, 200);
});

async function openFavoritesPanel() {
    favoritesOpen = true;
    favoritesPanel.classList.add('open');
    favSearchInput.value = '';
    const entries = await window.dualview.favoritesGetAll();
    renderFavoritesList(entries);
    setTimeout(() => favSearchInput.focus(), 250);
}

function closeFavoritesPanel() {
    favoritesOpen = false;
    favoritesPanel.classList.remove('open');
}

/**
 * Affiche la liste des favoris dans le panneau.
 */
function renderFavoritesList(entries) {
    favoritesList.innerHTML = '';
    favoritesList.appendChild(favoritesEmpty);

    if (!entries || entries.length === 0) {
        favoritesEmpty.style.display = 'flex';
        return;
    }
    favoritesEmpty.style.display = 'none';

    entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'fav-item';

        const favicon = document.createElement('span');
        favicon.className = 'fav-favicon';
        favicon.textContent = '★';

        const text = document.createElement('div');
        text.className = 'fav-text';

        const titleEl = document.createElement('div');
        titleEl.className = 'fav-title';
        titleEl.textContent = entry.title || entry.url;
        titleEl.title = entry.url;

        const urlEl = document.createElement('div');
        urlEl.className = 'fav-url';
        urlEl.textContent = entry.url;

        text.appendChild(titleEl);
        text.appendChild(urlEl);

        const delBtn = document.createElement('button');
        delBtn.className = 'fav-delete-btn';
        delBtn.title = 'Retirer des favoris';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await window.dualview.favoritesRemove(entry.url);
            item.remove();
            // Rafraîchir le bouton étoile si l'URL retirée est la page courante
            const currentUrl = document.getElementById('url-input').value;
            if (currentUrl && currentUrl === entry.url) {
                updateFavoriteBtn(false);
            }
            // Mettre à jour l'empty state
            if (!favoritesList.querySelector('.fav-item')) {
                favoritesEmpty.style.display = 'flex';
            }
        });

        item.appendChild(favicon);
        item.appendChild(text);
        item.appendChild(delBtn);

        // Clic sur l'item → naviguer
        item.addEventListener('click', () => {
            navigate(entry.url);
            closeFavoritesPanel();
        });

        favoritesList.appendChild(item);
    });
}

// ── Bouton étoile dans la barre (v0.4.7) ─────────────────────────────────────
/**
 * Met à jour l'état visuel du bouton étoile.
 * @param {boolean} isFav
 */
function updateFavoriteBtn(isFav) {
    if (!favoriteBtn) return;
    favoriteBtn.classList.toggle('fav-btn-active',   isFav);
    favoriteBtn.classList.toggle('fav-btn-inactive', !isFav);
    favoriteBtn.title = isFav ? '★ Retirer des favoris' : '☆ Ajouter aux favoris';
}

/**
 * Vérifie si l'URL courante est en favori et met à jour le bouton.
 * @param {string} url
 */
async function refreshFavoriteBtnForUrl(url) {
    if (!url || url === 'about:blank' || url.startsWith('dualview://')) {
        updateFavoriteBtn(false);
        return;
    }
    const isFav = await window.dualview.favoritesIs(url);
    updateFavoriteBtn(!!isFav);
}

// Clic sur le bouton étoile : toggle favori
favoriteBtn.addEventListener('click', async () => {
    const url = document.getElementById('url-input').value;
    if (!url || url === 'about:blank' || url.startsWith('dualview://')) return;

    const isFav = favoriteBtn.classList.contains('fav-btn-active');
    if (isFav) {
        await window.dualview.favoritesRemove(url);
        updateFavoriteBtn(false);
        showToast(t('favoriteRemoved'));
    } else {
        // Récupérer le titre depuis l'onglet actif
        const tab = typeof tabs !== 'undefined' ? tabs.find(tb => tb.id === activeTabId) : null;
        const title = (tab && tab.title) ? tab.title : '';
        await window.dualview.favoritesAdd(url, title);
        updateFavoriteBtn(true);
        showToast(t('favoriteAdded'));
    }
    // Rafraîchir le panneau s'il est ouvert
    if (favoritesOpen) {
        const entries = await window.dualview.favoritesGetAll();
        renderFavoritesList(entries);
    }
});

/**
 * Groupe les entrées par date et génère le HTML du panneau.
 */
function renderHistoryList(entries) {
    // Vider sauf l'empty-state
    historyList.innerHTML = '';
    historyList.appendChild(historyEmpty);

    if (!entries || entries.length === 0) {
        historyEmpty.style.display = 'flex';
        return;
    }
    historyEmpty.style.display = 'none';

    // Groupement par date
    const groups = new Map(); // label → [{entry, originalUrl}]
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);

    entries.forEach(entry => {
        const d = new Date(entry.visitedAt);
        const ds = d.toDateString();
        let label;
        if (ds === todayStr) label = "Aujourd'hui";
        else if (ds === yesterdayStr) label = 'Hier';
        else if (d >= weekAgo) label = 'Cette semaine';
        else {
            // Mois + année
            label = d.toLocaleDateString(currentLang === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
            label = label.charAt(0).toUpperCase() + label.slice(1);
        }
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(entry);
    });

    groups.forEach((groupEntries, label) => {
        // En-tête du groupe
        const lbl = document.createElement('div');
        lbl.className = 'hist-group-label';
        lbl.textContent = label;
        historyList.appendChild(lbl);

        groupEntries.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'hist-item';

            const favicon = document.createElement('span');
            favicon.className = 'hist-favicon';
            favicon.textContent = '🌐';

            const text = document.createElement('div');
            text.className = 'hist-text';

            const title = document.createElement('div');
            title.className = 'hist-title';
            title.textContent = entry.title || entry.url;
            title.title = entry.url;

            const url = document.createElement('div');
            url.className = 'hist-url';
            url.textContent = entry.url;

            text.appendChild(title);
            text.appendChild(url);

            const time = document.createElement('span');
            time.className = 'hist-time';
            const d = new Date(entry.visitedAt);
            time.textContent = d.toLocaleTimeString(currentLang === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });

            const delBtn = document.createElement('button');
            delBtn.className = 'hist-delete-btn';
            delBtn.title = 'Supprimer';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                window.dualview.historyDeleteUrl(entry.url);
                item.remove();
                // Supprimer le groupe s'il est vide
                const parentGroup = lbl;
                const siblings = Array.from(historyList.children).filter(el =>
                    el !== parentGroup && el.previousElementSibling === parentGroup
                );
                if (siblings.length === 0) {
                    // Vérifier si plus aucun hist-item après ce label
                    let next = parentGroup.nextElementSibling;
                    if (!next || next.classList.contains('hist-group-label')) {
                        parentGroup.remove();
                    }
                }
                // Vérifier si tout est vide
                if (!historyList.querySelector('.hist-item')) {
                    historyEmpty.style.display = 'flex';
                }
            });

            item.appendChild(favicon);
            item.appendChild(text);
            item.appendChild(time);
            item.appendChild(delBtn);

            // Clic sur l'item → naviguer
            item.addEventListener('click', () => {
                navigate(entry.url);
                closeHistoryPanel();
            });

            historyList.appendChild(item);
        });
    });
}

// ── Dropdown historique sur ← → (v0.4.0) ─────────────────────────────────────
const navHistDropdown = document.getElementById('nav-history-dropdown');
let navHistTimer = null;
let navHistHoldTimer = null;
let navHistActiveBtn = null;

function positionNavHistDropdown(btn) {
    // Le dropdown est un enfant direct de #toolbar (position:absolute)
    // On positionne par rapport au bouton dans la toolbar
    const toolbarRect = document.getElementById('toolbar').getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    navHistDropdown.style.left = (btnRect.left - toolbarRect.left) + 'px';
}

async function showNavHistDropdown(btn) {
    navHistActiveBtn = btn;

    // ── Source de données : pile de navigation native de la webview ──────────
    // Comme Chrome/Firefox : on lit directement l'historique de navigation
    // interne de la webview (wv.navigationHistory), qui contient exactement
    // les URLs visitées dans cet onglet avec l'index courant.
    const wv = getActiveWebview();
    let navEntries = [];   // [{url, title}]
    let currentIndex = -1;

    if (wv && wv.navigationHistory) {
        // API Electron >= 22 : navigationHistory
        try {
            const nh = wv.navigationHistory;
            currentIndex = nh.getActiveIndex();
            const total = nh.length();
            for (let i = 0; i < total; i++) {
                const entry = nh.getEntryAtIndex(i);
                if (entry) navEntries.push({ url: entry.url, title: entry.title || '' });
            }
        } catch { navEntries = []; }
    }

    // Fallback : tabHistory en mémoire (alimenté par addToHistory dans did-navigate)
    if (navEntries.length === 0) {
        const memHist = tabHistory.get(activeTabId) || [];
        navEntries = memHist.map(url => ({ url, title: '' }));
        // En mémoire l'ordre est du plus récent au plus ancien → l'index courant est 0
        currentIndex = 0;
    }

    navHistDropdown.innerHTML = '';

    if (navEntries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'nav-hist-item';
        empty.style.color = 'var(--fg-muted)';
        empty.style.fontStyle = 'italic';
        empty.style.padding = '8px 12px';
        empty.textContent = 'Aucun historique pour cet onglet';
        navHistDropdown.appendChild(empty);
    } else {
        // ── Reproduire le comportement Chrome/Firefox ────────────────────────
        // Pages SUIVANTES (au-dessus de la courante) — du plus proche au plus loin
        const afterCurrent = navEntries.slice(currentIndex + 1).reverse();
        // Page courante
        const current = navEntries[currentIndex] || null;
        // Pages PRÉCÉDENTES (sous la courante) — du plus récent au plus ancien
        const beforeCurrent = navEntries.slice(0, currentIndex).reverse();

        // Section "Pages suivantes" (si applicable — bouton → survolé)
        if (afterCurrent.length > 0) {
            const lbl = document.createElement('div');
            lbl.className = 'nav-hist-section';
            lbl.textContent = 'Suivant';
            navHistDropdown.appendChild(lbl);
            afterCurrent.forEach(entry => navHistDropdown.appendChild(makeNavHistItem(entry, false)));
            const sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:var(--border);margin:2px 0';
            navHistDropdown.appendChild(sep);
        }

        // Page courante (toujours affichée)
        if (current) {
            if (!afterCurrent.length) {
                const lbl = document.createElement('div');
                lbl.className = 'nav-hist-section';
                lbl.textContent = 'Onglet actif';
                navHistDropdown.appendChild(lbl);
            }
            navHistDropdown.appendChild(makeNavHistItem(current, true));
        }

        // Section "Pages précédentes"
        if (beforeCurrent.length > 0) {
            const sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:var(--border);margin:2px 0';
            navHistDropdown.appendChild(sep);
            const lbl = document.createElement('div');
            lbl.className = 'nav-hist-section';
            lbl.textContent = 'Précédent';
            navHistDropdown.appendChild(lbl);
            // Limiter à 8 entrées précédentes
            beforeCurrent.slice(0, 8).forEach(entry => navHistDropdown.appendChild(makeNavHistItem(entry, false)));
        }
    }

    // Footer : deux boutons côte à côte
    const footer = document.createElement('div');
    footer.className = 'nav-hist-footer';

    const btnHistory = document.createElement('button');
    btnHistory.className = 'nav-hist-footer-btn';
    btnHistory.textContent = '🕐 Voir l\'historique';
    btnHistory.addEventListener('mousedown', e => {
        e.preventDefault();
        closeNavHistDropdown();
        openHistoryPanel();
    });

    const btnHide = document.createElement('button');
    btnHide.className = 'nav-hist-footer-btn hide-btn';
    btnHide.textContent = '✕ Cacher';
    btnHide.addEventListener('mousedown', e => {
        e.preventDefault();
        closeNavHistDropdown();
    });

    footer.appendChild(btnHistory);
    footer.appendChild(btnHide);
    navHistDropdown.appendChild(footer);

    positionNavHistDropdown(btn);
    navHistDropdown.classList.add('open');
}

// Crée un élément de la liste du dropdown nav-history
function makeNavHistItem(entry, isCurrent) {
    const item = document.createElement('div');
    item.className = 'nav-hist-item' + (isCurrent ? ' current' : '');

    const icon = document.createElement('span');
    icon.className = 'nav-hist-icon';
    icon.textContent = isCurrent ? '●' : '○';

    const urlSpan = document.createElement('span');
    urlSpan.className = 'nav-hist-url';
    // Afficher le titre si disponible, sinon le hostname
    let label = entry.title || entry.url;
    if (!entry.title) {
        try { label = new URL(entry.url).hostname.replace('www.', ''); } catch { label = entry.url; }
    }
    urlSpan.textContent = label;
    urlSpan.title = entry.url;

    item.appendChild(icon);
    item.appendChild(urlSpan);

    if (!isCurrent) {
        item.addEventListener('mousedown', e => {
            e.preventDefault();
            closeNavHistDropdown();
            navigate(entry.url);
        });
    }
    return item;
}

function closeNavHistDropdown() {
    navHistDropdown.classList.remove('open');
    navHistActiveBtn = null;
    clearTimeout(navHistTimer);
    clearTimeout(navHistHoldTimer);
    clearTimeout(navHistCloseTimer);
}

// ── Timer de fermeture par unfocus ────────────────────────────────────────────
// Partagé entre les boutons ← → ET le dropdown lui-même.
// Déclenché quand la souris quitte l'un ou l'autre.
// Annulé si la souris revient sur l'un ou l'autre avant 500ms.
let navHistCloseTimer = null;

function scheduleNavHistClose() {
    clearTimeout(navHistCloseTimer);
    navHistCloseTimer = setTimeout(() => {
        if (navHistDropdown.classList.contains('open')) closeNavHistDropdown();
    }, 500);
}

function cancelNavHistClose() {
    clearTimeout(navHistCloseTimer);
}

// Le dropdown lui-même annule la fermeture quand la souris le survole
navHistDropdown.addEventListener('mouseenter', cancelNavHistClose);
navHistDropdown.addEventListener('mouseleave', scheduleNavHistClose);

function attachNavHistEvents(btn) {
    // Survol > 500 ms → ouvrir
    btn.addEventListener('mouseenter', () => {
        cancelNavHistClose();
        if (btn.disabled) return;
        navHistTimer = setTimeout(() => showNavHistDropdown(btn), 500);
    });
    btn.addEventListener('mouseleave', () => {
        clearTimeout(navHistTimer);
        // Lancer le timer de fermeture si le dropdown est ouvert
        if (navHistDropdown.classList.contains('open')) scheduleNavHistClose();
    });
    // Clic maintenu > 400 ms → ouvrir
    btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || btn.disabled) return;
        navHistHoldTimer = setTimeout(() => {
            showNavHistDropdown(btn);
        }, 400);
    });
    btn.addEventListener('mouseup', () => clearTimeout(navHistHoldTimer));
    btn.addEventListener('mouseleave', () => clearTimeout(navHistHoldTimer));
}

// Fermeture sur clic extérieur
document.addEventListener('click', (e) => {
    if (navHistDropdown.classList.contains('open') &&
        !navHistDropdown.contains(e.target) &&
        e.target !== backBtn && e.target !== forwardBtn) {
        closeNavHistDropdown();
    }
});

// Attacher les events aux boutons ← →
attachNavHistEvents(backBtn);
attachNavHistEvents(forwardBtn);

// ── Raccourcis clavier (v0.4.1) ────────────────────────────────────────────
// Même logique que les commandes OBS : on appelle les fonctions UI existantes.
// Priorité absolue sur les raccourcis natifs du renderer pour F5/Ctrl+R.
document.addEventListener('keydown', (e) => {
    // Ne pas intercepter si le focus est dans un champ de saisie (omnibar)
    const tag = document.activeElement && document.activeElement.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

    // Ctrl+L / F6 — Focus barre d'adresse (intercepté même dans un input)
    if ((e.key === 'F6') || (e.key === 'l' && (e.ctrlKey || e.metaKey) && !e.shiftKey)) {
        e.preventDefault();
        urlInput.select();
        urlInput.focus();
        return;
    }

    // Échap — Fermer dropdowns / quitter l'omnibar
    if (e.key === 'Escape' && !isInput) {
        document.getElementById('gear-menu').classList.remove('open');
        syncMenu.classList.remove('open');
        closeNavHistDropdown();
        closeHistoryPanel();
        closeFavoritesPanel();
        return;
    }

    // Raccourcis bloqués si focus dans un champ de saisie (sauf ceux ci-dessus)
    if (isInput) return;

    // Alt+← — Retour
    if (e.key === 'ArrowLeft' && e.altKey) {
        e.preventDefault();
        if (!backBtn.disabled) window.dualview.navBack();
        return;
    }
    // Alt+→ — Avance
    if (e.key === 'ArrowRight' && e.altKey) {
        e.preventDefault();
        if (!forwardBtn.disabled) window.dualview.navForward();
        return;
    }
    // F5 ou Ctrl+R — Recharger (sans recharger la fenêtre Electron)
    if (e.key === 'F5' || (e.key === 'r' && (e.ctrlKey || e.metaKey) && !e.shiftKey)) {
        e.preventDefault();
        document.getElementById('reload-btn').click();
        return;
    }
    // Ctrl+T — Nouvel onglet
    if (e.key === 't' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        addTab();
        return;
    }
    // Ctrl+W — Fermer onglet actif
    if (e.key === 'w' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (tabs.length > 1) closeTab(activeTabId);
        return;
    }
    // Ctrl+Tab — Onglet suivant
    if (e.key === 'Tab' && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (idx !== -1) switchTab(tabs[(idx + 1) % tabs.length].id);
        return;
    }
    // Ctrl+Shift+Tab — Onglet précédent
    if (e.key === 'Tab' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (idx !== -1) switchTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
        return;
    }
    // Ctrl+Shift+H — Toggle Mode Focus (v0.5.0)
    if (e.key === 'H' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        setFocusMode(!focusMode);
        return;
    }
    // F11 — Toggle Mode Focus (v0.5.0) — alternative au raccourci principal
    if (e.key === 'F11') {
        e.preventDefault();
        setFocusMode(!focusMode);
        return;
    }
});

// ── Boutons souris Retour/Avance (v0.4.1) ────────────────────────────────
// Le main envoie 'mouse-nav' après avoir capturé les boutons 3/4 via
// before-input-event (seule méthode fiable dans une webview Electron).
window.dualview.on('mouse-nav', (direction) => {
    if (direction === 'back' && !backBtn.disabled) window.dualview.navBack();
    if (direction === 'forward' && !forwardBtn.disabled) window.dualview.navForward();
});

// ── Actions du menu contextuel (v0.4.1) ──────────────────────────────────
// Reçues du main après sélection d'une entrée du menu natif.
window.dualview.on('context-menu-action', ({ action, url, text, x, y }) => {
    const wv = getActiveWebview();
    switch (action) {
        case 'open-link-new-tab':
            if (url) addTabWithUrl(url);
            break;
        case 'reload':
            document.getElementById('reload-btn').click();
            break;
        case 'copy-page-url': {
            const currentUrl = document.getElementById('url-input').value;
            if (currentUrl) navigator.clipboard.writeText(currentUrl).catch(() => { });
            break;
        }
        case 'search-selection':
            if (text) addTabWithUrl(buildSearchUrl(text));
            break;
        case 'inspect':
            if (wv && wv.openDevTools) wv.openDevTools();
            break;
        default:
            break;
    }
});