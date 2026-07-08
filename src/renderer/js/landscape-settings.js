/*
 * DualView - Paramètres, services connectés, historique, favoris
 * Version: 0.7.0
 *
 * Moteurs de recherche personnalisés, intégration OBS (settings),
 * chargement/sauvegarde des paramètres, services connectés,
 * panneau historique, panneau favoris, bouton étoile favoris,
 * dropdown nav hist, raccourcis clavier, boutons souris, menu contextuel.
 *
 * v0.7.0 : SERVICE_ICONS/SERVICE_LABELS incluent désormais github/gitlab
 *   (tuiles manquantes dans Services connectés malgré le support backend
 *   complet depuis v0.4.7). Ajout de la vérification de mise à jour
 *   (loadUpdateInfo, bouton #s-update-check-btn → IPC check-for-update).
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
    // v0.7.1 — Téléchargements
    const allowDlEl = document.getElementById('s-allow-downloads');
    if (allowDlEl) allowDlEl.checked = s.allowDownloads === true;
    const askPathEl = document.getElementById('s-download-ask-path');
    if (askPathEl) askPathEl.checked = s.downloadAskPath === true;
    const downloadDirEl = document.getElementById('s-download-dir');
    if (downloadDirEl) downloadDirEl.textContent = s.downloadDir || t('downloadDirDefault');
    // Griser la section dossier si "Toujours demander" est coché
    const dirSection = document.getElementById('s-download-dir-section');
    if (dirSection) dirSection.classList.toggle('grayed', s.downloadAskPath === true);
    applyTranslations();
    loadUpdateInfo();
    // v0.8.0 — Injection CSS/JS : initialiser la liste si la section est déjà active
    if (typeof renderUserScriptsList === 'function') renderUserScriptsList();
}

// ── Vérification de mise à jour (v0.7.0) ─────────────────────────────────────
// Option minimale priorité 0 (TODO.md) : pas d'auto-updater, pas de dépendance
// npm supplémentaire. L'utilisateur déclenche la vérification depuis Général ;
// le téléchargement et l'installation restent manuels (lien vers la Release).
async function loadUpdateInfo() {
    const versionEl = document.getElementById('s-update-current');
    if (!versionEl) return;
    try {
        const v = await window.dualview.getVersion();
        versionEl.textContent = t('updateCurrentVersion') + ' v' + v;
    } catch { /* ignore */ }
}

const updateCheckBtn = document.getElementById('s-update-check-btn');
if (updateCheckBtn) {
    updateCheckBtn.addEventListener('click', async () => {
        const msg = document.getElementById('s-update-msg');
        updateCheckBtn.disabled = true;
        msg.innerHTML = '';
        msg.textContent = t('updateChecking');
        msg.className = 's-msg show';
        let result = null;
        try { result = await window.dualview.checkForUpdate(); } catch { /* result reste null */ }
        updateCheckBtn.disabled = false;
        if (!result || result.error) {
            msg.textContent = t('updateError');
            msg.className = 's-msg show err';
            return;
        }
        if (result.updateAvailable) {
            msg.textContent = t('updateAvailable') + ' v' + result.latest + ' ';
            const dlBtn = document.createElement('button');
            dlBtn.className = 's-validate-btn';
            dlBtn.style.marginLeft = '8px';
            dlBtn.textContent = t('updateDownloadBtn');
            dlBtn.addEventListener('click', () => window.dualview.openExternalUrl(result.url));
            msg.appendChild(dlBtn);
            msg.className = 's-msg show ok';
        } else {
            msg.textContent = t('updateUpToDate');
            msg.className = 's-msg show ok';
        }
    });
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
        if (nav.dataset.section === 'obs') loadObsInfo();
        if (nav.dataset.section === 'exportimport') buildExportChecklist();
        if (nav.dataset.section === 'userscripts' && typeof renderUserScriptsList === 'function') renderUserScriptsList();
    });
});

