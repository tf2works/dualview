/**
 * DualView - Landscape Keyboard Shortcuts
 * Version: 0.4.2
 *
 * Raccourcis clavier globaux et actions du menu contextuel natif (v0.4.1) :
 *   Ctrl+L, F5, Ctrl+T/W/Tab, Alt+←/→, F12, boutons souris, context-menu-action
 */

'use strict';

document.addEventListener('keydown', (e) => {
    const tag     = document.activeElement && document.activeElement.tagName;
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
        return;
    }

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
    // F5 / Ctrl+R — Recharger
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
});

// ── Boutons souris Retour/Avance (v0.4.1) ────────────────────────────────────
window.dualview.on('mouse-nav', (direction) => {
    if (direction === 'back'    && !backBtn.disabled)    window.dualview.navBack();
    if (direction === 'forward' && !forwardBtn.disabled) window.dualview.navForward();
});

// ── Actions menu contextuel natif (v0.4.1) ───────────────────────────────────
window.dualview.on('context-menu-action', ({ action, url, text }) => {
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

// ── Commandes OBS (v0.3.2) ────────────────────────────────────────────────────
window.dualview.on('obs-command', ({ action, payload }) => {
    payload = payload || {};
    switch (action) {
        case 'nav-back':    if (!backBtn.disabled)    window.dualview.navBack();    break;
        case 'nav-forward': if (!forwardBtn.disabled) window.dualview.navForward(); break;
        case 'nav-reload':  document.getElementById('reload-btn').click();          break;
        case 'nav-home':    document.getElementById('home-btn').click();            break;
        case 'navigate':    if (payload.url && activeTabId !== SETTINGS_TAB_ID) navigate(payload.url); break;
        case 'tab-new':     addTab(); break;
        case 'tab-close':   closeTab(payload.tabId || activeTabId); break;
        case 'tab-switch':  if (payload.tabId && tabs.some(t => t.id === payload.tabId)) switchTab(payload.tabId); break;
        default: break;
    }
});

// ── Dev mode ──────────────────────────────────────────────────────────────────
window.dualview.getIsDev().then(isDev => {
    if (!isDev) return;
    document.body.classList.add('dev-mode');
    document.getElementById('dev-btn').addEventListener('click', () => {
        const wv = getActiveWebview();
        if (!wv) return;
        if (wv.isDevToolsOpened()) wv.closeDevTools();
        else wv.openDevTools();
    });
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'F12') return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            const wv = getActiveWebview();
            if (!wv) return;
            if (wv.isDevToolsOpened()) wv.closeDevTools();
            else wv.openDevTools();
        } else {
            window.dualview.toggleDevTools();
        }
    });
});

// ── Screenshot ────────────────────────────────────────────────────────────────
document.getElementById('screenshot-btn').addEventListener('click', async () => {
    const result = await window.dualview.takeScreenshot();
    if (result && result.success) showToast(t('screenshotOk') + ' — ' + result.dir, 4000);
    else showToast(t('screenshotErr'));
});
