/**
 * DualView - Landscape Settings Panel
 * Version: 0.4.2
 *
 * Panneau paramètres complet :
 *   loadSettingsUI, saveCurrentSettings, activateSettingsSection,
 *   Général / Apparence / Langue / Confidentialité / OBS / Moteurs / Screenshots
 */

'use strict';

const DEFAULT_SEARCH_ENGINES = [
    { id: 'duckduckgo', name: 'DuckDuckGo',   url: 'https://duckduckgo.com/?q=' },
    { id: 'google',     name: 'Google',         url: 'https://www.google.com/search?q=' },
    { id: 'bing',       name: 'Bing',           url: 'https://www.bing.com/search?q=' },
    { id: 'brave',      name: 'Brave Search',   url: 'https://search.brave.com/search?q=' },
    { id: 'qwant',      name: 'Qwant',          url: 'https://www.qwant.com/?q=' },
];

function getSearchEngines() {
    return [...DEFAULT_SEARCH_ENGINES, ...(currentSettings.customSearchEngines || [])];
}

function saveCurrentSettings() { window.dualview.saveSettings(currentSettings); }

function toggleCustomUrl(show) {
    document.getElementById('s-custom-url').classList.toggle('show', show);
}

function loadSettingsUI(s) {
    currentSettings = s;
    setLang(s.language || 'fr');
    document.getElementById('s-restore').checked      = s.restoreTabs !== false;
    document.getElementById('s-homepage').value        = s.homepageMode || 'knack3';
    document.getElementById('s-newtab').value          = s.newTabMode   || 'homepage';
    document.getElementById('s-appearance').value      = s.appearance   || 'auto';
    document.getElementById('s-language').value        = s.language     || 'fr';
    document.getElementById('s-obs-enabled').checked  = s.obsEnabled !== false;
    document.getElementById('s-obs-port').value        = s.obsPort != null ? s.obsPort : 0;
    if (s.customHomepageUrl) document.getElementById('s-custom-url-input').value = s.customHomepageUrl;
    toggleCustomUrl(s.homepageMode === 'custom');
    renderSearchEngineList();
    const dirEl = document.getElementById('s-screenshot-dir');
    if (dirEl) dirEl.textContent = s.screenshotDir || '(Dossier Images par défaut)';
    applyTranslations();
}

function activateSettingsSection(section) {
    document.querySelectorAll('.s-nav').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.s-section').forEach(s => s.classList.remove('active'));
    const nav = document.querySelector(`.s-nav[data-section="${section}"]`);
    if (nav) nav.classList.add('active');
    const sec = document.getElementById(`section-${section}`);
    if (sec) sec.classList.add('active');
    if (section === 'services') loadServicesStatus();
    if (section === 'obs')      loadObsInfo();
}

// ── Navigation sidebar ────────────────────────────────────────────────────────
document.querySelectorAll('.s-nav').forEach(nav => {
    nav.addEventListener('click', () => {
        document.querySelectorAll('.s-nav').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.s-section').forEach(s => s.classList.remove('active'));
        nav.classList.add('active');
        const sec = document.getElementById('section-' + nav.dataset.section);
        if (sec) sec.classList.add('active');
        if (nav.dataset.section === 'services') loadServicesStatus();
        if (nav.dataset.section === 'obs')      loadObsInfo();
    });
});

// ── Général ───────────────────────────────────────────────────────────────────
document.getElementById('s-restore').addEventListener('change', e => {
    currentSettings.restoreTabs = e.target.checked;
    saveCurrentSettings();
});
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
    let isValid = false;
    try { const p = new URL(url); isValid = ['http:', 'https:'].includes(p.protocol); } catch { }
    if (isValid) {
        currentSettings.customHomepageUrl = url;
        document.getElementById('s-custom-url-input').value = url;
        msg.textContent = t('urlValid'); msg.className = 's-msg show ok';
        saveCurrentSettings();
        setTimeout(() => msg.classList.remove('show'), 3000);
    } else {
        msg.textContent = t('urlInvalid'); msg.className = 's-msg show err';
    }
});
document.getElementById('s-newtab').addEventListener('change', e => {
    currentSettings.newTabMode = e.target.value;
    saveCurrentSettings();
});

// ── Apparence / Langue ────────────────────────────────────────────────────────
let restartPendingSave = null, restartRevertFn = null;