// ── Services connectés ─────────────────────────────────────────────────────────
// v0.7.0 : ajout github/gitlab — ces services existent dans KNOWN_SERVICES
// (auth-window.js) depuis la v0.4.7 mais étaient absents de ces deux tables,
// ce qui rendait leurs tuiles invisibles dans Paramètres → Services connectés
// (aucune tuile générée, donc impossible de s'y connecter depuis cet écran).
const SERVICE_ICONS = {
    google: '🔵', microsoft: '🪟', instagram: '📸', facebook: '👤',
    twitch: '💜', tiktok: '🎵', twitter: '🐦', discord: '🎮', steam: '🎮',
    github: '🐙', gitlab: '🦊'
};
const SERVICE_LABELS = {
    google: 'Google', microsoft: 'Microsoft', instagram: 'Instagram', facebook: 'Facebook',
    twitch: 'Twitch', tiktok: 'TikTok', twitter: 'X / Twitter', discord: 'Discord', steam: 'Steam',
    github: 'GitHub', gitlab: 'GitLab'
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

    // v0.9.0 — Fallback pile de navigation simulée persistante
    // Si la pile native n'a qu'une seule entrée (restart) et que notre pile
    // en a plusieurs, on l'utilise pour peupler le dropdown.
    if (navEntries.length <= 1 && typeof navStacks !== 'undefined') {
        const ns = navStacks.get(activeTabId);
        if (ns && ns.stack && ns.stack.length > 1) {
            navEntries  = ns.stack.map(url => ({ url, title: '' }));
            currentIndex = ns.index;
        }
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

// ── Export / Import configuration (v0.5.2) ────────────────────────────────────

/**
 * Définition des paramètres exportables.
 * Regroupés par catégorie pour l'affichage dans la checklist.
 * Chaque entrée : { key, labelKey, group, defaultChecked }
 */
const EXPORTABLE_KEYS = [
    // Comportement général
    { key: 'restoreTabs',         group: 'general', defaultChecked: true },
    { key: 'autoPauseVideo',      group: 'general', defaultChecked: true },
    { key: 'autoMutePortrait',    group: 'general', defaultChecked: true },
    // Page d'accueil
    { key: 'homepageMode',        group: 'homepage', defaultChecked: true },
    { key: 'customHomepageUrl',   group: 'homepage', defaultChecked: true },
    { key: 'newTabMode',          group: 'homepage', defaultChecked: true },
    // Interface
    { key: 'appearance',          group: 'interface', defaultChecked: true },
    { key: 'language',            group: 'interface', defaultChecked: true },
    // Recherche
    { key: 'searchEngineId',      group: 'search', defaultChecked: true },
    { key: 'searchEngineUrl',     group: 'search', defaultChecked: false },
    { key: 'searchEngineName',    group: 'search', defaultChecked: false },
    { key: 'customSearchEngines', group: 'search', defaultChecked: true },
    // Autres
    { key: 'screenshotDir',       group: 'other', defaultChecked: false },
    { key: 'portraitPreset',      group: 'other', defaultChecked: true },
    { key: 'customServices',      group: 'other', defaultChecked: true },
    // Données (v0.5.2b)
    { key: '_portraitWindow',     group: 'data',  defaultChecked: true },
    { key: '_history',            group: 'data',  defaultChecked: true },
    { key: '_favorites',          group: 'data',  defaultChecked: true },
];

const EXPORT_GROUP_LABELS = {
    general:   { fr: 'Comportement',         en: 'Behavior' },
    homepage:  { fr: "Page d'accueil",        en: 'Homepage' },
    interface: { fr: 'Interface',             en: 'Interface' },
    search:    { fr: 'Moteur de recherche',   en: 'Search engine' },
    other:     { fr: 'Autres',                en: 'Other' },
    data:      { fr: 'Données',               en: 'Data' },
};

/**
 * Construit la checklist d'export dans le panneau Export/Import.
 * Appelé à l'ouverture de la section pour refléter les settings courants.
 */
function buildExportChecklist() {
    const container = document.getElementById('export-checklist');
    if (!container) return;
    container.innerHTML = '';

    // Grouper par catégorie
    const groups = {};
    for (const item of EXPORTABLE_KEYS) {
        if (!groups[item.group]) groups[item.group] = [];
        groups[item.group].push(item);
    }

    const lang = currentLang || 'fr';

    for (const [groupKey, items] of Object.entries(groups)) {
        // Titre du groupe
        const groupLabel = document.createElement('div');
        groupLabel.className = 'export-group-label';
        groupLabel.textContent = (EXPORT_GROUP_LABELS[groupKey] || {})[lang] || groupKey;
        container.appendChild(groupLabel);

        for (const item of items) {
            const row = document.createElement('label');
            row.className = 'export-check-row';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'export-key-' + item.key;
            checkbox.checked = item.defaultChecked;
            checkbox.dataset.exportKey = item.key;

            const labelText = document.createElement('span');
            labelText.textContent = t('exportKey_' + item.key) || item.key;

            // Afficher la valeur actuelle en sous-texte
            const valPreview = document.createElement('span');
            valPreview.className = 'export-val-preview';

            if (item.key === '_history') {
                // Aperçu dynamique : récupérer le compte depuis l'historique
                valPreview.textContent = '…';
                window.dualview.historyGetAll().then(entries => {
                    valPreview.textContent = entries && entries.length > 0
                        ? `${entries.length} entrée(s)`
                        : '(vide)';
                }).catch(() => { valPreview.textContent = '?'; });

                // Insérer le row maintenant pour pouvoir placer le dropdown juste après
                row.appendChild(checkbox);
                row.appendChild(labelText);
                row.appendChild(valPreview);
                container.appendChild(row);

                // Dropdown limite — visible seulement si la case est cochée
                const limitRow = document.createElement('div');
                limitRow.className = 'export-history-limit-row';
                limitRow.id = 'export-history-limit-row';
                limitRow.style.display = checkbox.checked ? 'flex' : 'none';

                const limitLabel = document.createElement('span');
                limitLabel.className = 'export-history-limit-label';
                limitLabel.textContent = t('historyLimitLabel');

                const limitSelect = document.createElement('select');
                limitSelect.id = 'export-history-limit';
                limitSelect.className = 'export-history-limit-select';
                [
                    { value: '500',  labelKey: 'historyLimit500' },
                    { value: '1000', labelKey: 'historyLimit1000' },
                    { value: '5000', labelKey: 'historyLimit5000' },
                    { value: '0',    labelKey: 'historyLimitAll' },
                ].forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.value;
                    o.textContent = t(opt.labelKey);
                    if (opt.value === '500') o.selected = true;
                    limitSelect.appendChild(o);
                });

                limitRow.appendChild(limitLabel);
                limitRow.appendChild(limitSelect);
                container.appendChild(limitRow);

                // Afficher/masquer le dropdown selon l'état de la checkbox
                checkbox.addEventListener('change', () => {
                    limitRow.style.display = checkbox.checked ? 'flex' : 'none';
                });

                continue; // le row a déjà été appendé manuellement
            } else if (item.key === '_favorites') {
                valPreview.textContent = '…';
                window.dualview.favoritesGetAll().then(entries => {
                    valPreview.textContent = entries && entries.length > 0
                        ? `${entries.length} favori(s)`
                        : '(vide)';
                }).catch(() => { valPreview.textContent = '?'; });
            } else if (item.key === '_portraitWindow') {
                // On n'a pas d'accès direct aux dimensions portrait depuis le renderer,
                // on affiche le preset actif comme proxy
                const preset = currentSettings.portraitPreset || 'iphone15';
                valPreview.textContent = preset;
            } else {
                const val = currentSettings[item.key];
                if (val !== undefined && val !== null && val !== '') {
                    if (Array.isArray(val)) {
                        valPreview.textContent = val.length > 0 ? `${val.length} élément(s)` : '(vide)';
                    } else if (typeof val === 'boolean') {
                        valPreview.textContent = val ? '✓ activé' : '✗ désactivé';
                    } else {
                        const str = String(val);
                        valPreview.textContent = str.length > 50 ? str.slice(0, 47) + '…' : str;
                    }
                } else {
                    valPreview.textContent = '(non défini)';
                }
            }

            row.appendChild(checkbox);
            row.appendChild(labelText);
            row.appendChild(valPreview);
            container.appendChild(row);
        }
    }
}

