/**
 * DualView - Landscape Navigation
 * Version: 0.4.2
 *
 * Barre d'adresse, résolution d'input, omnibar et navigation :
 *   navigate, resolveInput, buildSearchUrl,
 *   renderOmnibar, closeOmnibar, omniSelectIdx,
 *   updateNavButtons, sendNavState
 */

'use strict';

// ── TLDs reconnus ─────────────────────────────────────────────────────────────

const KNOWN_TLDS = new Set([
    'com','net','org','fr','io','co','uk','de','app','dev','ai','eu',
    'info','biz','me','tv','us','ca','au','jp','it','es','nl','be','ch',
    'at','pl','ru','br','in','cn','kr','se','no','fi','dk','nz','sg',
    'gov','edu','mil','int','museum',
]);

// ── Résolution d'input ────────────────────────────────────────────────────────

function resolveInput(raw) {
    const text = raw.trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text) || /^file:\/\//i.test(text)) return text;
    if (/^localhost(:\d+)?(\/.*)?$/.test(text) || /^\d{1,3}(\.\d{1,3}){3}/.test(text)) return 'http://' + text;
    if (/\s/.test(text)) return buildSearchUrl(text);
    const parts = text.split('.');
    if (parts.length >= 2) {
        const tld = parts[parts.length - 1].toLowerCase().split('/')[0].split('?')[0];
        if (KNOWN_TLDS.has(tld)) return 'https://' + text;
    }
    return buildSearchUrl(text);
}

function buildSearchUrl(query) {
    const engineUrl = currentSettings.searchEngineUrl || 'https://duckduckgo.com/?q=';
    return engineUrl + encodeURIComponent(query);
}

function getEngineName() {
    return currentSettings.searchEngineName || 'DuckDuckGo';
}

// ── Navigation principale ─────────────────────────────────────────────────────

function navigate(rawInput) {
    if (!rawInput || activeTabId === SETTINGS_TAB_ID) return;
    closeOmnibar();
    const url = resolveInput(rawInput);
    if (!url) return;
    document.getElementById('url-input').value = url;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && !isSettingsTab(tab)) {
        tab.url = url;
        try {
            const host = new URL(url).hostname.replace('www.', '');
            tab.title = host.length > 18 ? host.slice(0, 18) + '…' : host;
        } catch { tab.title = url.slice(0, 20); }
        renderTabs();
        saveTabs();
    }
    updateNavButtons({ canGoBack: false, canGoForward: false });
    const wv = getActiveWebview();
    if (wv) {
        if (wv.getURL !== undefined) {
            try { wv.src = url; }
            catch (e) { wv.addEventListener('dom-ready', () => { wv.src = url; }, { once: true }); }
        } else {
            wv.addEventListener('dom-ready', () => { wv.src = url; }, { once: true });
        }
    }
    window.dualview.navigate(url);
}

// ── Boutons nav ───────────────────────────────────────────────────────────────

const backBtn    = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');

function updateNavButtons(state) {
    backBtn.disabled    = !state.canGoBack;
    forwardBtn.disabled = !state.canGoForward;
}

window.dualview.on('nav-state-changed', updateNavButtons);

backBtn.addEventListener('click', () => {
    if (!backBtn.disabled) window.dualview.navBack();
});
forwardBtn.addEventListener('click', () => {
    if (!forwardBtn.disabled) window.dualview.navForward();
});
window.dualview.on('webview-go-back', () => {
    const wv = getActiveWebview();
    if (wv && wv.canGoBack && wv.canGoBack()) wv.goBack();
});
window.dualview.on('webview-go-forward', () => {
    const wv = getActiveWebview();
    if (wv && wv.canGoForward && wv.canGoForward()) wv.goForward();
});

document.getElementById('reload-btn').addEventListener('click', () => {
    if (activeTabId === SETTINGS_TAB_ID) return;
    const wv = getActiveWebview();
    if (wv && wv.getURL && wv.getURL() !== 'about:blank') wv.reload();
    window.dualview.reloadViews();
});

document.getElementById('home-btn').addEventListener('click', async () => {
    if (activeTabId === SETTINGS_TAB_ID) return;
    const url = await window.dualview.getHomepageUrl();
    if (url) { document.getElementById('url-input').value = url; navigate(url); }
});

document.getElementById('go-btn').addEventListener('click', () => navigate(urlInput.value));

// ── Omnibar ───────────────────────────────────────────────────────────────────

const urlInput     = document.getElementById('url-input');
const omniDropdown = document.getElementById('omnibar-dropdown');
let omniItems       = [];
let omniSelectedIdx = -1;

function buildOmniItems(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const items = [];
    const seen  = new Set();
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
    if (!/\s/.test(q) && q.length > 2 && !q.includes('/')) {
        const suggestion = q.endsWith('.com') ? q : q + '.com';
        if (!seen.has('https://' + suggestion))
            items.push({ type: 'domain', url: 'https://' + suggestion, label: suggestion, sub: '' });
    }
    items.push({ type: 'search', url: buildSearchUrl(query), label: query, sub: getEngineName() });
    return items;
}

function renderOmnibar(query) {
    omniItems      = buildOmniItems(query);
    omniSelectedIdx = -1;
    if (!omniItems.length) { closeOmnibar(); return; }
    omniDropdown.innerHTML = '';
    const hasHistory = omniItems.some(i => i.type === 'history');
    const hasDomain  = omniItems.some(i => i.type === 'domain');
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
    omniItems       = [];
    omniSelectedIdx = -1;
}

function omniSelectIdx(idx) {
    omniDropdown.querySelectorAll('.omni-item,.omni-search-row').forEach((el, i) => {
        el.classList.toggle('selected', i === idx);
    });
    omniSelectedIdx = idx;
}

// Events barre URL
urlInput.addEventListener('focus', () => {
    if (activeTabId !== SETTINGS_TAB_ID) urlInput.select();
});
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
urlInput.addEventListener('blur', () => { setTimeout(closeOmnibar, 150); });

// Listeners entrants
window.dualview.on('update-addressbar', url => {
    if (activeTabId === SETTINGS_TAB_ID) return;
    document.getElementById('url-input').value = url;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && !isSettingsTab(tab)) {
        tab.url = url;
        try { const host = new URL(url).hostname.replace('www.', ''); tab.title = host.length > 18 ? host.slice(0, 18) + '…' : host; } catch { tab.title = url.slice(0, 20); }
        renderTabs();
        saveTabs();
    }
});
window.dualview.on('load-url', url => {
    if (activeTabId === SETTINGS_TAB_ID) return;
    const wv = getActiveWebview();
    if (!wv || !url || url === 'about:blank') return;
    try { wv.src = url; }
    catch (e) { wv.addEventListener('dom-ready', () => { wv.src = url; }, { once: true }); }
    document.getElementById('empty-state').style.display = 'none';
    wv.classList.add('active');
});