function showRestartDialog(titleKey, descKey, onConfirm, onCancel) {
    document.getElementById('restart-title').textContent = t(titleKey);
    document.getElementById('restart-desc').textContent  = t(descKey);
    restartPendingSave = onConfirm;
    restartRevertFn    = onCancel;
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
    currentSettings.appearance = newVal;
    saveCurrentSettings();
    showRestartDialog('restartTitle', 'restartAppearanceDesc',
        () => { },
        () => { currentSettings.appearance = prevVal; document.getElementById('s-appearance').value = prevVal; saveCurrentSettings(); }
    );
});

document.getElementById('s-language').addEventListener('change', e => {
    const newVal = e.target.value, prevVal = currentSettings.language || 'fr';
    currentSettings.language = newVal;
    saveCurrentSettings();
    showRestartDialog('restartTitle', 'restartLanguageDesc',
        () => { },
        () => { currentSettings.language = prevVal; document.getElementById('s-language').value = prevVal; saveCurrentSettings(); }
    );
});

// ── Moteurs de recherche ──────────────────────────────────────────────────────
function renderSearchEngineList() {
    const list = document.getElementById('s-engine-list');
    if (!list) return;
    list.innerHTML = '';
    const engines  = getSearchEngines();
    const activeId = currentSettings.searchEngineId || 'duckduckgo';
    engines.forEach(engine => {
        const item = document.createElement('div');
        item.className = 'search-engine-item' + (engine.id === activeId ? ' active' : '');
        const radio   = document.createElement('div');
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
            currentSettings.searchEngineId  = engine.id;
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
    const urlEl  = document.getElementById('s-engine-url');
    const msg    = document.getElementById('s-engine-msg');
    const name   = nameEl.value.trim(), url = urlEl.value.trim();
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

// ── Screenshots ───────────────────────────────────────────────────────────────
document.getElementById('s-screenshot-browse').addEventListener('click', async () => {
    const dir = await window.dualview.chooseScreenshotDir();
    if (dir) {
        currentSettings.screenshotDir = dir;
        document.getElementById('s-screenshot-dir').textContent = dir;
    }
});

// ── OBS ───────────────────────────────────────────────────────────────────────
async function loadObsInfo() {
    let info = null;
    try { info = await window.dualview.getObsInfo(); } catch { }
    const statusEl   = document.getElementById('s-obs-status');
    const dockEl     = document.getElementById('s-obs-dock-url');
    const portValEl  = document.getElementById('s-obs-port-value');
    const tokenEl    = document.getElementById('s-obs-token');
    if (!info || !info.enabled) {
        statusEl.textContent = t('obsStatusDisabled');
        dockEl.value = ''; portValEl.value = ''; tokenEl.value = '';
        return;
    }
    if (info.running) {
        statusEl.textContent = t('obsStatusRunning') + ' 127.0.0.1:' + info.port;
        dockEl.value    = info.dockUrl || '';
        portValEl.value = String(info.port);
        tokenEl.value   = info.token  || '';
    } else {
        statusEl.textContent = t('obsStatusStopped');
        dockEl.value = ''; portValEl.value = ''; tokenEl.value = '';
    }
}

function copyToClipboardBtn(inputId, btn) {
    const text = document.getElementById(inputId).value;
    copyToClipboard(text, btn);
}

document.getElementById('s-obs-enabled').addEventListener('change', e => {
    currentSettings.obsEnabled = e.target.checked;
    saveCurrentSettings();
    setTimeout(loadObsInfo, 400);
});
document.getElementById('s-obs-port-apply').addEventListener('click', () => {
    const raw = parseInt(document.getElementById('s-obs-port').value, 10);
    const msg  = document.getElementById('s-obs-port-msg');
    const port = Number.isInteger(raw) ? raw : 0;
    if (port < 0 || port > 65535) { msg.textContent = t('obsPortInvalid'); msg.className = 's-msg show err'; return; }
    currentSettings.obsPort = port;
    saveCurrentSettings();
    msg.textContent = t('obsPortApplied'); msg.className = 's-msg show ok';
    setTimeout(() => msg.classList.remove('show'), 3000);
    setTimeout(loadObsInfo, 400);
});
document.getElementById('s-obs-dock-copy').addEventListener('click',  e => copyToClipboardBtn('s-obs-dock-url',   e.target));
document.getElementById('s-obs-port-copy').addEventListener('click',  e => copyToClipboardBtn('s-obs-port-value', e.target));
document.getElementById('s-obs-token-copy').addEventListener('click', e => copyToClipboardBtn('s-obs-token',      e.target));