// Boutons Tout sélectionner / Tout désélectionner
document.getElementById('export-select-all').addEventListener('click', () => {
    document.querySelectorAll('#export-checklist input[type="checkbox"]')
        .forEach(cb => { cb.checked = true; });
});
document.getElementById('export-select-none').addEventListener('click', () => {
    document.querySelectorAll('#export-checklist input[type="checkbox"]')
        .forEach(cb => { cb.checked = false; });
});

// Bouton Export
document.getElementById('export-btn').addEventListener('click', async () => {
    const msg = document.getElementById('export-msg');
    // Construire la sélection depuis les checkboxes
    const selection = {};
    document.querySelectorAll('#export-checklist input[type="checkbox"]').forEach(cb => {
        selection[cb.dataset.exportKey] = cb.checked;
    });
    // Lire la limite d'historique (0 = tout)
    const limitEl = document.getElementById('export-history-limit');
    if (limitEl) selection._historyLimit = parseInt(limitEl.value, 10) || 0;

    // Vérifier qu'au moins un item est coché
    if (!Object.values(selection).some(v => v === true)) {
        msg.textContent = currentLang === 'fr'
            ? 'Sélectionnez au moins un paramètre.'
            : 'Select at least one setting.';
        msg.className = 's-msg show err';
        return;
    }
    msg.textContent = ''; msg.className = 's-msg';
    const result = await window.dualview.exportConfig(selection);
    if (result && result.success) {
        msg.textContent = t('exportOk');
        msg.className = 's-msg show ok';
        setTimeout(() => msg.classList.remove('show'), 4000);
    } else if (result && result.canceled) {
        // Annulé par l'utilisateur — silencieux
    } else {
        msg.textContent = t('exportErr') + (result && result.error ? ' — ' + result.error : '');
        msg.className = 's-msg show err';
    }
});

// Bouton Import — ouvrir le fichier, puis afficher la modale de merge
document.getElementById('import-btn').addEventListener('click', async () => {
    const msg = document.getElementById('import-msg');
    msg.textContent = ''; msg.className = 's-msg';

    const result = await window.dualview.importConfigRead();
    if (!result || result.canceled) return;

    if (!result.success) {
        if (result.error === 'invalid_file') {
            msg.textContent = t('importErrInvalid');
        } else {
            msg.textContent = t('importErrRead') + (result.error ? ' — ' + result.error : '');
        }
        msg.className = 's-msg show err';
        return;
    }

    // Afficher la modale de merge sélectif
    openImportMergeModal(result.imported, result.has || {}, msg);
});

/**
 * Ouvre la modale de merge sélectif avec les données du fichier importé.
 * @param {object} importedData  Contenu parsé du fichier
 * @param {object} hasData       Flags {history, favorites, portraitWindow} — données non-settings dispo
 * @param {HTMLElement} msgEl    Élément de message dans la section Import
 */
function openImportMergeModal(importedData, hasData, msgEl) {
    const overlay  = document.getElementById('import-merge-overlay');
    const metaEl   = document.getElementById('import-merge-meta');
    const listEl   = document.getElementById('import-merge-list');

    // Métadonnées du fichier
    const exportedAt = importedData.exportedAt
        ? new Date(importedData.exportedAt).toLocaleString(currentLang === 'fr' ? 'fr-FR' : 'en-US')
        : '?';
    const versionStr = importedData.version || '?';
    metaEl.textContent = currentLang === 'fr'
        ? `Exporté le ${exportedAt} — version ${versionStr}`
        : `Exported on ${exportedAt} — version ${versionStr}`;

    listEl.innerHTML = '';
    const importedSettings = importedData.settings || {};

    // Construire la liste fusionnée : settings + clés spéciales disponibles dans le fichier
    const allItems = [];

    // Paramètres settings présents dans le fichier
    for (const key of Object.keys(importedSettings)) {
        allItems.push({ key, type: 'setting', value: importedSettings[key] });
    }

    // Clés spéciales (données)
    if (hasData && hasData.history) {
        allItems.push({ key: '_history', type: 'special',
            value: `${(importedData.history || []).length} entrée(s)` });
    }
    if (hasData && hasData.favorites) {
        allItems.push({ key: '_favorites', type: 'special',
            value: `${(importedData.favorites || []).length} favori(s)` });
    }
    if (hasData && hasData.portraitWindow) {
        const pw = importedData.portraitWindow;
        allItems.push({ key: '_portraitWindow', type: 'special',
            value: `${pw.width} × ${pw.height}` });
    }

    if (allItems.length === 0) {
        listEl.textContent = currentLang === 'fr'
            ? 'Aucun paramètre trouvé dans ce fichier.'
            : 'No settings found in this file.';
    } else {
        // En-têtes colonnes
        const header = document.createElement('div');
        header.className = 'import-merge-header';
        header.innerHTML = `
            <span></span>
            <span>${currentLang === 'fr' ? 'Paramètre' : 'Setting'}</span>
            <span>${currentLang === 'fr' ? 'Valeur importée' : 'Imported value'}</span>
            <span>${currentLang === 'fr' ? 'Valeur actuelle' : 'Current value'}</span>
        `;
        listEl.appendChild(header);

        for (const item of allItems) {
            const row = document.createElement('label');
            row.className = 'import-merge-row';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.dataset.importKey = item.key;
            checkbox.dataset.importType = item.type;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'import-merge-key';
            nameSpan.textContent = t('exportKey_' + item.key) || item.key;

            // Valeur importée
            const newValSpan = document.createElement('span');
            newValSpan.className = 'import-merge-val new';
            if (item.type === 'special') {
                newValSpan.textContent = item.value;
            } else {
                const v = item.value;
                if (Array.isArray(v)) {
                    newValSpan.textContent = `${v.length} élément(s)`;
                } else if (typeof v === 'boolean') {
                    newValSpan.textContent = v ? '✓' : '✗';
                } else {
                    const str = String(v);
                    newValSpan.textContent = str.length > 40 ? str.slice(0, 37) + '…' : str;
                }
            }

            // Valeur actuelle
            const currentValSpan = document.createElement('span');
            currentValSpan.className = 'import-merge-val current';
            if (item.type === 'special') {
                // Pas de valeur courante simple à afficher pour les données
                currentValSpan.textContent = currentLang === 'fr' ? '(fusion)' : '(merge)';
            } else {
                const cv = currentSettings[item.key];
                if (cv === undefined || cv === null || cv === '') {
                    currentValSpan.textContent = '—';
                } else if (Array.isArray(cv)) {
                    currentValSpan.textContent = `${cv.length} élément(s)`;
                } else if (typeof cv === 'boolean') {
                    currentValSpan.textContent = cv ? '✓' : '✗';
                } else {
                    const str = String(cv);
                    currentValSpan.textContent = str.length > 40 ? str.slice(0, 37) + '…' : str;
                }
            }

            row.appendChild(checkbox);
            row.appendChild(nameSpan);
            row.appendChild(newValSpan);
            row.appendChild(currentValSpan);
            listEl.appendChild(row);
        }
    }

    overlay.classList.add('show');

    // Stocker les données pour le bouton Appliquer
    overlay._importedData = importedData;
    overlay._msgEl = msgEl;
}

