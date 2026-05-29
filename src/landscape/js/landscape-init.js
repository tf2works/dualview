/**
 * DualView - Landscape Init
 * Version: 0.4.2
 *
 * Initialisation finale — chargé en dernier, après tous les autres modules.
 * Lance la séquence de démarrage : getStore → création des webviews initiales.
 *
 * Contient aussi les listeners de menus (gear, resize) qui dépendent de
 * fonctions définies dans d'autres modules.
 */

'use strict';

// ── Menu ⚙️ ───────────────────────────────────────────────────────────────────

const gearBtn  = document.getElementById('gear-btn');
const gearMenu = document.getElementById('gear-menu');

gearBtn.addEventListener('click', e => {
    e.stopPropagation();
    gearMenu.classList.toggle('open');
    syncMenu.classList.remove('open');
});
gearMenu.addEventListener('click', e => e.stopPropagation());

document.getElementById('menu-resize').addEventListener('click', () => {
    gearMenu.classList.remove('open');
    startResizeMode();
});
document.getElementById('menu-history').addEventListener('click', () => {
    gearMenu.classList.remove('open');
    openHistoryPanel();
});
document.getElementById('menu-settings').addEventListener('click', () => {
    gearMenu.classList.remove('open');
    openSettingsTab();
});

// ── Synchronisation état initial ──────────────────────────────────────────────

window.dualview.getSyncState().then(state => updateSyncUI(state));

// ── Démarrage : chargement config + création webviews initiales ───────────────

window.dualview.getStore().then(({ tabs: st, activeTabId: sa, settings }) => {
    loadSettingsUI(settings || {});

    const restore = settings && settings.restoreTabs !== false;
    let initTabs, initActiveId;

    if (restore && st && st.length > 0) {
        initTabs     = st;
        initActiveId = sa || st[0].id;
    } else {
        const homepageUrl = getNewTabUrl();
        initTabs     = [{ id: 'tab-1', title: homepageUrl ? '' : t('newTab'), url: homepageUrl }];
        initActiveId = 'tab-1';
    }

    tabs        = initTabs;
    activeTabId = initActiveId;

    tabs.forEach(tab => {
        if (!isSettingsTab(tab)) createWebview(tab.id, tab.url || '');
    });

    // Ne pas démarrer sur l'onglet paramètres
    if (activeTabId === SETTINGS_TAB_ID) {
        const firstWeb = tabs.find(t => t.id !== SETTINGS_TAB_ID);
        activeTabId = firstWeb ? firstWeb.id : tabs[0].id;
    }

    showWebview(activeTabId);

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.url) {
        document.getElementById('url-input').value = activeTab.url;
    }

    window.dualview.switchTab(activeTabId);
    renderTabs();
});
