/**
 * DualView - Landscape Tabs Manager
 * Version: 0.4.2
 *
 * Gestion des onglets :
 *   renderTabs, switchTab, addTab, addTabWithUrl,
 *   closeTab, saveTabs, openSettingsTab, getNewTabUrl,
 *   addToHistory (mémoire omnibar)
 */

'use strict';

function isSettingsTab(tab) { return tab && tab.id === SETTINGS_TAB_ID; }

function renderTabs() {
    const bar    = document.getElementById('tab-bar');
    const addBtn = document.getElementById('add-tab-btn');
    bar.querySelectorAll('.tab').forEach(el => el.remove());
    tabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = 'tab'
            + (tab.id === activeTabId ? ' active' : '')
            + (isSettingsTab(tab) ? ' settings-tab' : '');
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

    const settingsPanel = document.getElementById('settings-panel');
    const webviewCont   = document.getElementById('webview-container');
    const urlInput      = document.getElementById('url-input');
    const goBtn         = document.getElementById('go-btn');

    if (isSettingsTab(tab)) {
        webviewPool.forEach(wv => wv.classList.remove('active'));
        document.getElementById('empty-state').style.display = 'none';
        webviewCont.style.display = 'none';
        settingsPanel.classList.add('show');
        urlInput.value = 'dualview://paramètres';
        urlInput.classList.add('settings-url');
        goBtn.disabled = true;
        updateNavButtons({ canGoBack: false, canGoForward: false });
        window.dualview.switchTab(SETTINGS_TAB_ID);
    } else {
        webviewCont.style.display = 'flex';
        settingsPanel.classList.remove('show');
        urlInput.classList.remove('settings-url');
        goBtn.disabled = false;
        urlInput.value = tab.url || '';
        const isNewWebview = !webviewPool.has(id);
        if (isNewWebview) createWebview(id, tab.url || '');
        showWebview(id);
        const wv = getActiveWebview();
        if (!isNewWebview && wv && wv.canGoBack) {
            updateNavButtons({ canGoBack: wv.canGoBack(), canGoForward: wv.canGoForward ? wv.canGoForward() : false });
        } else {
            updateNavButtons({ canGoBack: false, canGoForward: false });
        }
        window.dualview.switchTab(id);
    }
    renderTabs();
    saveTabs();
    resetVideoCounters();
}

function openSettingsTab(section) {
    const existing = tabs.find(t => t.id === SETTINGS_TAB_ID);
    if (existing) {
        switchTab(SETTINGS_TAB_ID);
    } else {
        tabs.push({ id: SETTINGS_TAB_ID, title: 'Paramètres', url: 'dualview://settings' });
        switchTab(SETTINGS_TAB_ID);
    }
    if (section) setTimeout(() => activateSettingsSection(section), 50);
}

function addTab() {
    const id  = 'tab-' + Date.now();
    const url = getNewTabUrl();
    tabs.push({ id, title: url ? '' : t('newTab'), url });
    createWebview(id, url);
    switchTab(id);
}

function addTabWithUrl(url) {
    const id = 'tab-' + Date.now();
    let title = '';
    try { title = new URL(url).hostname.replace('www.', ''); } catch { title = url.slice(0, 20); }
    tabs.push({ id, title, url });
    createWebview(id, url);
    switchTab(id);
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

function getNewTabUrl() {
    const mode = currentSettings.newTabMode || 'homepage';
    if (mode === 'empty') return '';
    const hp = currentSettings.homepageMode || 'knack3';
    if (hp === 'empty') return '';
    if (hp === 'custom') return currentSettings.customHomepageUrl || '';
    return 'https://marketplace.atlassian.com/vendors/920480808/';
}

// Historique en mémoire pour l'omnibar (max 10 par onglet)
function addToHistory(tabId, url) {
    if (!url || url === 'about:blank') return;
    if (!tabHistory.has(tabId)) tabHistory.set(tabId, []);
    const hist     = tabHistory.get(tabId);
    const existing = hist.indexOf(url);
    if (existing !== -1) hist.splice(existing, 1);
    hist.unshift(url);
    if (hist.length > 10) hist.pop();
}

// Init : bouton + onglet
document.getElementById('add-tab-btn').addEventListener('click', addTab);