document.getElementById('import-merge-cancel').addEventListener('click', () => {
    document.getElementById('import-merge-overlay').classList.remove('show');
});

document.getElementById('import-merge-apply').addEventListener('click', async () => {
    const overlay      = document.getElementById('import-merge-overlay');
    const msgEl        = overlay._msgEl || document.getElementById('import-msg');
    const importedData = overlay._importedData || {};

    // Construire le payload selon les cases cochées
    const toApplySettings  = {};
    let   includeHistory   = false;
    let   includeFavorites = false;
    let   includePortrait  = false;

    document.querySelectorAll('#import-merge-list input[type="checkbox"]').forEach(cb => {
        if (!cb.checked) return;
        const key  = cb.dataset.importKey;
        const type = cb.dataset.importType;
        if (type === 'special') {
            if (key === '_history')       includeHistory   = true;
            if (key === '_favorites')     includeFavorites = true;
            if (key === '_portraitWindow') includePortrait  = true;
        } else {
            if (key && importedData.settings && importedData.settings[key] !== undefined) {
                toApplySettings[key] = importedData.settings[key];
            }
        }
    });

    overlay.classList.remove('show');

    const nothingSelected = Object.keys(toApplySettings).length === 0
        && !includeHistory && !includeFavorites && !includePortrait;
    if (nothingSelected) return;

    // Détecter en avance si appearance ou language vont changer (pour afficher la bannière)
    const currentAppearance = currentSettings.appearance || 'auto';
    const currentLanguage   = currentSettings.language   || 'fr';
    const willRestartAppearance = toApplySettings.appearance !== undefined
        && toApplySettings.appearance !== currentAppearance;
    const willRestartLanguage = toApplySettings.language !== undefined
        && toApplySettings.language !== currentLanguage;
    const willNeedRestart = willRestartAppearance || willRestartLanguage;

    // Construire le payload complet
    const payload = {
        settings:       toApplySettings,
        historyEntries: includeHistory   ? (importedData.history   || []) : undefined,
        favEntries:     includeFavorites ? (importedData.favorites  || []) : undefined,
        portraitWindow: includePortrait  ? importedData.portraitWindow     : undefined,
    };

    const result = await window.dualview.importConfigApply(payload);

    if (result && result.success) {
        // Recharger l'UI des settings pour refléter les nouvelles valeurs
        const store = await window.dualview.getStore();
        loadSettingsUI(store.settings);

        if (result.needsRestart || willNeedRestart) {
            // Afficher le message de succès + avertissement restart
            msgEl.textContent = t('importOkRestart');
            msgEl.className = 's-msg show ok';
            // Réutiliser le dialogue de redémarrage existant
            showRestartDialog('restartTitle', 'restartImportDesc',
                () => { /* onConfirm : l'app redémarre via relaunchApp dans le handler */ },
                () => {
                    // onCancel : ne pas redémarrer, conserver le message
                    msgEl.textContent = t('importOkRestartLater');
                    msgEl.className = 's-msg show ok';
                    setTimeout(() => msgEl.classList.remove('show'), 6000);
                }
            );
        } else {
            msgEl.textContent = t('importOk');
            msgEl.className = 's-msg show ok';
            setTimeout(() => msgEl.classList.remove('show'), 6000);
        }
    } else {
        msgEl.textContent = t('exportErr') + (result && result.error ? ' — ' + result.error : '');
        msgEl.className = 's-msg show err';
    }
});

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

    // Échap — Mode vidéo seule (v0.9.0) — priorité sur les autres actions Échap
    if (e.key === 'Escape' && !isInput && typeof videoFocusActive !== 'undefined' && videoFocusActive) {
        e.preventDefault();
        deactivateVideoFocus();
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

    // Ctrl+Shift+V — Toggle Mode vidéo seule (v0.9.0) — actif même si le
    // mode est déjà en cours, pour permettre de le quitter au clavier.
    if (e.key === 'V' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        toggleVideoFocus();
        return;
    }

    // v0.9.0 — Mode vidéo seule actif : bloquer les raccourcis de changement
    // d'onglet / navigation (barre d'onglets et barre d'adresse masquées,
    // ces actions n'ont donc pas de retour visuel cohérent dans ce mode).
    if (typeof videoFocusActive !== 'undefined' && videoFocusActive) {
        const blocked =
            (e.key === 'ArrowLeft'  && e.altKey) ||
            (e.key === 'ArrowRight' && e.altKey) ||
            (e.key === 'F5') || (e.key === 'r' && (e.ctrlKey || e.metaKey) && !e.shiftKey) ||
            (e.key === 't' && (e.ctrlKey || e.metaKey) && !e.shiftKey) ||
            (e.key === 'w' && (e.ctrlKey || e.metaKey) && !e.shiftKey) ||
            (e.key === 'T' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
            (e.key === 'Tab' && e.ctrlKey);
        if (blocked) { e.preventDefault(); return; }
    }

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
    // Ctrl+Shift+T — Rouvrir l'onglet fermé (v0.6.0)
    if (e.key === 'T' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        if (typeof reopenLastClosedTab === 'function') reopenLastClosedTab();
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
    // ── Raccourcis v0.7.1 ─────────────────────────────────────────────────────
    // Ctrl+F — Recherche dans la page (find-in-page)
    if (e.key === 'f' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (typeof openFindBar === 'function') openFindBar();
        return;
    }
    // Ctrl++ ou Ctrl+= — Zoom avant
    if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (typeof adjustZoom === 'function') adjustZoom(0.1);
        return;
    }
    // Ctrl+- — Zoom arrière
    if (e.key === '-' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (typeof adjustZoom === 'function') adjustZoom(-0.1);
        return;
    }
    // Ctrl+0 — Réinitialiser le zoom
    if (e.key === '0' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (typeof adjustZoom === 'function') adjustZoom(0);
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
        // ── v0.5.4 — Navigation ───────────────────────────────────────────────
        case 'nav-back':
            if (!backBtn.disabled) window.dualview.navBack();
            break;
        case 'nav-forward':
            if (!forwardBtn.disabled) window.dualview.navForward();
            break;
        // ── v0.5.4 — Code source ──────────────────────────────────────────────
        case 'view-source':
            if (wv) {
                wv.executeJavaScript('document.documentElement.outerHTML')
                    .then(html => {
                        // Construire un titre lisible : "Source — example.com"
                        let host = '';
                        try { host = new URL(wv.getURL ? wv.getURL() : '').hostname.replace('www.', ''); } catch { }
                        const title = (host ? 'Source \u2014 ' + host : 'Source');
                        // Encoder le HTML brut dans un data: URL pour l'ouvrir dans un onglet
                        const escaped = html
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                        const dataUrl = 'data:text/html;charset=utf-8,'
                            + encodeURIComponent(
                                '<!DOCTYPE html><html><head><meta charset="utf-8">'
                                + '<title>' + title + '</title>'
                                + '<style>body{margin:0;padding:1rem;font-family:monospace;'
                                + 'font-size:13px;white-space:pre-wrap;word-break:break-all;'
                                + 'background:#1e1e1e;color:#d4d4d4;line-height:1.6}</style>'
                                + '</head><body>' + escaped + '</body></html>'
                            );
                        addTabWithUrl(dataUrl, title);
                    })
                    .catch(() => { });
            }
            break;
        default:
            break;
    }
});
// ── Dialogue renommage de groupe (v0.6.0) ────────────────────────────────────
// Le main.js envoie 'group-rename-prompt' → on affiche l'overlay HTML custom
// (Electron n'a pas de dialog.showInputBox natif).
//
// Important : les éléments DOM sont récupérés à chaque appel (pas mis en cache
// à l'IIFE) car ce script s'exécute AVANT que le markup de l'overlay (placé en
// fin de <body>, après les <script>) ne soit parsé. Un cache pris trop tôt
// vaudrait `null` et désactiverait silencieusement tout le dialogue.

(function setupGroupRenameDialog() {
    let _pendingGroupId = null;
    let _listenersBound = false;

    function els() {
        return {
            overlay:   document.getElementById('group-rename-overlay'),
            input:     document.getElementById('group-rename-input'),
            okBtn:     document.getElementById('group-rename-ok'),
            cancelBtn: document.getElementById('group-rename-cancel'),
        };
    }

    function bindListenersOnce() {
        if (_listenersBound) return;
        const { overlay, input, okBtn, cancelBtn } = els();
        if (!overlay || !input || !okBtn || !cancelBtn) return; // DOM pas encore prêt, retentera au prochain appel
        _listenersBound = true;

        okBtn.addEventListener('click', confirmRename);
        cancelBtn.addEventListener('click', closeDialog);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); confirmRename(); }
            if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
        });
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeDialog();
        });
    }

    function openDialog(groupId, currentName) {
        bindListenersOnce();
        const { overlay, input } = els();
        if (!overlay || !input) return; // garde défensive : DOM toujours indisponible
        _pendingGroupId = groupId;
        input.value     = currentName || '';
        input.maxLength = 60;
        overlay.classList.remove('hidden');
        setTimeout(() => { input.focus(); input.select(); }, 50);
    }

    function closeDialog() {
        const { overlay } = els();
        if (overlay) overlay.classList.add('hidden');
        _pendingGroupId = null;
    }

    function confirmRename() {
        const { input } = els();
        const name = input ? input.value.trim().slice(0, 60) : '';
        if (name && _pendingGroupId && typeof groupRename === 'function') {
            groupRename(_pendingGroupId, name);
            if (typeof renderTabs === 'function') renderTabs();
            if (typeof saveTabs  === 'function') saveTabs();
        }
        closeDialog();
    }

    // Écouter le canal IPC entrant depuis main.js — toujours enregistré,
    // indépendamment de la présence du DOM à cet instant.
    window.dualview.on('group-rename-prompt', ({ groupId, currentName }) => {
        openDialog(groupId, currentName);
    });
})();
// ── Téléchargements — Paramètres (v0.7.1) ────────────────────────────────────
// Case à cocher + dossier de destination dans Paramètres → Général.
// Le panneau #downloads-panel (accessible depuis le menu ⚙️) affiche la liste.

(function setupDownloadSettings() {
    const allowDlChk = document.getElementById('s-allow-downloads');
    if (allowDlChk) {
        allowDlChk.addEventListener('change', () => {
            currentSettings.allowDownloads = allowDlChk.checked;
            saveCurrentSettings();
        });
    }

    // "Toujours demander" — grise la section dossier quand coché (v0.7.1 update)
    const askPathChk = document.getElementById('s-download-ask-path');
    const dirSection = document.getElementById('s-download-dir-section');
    if (askPathChk) {
        askPathChk.addEventListener('change', () => {
            currentSettings.downloadAskPath = askPathChk.checked;
            saveCurrentSettings();
            if (dirSection) dirSection.classList.toggle('grayed', askPathChk.checked);
        });
    }

    const downloadDirBrowseBtn = document.getElementById('s-download-dir-browse');
    if (downloadDirBrowseBtn) {
        downloadDirBrowseBtn.addEventListener('click', async () => {
            const dir = await window.dualview.chooseDownloadDir();
            if (dir) {
                currentSettings.downloadDir = dir;
                const el = document.getElementById('s-download-dir');
                if (el) el.textContent = dir;
            }
        });
    }
})();

// ── Panneau Téléchargements (v0.7.1) ─────────────────────────────────────────
// Accessible depuis le menu ⚙️ (bouton "Téléchargements").
// Affiche la liste en mémoire des téléchargements de la session courante.

(function setupDownloadsPanel() {
    const panel     = document.getElementById('downloads-panel');
    const closeBtn  = document.getElementById('downloads-panel-close');
    const clearBtn  = document.getElementById('downloads-clear-all-btn');
    const listEl    = document.getElementById('downloads-list');
    const emptyEl   = document.getElementById('downloads-empty');

    if (!panel) return; // garde — DOM indisponible

    // ── Ouverture / fermeture ─────────────────────────────────────────────────
    function openDownloadsPanel() {
        panel.classList.add('open');
        renderDownloadsList();
    }
    function closeDownloadsPanel() { panel.classList.remove('open'); }

    closeBtn && closeBtn.addEventListener('click', closeDownloadsPanel);

    // Bouton ⚙️ → Téléchargements
    const menuDownloads = document.getElementById('menu-downloads');
    if (menuDownloads) {
        menuDownloads.addEventListener('click', () => {
            document.getElementById('gear-menu').classList.remove('open');
            openDownloadsPanel();
        });
    }

    // Fermer sur clic hors du panneau (même logique que history-panel)
    document.addEventListener('click', (e) => {
        if (panel.classList.contains('open') && !panel.contains(e.target)) {
            const menuBtn = document.getElementById('menu-downloads');
            if (menuBtn && menuBtn.contains(e.target)) return;
            closeDownloadsPanel();
        }
    });

    // Effacer tout
    clearBtn && clearBtn.addEventListener('click', async () => {
        await window.dualview.clearDownloads();
        _localDownloads = [];
        renderDownloadsList();
    });

    // ── Liste locale (miroir de _downloads main.js) ───────────────────────────
    // Chargée depuis main.js au premier chargement + mise à jour via IPC events.
    let _localDownloads = [];

    async function loadDownloads() {
        try { _localDownloads = await window.dualview.getDownloads(); } catch { _localDownloads = []; }
    }

    // Écoute des événements IPC téléchargements (v0.7.1)
    window.dualview.on('download-started', (item) => {
        _localDownloads.unshift(item);
        if (panel.classList.contains('open')) renderDownloadsList();
        showToast('⬇️ ' + item.filename, 3000);
    });
    window.dualview.on('download-updated', (item) => {
        const idx = _localDownloads.findIndex(d => d.id === item.id);
        if (idx !== -1) _localDownloads[idx] = item;
        if (panel.classList.contains('open')) renderDownloadItem(item);
    });
    window.dualview.on('download-done', (item) => {
        const idx = _localDownloads.findIndex(d => d.id === item.id);
        if (idx !== -1) _localDownloads[idx] = item;
        if (panel.classList.contains('open')) renderDownloadItem(item);
        const msg = item.state === 'completed'
            ? t('downloadNotification') + ' ' + item.filename
            : t('downloadNotificationFail') + ' ' + item.filename;
        showToast(msg, 4000);
    });

    // ── Rendu de la liste ─────────────────────────────────────────────────────
    function renderDownloadsList() {
        if (!listEl) return;
        listEl.innerHTML = '';
        if (!_localDownloads.length) {
            emptyEl && emptyEl.classList.remove('hidden');
            return;
        }
        emptyEl && emptyEl.classList.add('hidden');
        _localDownloads.forEach(item => {
            const row = buildDownloadRow(item);
            listEl.appendChild(row);
        });
    }

    // Mise à jour d'un item déjà rendu (progression)
    function renderDownloadItem(item) {
        const existing = listEl && listEl.querySelector(`[data-dl-id="${item.id}"]`);
        if (existing) {
            const newRow = buildDownloadRow(item);
            existing.replaceWith(newRow);
        }
    }

    function buildDownloadRow(item) {
        const row = document.createElement('div');
        row.className = 'dl-row';
        row.dataset.dlId = item.id;

        // Icône selon l'état
        const stateIcon = { completed: '✅', interrupted: '❌', cancelled: '🚫', 'in-progress': '⬇️', progressing: '⬇️' };
        const icon = stateIcon[item.state] || '📄';

        // Libellé d'état
        const stateLabels = {
            completed:   t('downloadCompleted'),
            interrupted: t('downloadInterrupted'),
            cancelled:   t('downloadCancelled'),
        };
        const stateLabel = stateLabels[item.state] || t('downloadInProgress');

        // Progression (seulement en cours)
        let progressHtml = '';
        if ((item.state === 'in-progress' || item.state === 'progressing') && item.totalBytes > 0) {
            const pct = Math.round((item.receivedBytes / item.totalBytes) * 100);
            progressHtml = `<div class="dl-progress-track"><div class="dl-progress-fill" style="width:${pct}%"></div></div>`;
        }

        // Taille
        const sizeStr = item.totalBytes > 0
            ? _formatBytes(item.receivedBytes) + ' / ' + _formatBytes(item.totalBytes)
            : item.receivedBytes > 0 ? _formatBytes(item.receivedBytes) : '';

        row.innerHTML = `
            <div class="dl-icon">${icon}</div>
            <div class="dl-info">
                <div class="dl-name" title="${_esc(item.filename)}">${_esc(item.filename)}</div>
                <div class="dl-meta">${stateLabel}${sizeStr ? ' — ' + sizeStr : ''}</div>
                ${progressHtml}
            </div>
            <div class="dl-actions">
                ${item.state === 'completed'
                    ? `<button class="dl-btn" data-action="open-file" title="${t('downloadOpenFile')}">📂</button>
                       <button class="dl-btn" data-action="open-folder" title="${t('downloadOpenFolder')}">📁</button>`
                    : ''}
            </div>`;

        // Actions
        row.querySelectorAll('.dl-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.dataset.action === 'open-file')   window.dualview.openDownloadFile(item.path);
                if (btn.dataset.action === 'open-folder') window.dualview.openDownloadFolder(item.path);
            });
        });

        return row;
    }

    function _formatBytes(bytes) {
        if (!bytes || bytes < 0) return '0 o';
        if (bytes < 1024)        return bytes + ' o';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
        return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
    }
    function _esc(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Charger la liste au premier accès
    loadDownloads();
})();

// ── Téléchargements — suppression individuelle (v0.7.1 update) ───────────────
// Patch de buildDownloadRow pour ajouter le bouton 🗑️ par entrée.
// Ce code s'exécute après setupDownloadsPanel qui définit la version précédente ;
// on expose une version étendue via une closure qui accède à _localDownloads.
(function patchDownloadRowDelete() {
    // On attend que setupDownloadsPanel ait initialisé le panneau
    const patchInterval = setInterval(() => {
        const panel = document.getElementById('downloads-panel');
        if (!panel) return; // pas encore prêt

        clearInterval(patchInterval);

        // Écouter les clics sur le bouton 🗑️ via délégation sur #downloads-list
        const listEl = document.getElementById('downloads-list');
        if (!listEl) return;

        listEl.addEventListener('click', async (e) => {
            const removeBtn = e.target.closest('.dl-remove-btn');
            if (!removeBtn) return;
            e.stopPropagation();
            const id = removeBtn.dataset.dlId;
            if (!id) return;
            await window.dualview.removeDownload(id);
            // Retirer la ligne du DOM
            const row = listEl.querySelector(`.dl-row[data-dl-id="${id}"]`);
            if (row) row.remove();
            // Vérifier si liste vide
            const emptyEl = document.getElementById('downloads-empty');
            if (!listEl.querySelector('.dl-row') && emptyEl) {
                emptyEl.classList.remove('hidden');
            }
        });

        // Injecter le bouton 🗑️ dans chaque nouvelle ligne via MutationObserver
        // (les lignes sont créées dynamiquement par buildDownloadRow dans setupDownloadsPanel)
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    // Si c'est une dl-row sans bouton 🗑️, en ajouter un
                    const rows = node.classList && node.classList.contains('dl-row')
                        ? [node]
                        : Array.from(node.querySelectorAll ? node.querySelectorAll('.dl-row') : []);
                    rows.forEach(row => {
                        if (row.querySelector('.dl-remove-btn')) return; // déjà présent
                        const id = row.dataset.dlId;
                        if (!id) return;
                        const actionsEl = row.querySelector('.dl-actions');
                        if (!actionsEl) return;
                        const removeBtn = document.createElement('button');
                        removeBtn.className = 'dl-remove-btn';
                        removeBtn.dataset.dlId = id;
                        removeBtn.title = t('downloadRemove') || 'Supprimer de la liste';
                        removeBtn.textContent = '🗑';
                        actionsEl.appendChild(removeBtn);
                    });
                });
            });
        });
        observer.observe(listEl, { childList: true, subtree: true });

        // Aussi patcher les lignes déjà présentes au moment du patch
        listEl.querySelectorAll('.dl-row').forEach(row => {
            if (row.querySelector('.dl-remove-btn')) return;
            const id = row.dataset.dlId;
            if (!id) return;
            const actionsEl = row.querySelector('.dl-actions');
            if (!actionsEl) return;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'dl-remove-btn';
            removeBtn.dataset.dlId = id;
            removeBtn.title = t('downloadRemove') || 'Supprimer de la liste';
            removeBtn.textContent = '🗑';
            actionsEl.appendChild(removeBtn);
        });

    }, 100);
})();

// ── Historique — actions de suppression sur résultats de recherche (v0.7.1 update) ─
// Quand une recherche est active, affiche :
//   - "🗑 Supprimer les N résultats trouvés"
//   - "🗑 Supprimer tout lié à domain.com" (si la requête ressemble à un domaine)

(function setupHistorySearchActions() {
    const actionsBar     = document.getElementById('history-search-actions');
    const deleteResBtn   = document.getElementById('history-delete-results-btn');
    const deleteDomBtn   = document.getElementById('history-delete-domain-btn');
    const searchInput    = document.getElementById('history-search-input');
    if (!actionsBar || !deleteResBtn || !deleteDomBtn || !searchInput) return;

    // Détecte si une chaîne ressemble à un nom de domaine et retourne le hostname,
    // sinon retourne null.
    function _extractDomain(q) {
        if (!q) return null;
        let s = q.trim();
        // Enlever le protocole
        s = s.replace(/^https?:\/\//i, '');
        // Prendre seulement la partie hôte (avant '/', '?', '#')
        s = s.split(/[/?#]/)[0];
        // Enlever le port éventuel
        s = s.split(':')[0];
        // Valider : au moins un point, que des caractères valides, pas d'espaces
        if (/^[a-zA-Z0-9][a-zA-Z0-9\-]*(\.[a-zA-Z0-9\-]+)+$/.test(s)) {
            return s.toLowerCase();
        }
        return null;
    }

    // Résultats courants + requête courante (mis à jour par updateHistorySearchActions)
    let _currentResults = [];
    let _currentQuery   = '';
    let _currentDomain  = null;

    function updateHistorySearchActions(query, results) {
        _currentQuery   = query || '';
        _currentResults = results || [];
        _currentDomain  = _extractDomain(_currentQuery);

        if (!_currentQuery || _currentResults.length === 0) {
            actionsBar.classList.add('hidden');
            return;
        }

        actionsBar.classList.remove('hidden');

        // Bouton "Supprimer les N résultats"
        const n = _currentResults.length;
        deleteResBtn.textContent = (t('histDeleteResults') || '🗑 Supprimer les {n} résultat(s)')
            .replace('{n}', n);
        deleteResBtn.classList.remove('hidden');

        // Bouton "Supprimer tout lié à domain.com" — uniquement si domaine détecté
        if (_currentDomain) {
            deleteDomBtn.textContent = (t('histDeleteDomain') || '🗑 Supprimer tout lié à {domain}')
                .replace('{domain}', _currentDomain);
            deleteDomBtn.classList.remove('hidden');
        } else {
            deleteDomBtn.classList.add('hidden');
        }
    }

    // Suppression des résultats de recherche courants
    deleteResBtn.addEventListener('click', async () => {
        if (!_currentResults.length) return;
        const n = _currentResults.length;
        const msg = (t('histDeleteResultsConfirm') || 'Supprimer {n} entrée(s) ?').replace('{n}', n);
        if (!confirm(msg)) return;

        // Collecter les URLs uniques à supprimer
        const urlsToDelete = [...new Set(_currentResults.map(e => e.url))];
        urlsToDelete.forEach(url => window.dualview.historyDeleteUrl(url));

        // Vider le panneau et relancer la recherche (résultats maintenant vides)
        const toast = (t('histDeletedCount') || '{n} entrée(s) supprimée(s)').replace('{n}', n);
        showToast(toast);
        searchInput.value = '';
        actionsBar.classList.add('hidden');
        const allEntries = await window.dualview.historyGetAll();
        renderHistoryList(allEntries);
    });

    // Suppression de tout l'historique du domaine
    deleteDomBtn.addEventListener('click', async () => {
        if (!_currentDomain) return;
        const msg = (t('histDeleteDomainConfirm') || 'Supprimer tout l\'historique de {domain} ?')
            .replace('{domain}', _currentDomain);
        if (!confirm(msg)) return;

        const removed = await window.dualview.historyDeleteDomain(_currentDomain);
        const toast = (t('histDeletedCount') || '{n} entrée(s) supprimée(s)').replace('{n}', removed || 0);
        showToast(toast);
        searchInput.value = '';
        actionsBar.classList.add('hidden');
        const allEntries = await window.dualview.historyGetAll();
        renderHistoryList(allEntries);
    });

    // Intercepter l'event 'input' du champ de recherche pour alimenter updateHistorySearchActions.
    // On utilise un MutationObserver pour ne pas écraser le listener existant —
    // on s'appuie sur le fait que renderHistoryList est toujours appelé après la recherche.
    // Solution propre : monkey-patch renderHistoryList pour qu'il appelle aussi update.
    const _origRenderHistoryList = window._renderHistoryListHook || null;

    // Exposer une référence globale patchable
    const _originalRender = typeof renderHistoryList === 'function' ? renderHistoryList : null;
    if (_originalRender) {
        // Override : appeler l'original puis mettre à jour la barre d'actions
        window._dv_renderHistoryList = function(entries) {
            _originalRender(entries);
            updateHistorySearchActions(searchInput.value.trim(), entries);
        };
    }

    // Patch de l'événement input pour appeler aussi updateHistorySearchActions
    searchInput.addEventListener('input', () => {
        // La recherche est déclenchée asynchrone dans le listener existant.
        // On intercepte le résultat via un override de renderHistoryList.
        // Si la valeur est vide, cacher la barre immédiatement.
        if (!searchInput.value.trim()) {
            actionsBar.classList.add('hidden');
        }
    });

    // Alternative plus robuste : re-patcher histSearchInput handler via délégation
    // En écoutant les mutations sur #history-list (renderHistoryList vide et remplie la liste)
    const histListEl = document.getElementById('history-list');
    if (histListEl) {
        let _mutationPending = false;
        new MutationObserver(() => {
            if (_mutationPending) return;
            _mutationPending = true;
            requestAnimationFrame(() => {
                _mutationPending = false;
                const q = searchInput.value.trim();
                if (!q) { actionsBar.classList.add('hidden'); return; }
                // Compter les items visibles
                const items = histListEl.querySelectorAll('.hist-item');
                if (items.length === 0) { actionsBar.classList.add('hidden'); return; }
                // Reconstruire la liste des résultats depuis le DOM
                const domResults = Array.from(items).map(el => ({
                    url: el.querySelector('.hist-url') ? el.querySelector('.hist-url').textContent : '',
                }));
                updateHistorySearchActions(q, domResults);
            });
        }).observe(histListEl, { childList: true, subtree: false });
    }
})();