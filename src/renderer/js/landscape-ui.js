/*
 * DualView - UI de base fenêtre paysage
 * Version: 0.4.4
 *
 * État global, synchronisation, thème, toast, indicateur vidéo,
 * navigation ←→, menu ⚙️, mode redimensionnement portrait.
 *
 * Dépendances : landscape-i18n.js (t, currentLang, applyTranslations)
 */

/*
 * DualView - Application fenêtre paysage
 * Version: 0.4.4
 *
 * Logique principale du renderer landscape :
 *   - État global (tabs, webviewPool, syncState)
 *   - Synchronisation (bouton sync, IPC sync-state-changed)
 *   - Thème et apparence
 *   - Pool de webviews (createWebview, destroyWebview, showWebview)
 *   - Onglets (renderTabs, switchTab, addTab, closeTab)
 *   - Popup login et overlay services connectés
 *   - Barre d'adresse et omnibar (résolution URL, recherche, historique)
 *   - Paramètres (general, apparence, langue, OBS, services, moteurs)
 *   - Panneau historique
 *   - Dropdown historique navigation ← →
 *   - Raccourcis clavier, boutons souris, menu contextuel
 *   - Pollers (pub YouTube, vidéo, scroll)
 *   - Initialisation
 *
 * Utilisé par : landscape.html
 * Dépendances : landscape-i18n.js (I18N, t(), applyTranslations(), currentLang)
 *               landscape-webview.js (VIDEO_WATCHER_SCRIPT, SCROLL_INJECT,
 *                                     AUTO_PAUSE_SCRIPT, resetWatcherFlags,
 *                                     injectWatcher, injectAutoPause)
 */

// ── État ───────────────────────────────────────────────────────────────────────
const webviewCont = document.getElementById('webview-container');
const emptyState = document.getElementById('empty-state');
const settingsPanel = document.getElementById('settings-panel');
const indicator = document.getElementById('video-indicator');
const indicatorTxt = document.getElementById('video-indicator-text');
const SETTINGS_TAB_ID = '__settings__';
let currentSettings = {};
let tabs = [];
let activeTabId = null;
let currentSyncState = 'paused';  // Démarre en pause
let lastLoginPopupUrl = null;

const webviewPool = new Map();
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Bouton sync ────────────────────────────────────────────────────────────────
const syncBtn = document.getElementById('sync-btn');
const syncMenu = document.getElementById('sync-menu');
const syncLabel = document.getElementById('sync-btn-label');
const syncPauseItem = document.getElementById('sync-pause-item');
const syncResumeItem = document.getElementById('sync-resume-item');
const syncRestartItem = document.getElementById('sync-restart-item');

function updateSyncUI(state) {
    currentSyncState = state;
    if (state === 'active') {
        syncBtn.classList.remove('paused');
        syncLabel.textContent = t('syncActive');
        syncPauseItem.classList.remove('disabled');
        syncResumeItem.classList.add('disabled');
    } else {
        syncBtn.classList.add('paused');
        syncLabel.textContent = state === 'paused' ? t('syncPaused') : t('syncStarting');
        syncPauseItem.classList.add('disabled');
        syncResumeItem.classList.remove('disabled');
    }
}

syncBtn.addEventListener('click', e => {
    e.stopPropagation();
    syncMenu.classList.toggle('open');
    // Fermer gear menu
    document.getElementById('gear-menu').classList.remove('open');
});
document.addEventListener('click', () => {
    syncMenu.classList.remove('open');
    document.getElementById('gear-menu').classList.remove('open');
});
syncMenu.addEventListener('click', e => e.stopPropagation());

syncPauseItem.addEventListener('click', () => {
    if (syncPauseItem.classList.contains('disabled')) return;
    syncMenu.classList.remove('open');
    window.dualview.syncControl('pause');
});
syncResumeItem.addEventListener('click', () => {
    if (syncResumeItem.classList.contains('disabled')) return;
    syncMenu.classList.remove('open');
    window.dualview.syncControl('resume');
});
syncRestartItem.addEventListener('click', () => {
    syncMenu.classList.remove('open');
    window.dualview.syncControl('restart');
});

window.dualview.on('sync-state-changed', state => {
    updateSyncUI(state);
});

// Quand la sync reprend, rejouer scroll/vidéo dans portrait
window.dualview.on('sync-resume-state', ({ tabId, url }) => {
    // La webview portrait recharge l'URL → les scripts détecteront l'état vidéo/scroll
    showToast(t('syncResumeScrollHint'));
});

// ── Thème ──────────────────────────────────────────────────────────────────────
// initialTheme est fourni synchroniquement par le preload (process.argv),
// ce qui evite le flash de fond lors du demarrage quand l'OS est en mode
// sombre mais que l'utilisateur a selectionne le theme clair.
if (window.dualview.initialTheme) {
    document.documentElement.setAttribute('data-theme', window.dualview.initialTheme);
} else {
    window.dualview.getTheme().then(th => document.documentElement.setAttribute('data-theme', th));
}
window.dualview.on('theme-changed', th => {
    document.documentElement.setAttribute('data-theme', th);
    webviewPool.forEach(wv => applyWebviewTheme(wv));
});

function applyWebviewTheme(wv) {
    const appearance = currentSettings.appearance || 'auto';
    if (appearance === 'auto' || !wv.getURL || wv.getURL() === 'about:blank') return;
    const theme = document.documentElement.getAttribute('data-theme');
    const css = theme === 'dark' ? ':root{color-scheme:dark!important}' : ':root{color-scheme:light!important}';
    wv.insertCSS(css).catch(() => { });
}

window.dualview.getVersion().then(v => { document.getElementById('version-label').textContent = 'v' + v; });

// ── Toast ──────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration || 3500);
}
window.dualview.on('download-blocked', filename => {
    showToast(t('downloadBlocked') + (filename ? ' : ' + filename : ''));
});

// ── Indicateur vidéo ───────────────────────────────────────────────────────────
function showIndicator(text, paused) {
    indicatorTxt.textContent = text;
    indicator.classList.toggle('paused', paused);
    indicator.classList.add('visible');
}
function hideIndicator() { indicator.classList.remove('visible'); }

// ── Nav ────────────────────────────────────────────────────────────────────────
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
function updateNavButtons(state) { backBtn.disabled = !state.canGoBack; forwardBtn.disabled = !state.canGoForward; }
window.dualview.on('nav-state-changed', updateNavButtons);
backBtn.addEventListener('click', () => { if (!backBtn.disabled) window.dualview.navBack(); });
forwardBtn.addEventListener('click', () => { if (!forwardBtn.disabled) window.dualview.navForward(); });
window.dualview.on('webview-go-back', () => { const wv = getActiveWebview(); if (wv && wv.canGoBack && wv.canGoBack()) wv.goBack(); });
window.dualview.on('webview-go-forward', () => { const wv = getActiveWebview(); if (wv && wv.canGoForward && wv.canGoForward()) wv.goForward(); });
function sendNavState(wv) {
    if (!wv) wv = getActiveWebview();
    window.dualview.notifyNavState({ canGoBack: wv && wv.canGoBack ? wv.canGoBack() : false, canGoForward: wv && wv.canGoForward ? wv.canGoForward() : false });
}
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

// ── Menu ⚙️ ────────────────────────────────────────────────────────────────────
const gearBtn = document.getElementById('gear-btn');
const gearMenu = document.getElementById('gear-menu');
gearBtn.addEventListener('click', e => { e.stopPropagation(); gearMenu.classList.toggle('open'); syncMenu.classList.remove('open'); });
gearMenu.addEventListener('click', e => e.stopPropagation());
document.getElementById('menu-resize').addEventListener('click', () => { gearMenu.classList.remove('open'); startResizeMode(); });
document.getElementById('menu-history').addEventListener('click', () => { gearMenu.classList.remove('open'); openHistoryPanel(); });
document.getElementById('menu-settings').addEventListener('click', () => { gearMenu.classList.remove('open'); openSettingsTab(); });

// ── Mode redimensionnement v0.4.0 ──────────────────────────────────────────────
// Le bouton ✅ (resume-btn) est retiré de la toolbar — tout passe par la modale.
const resizeModalOverlay = document.getElementById('resize-modal-overlay');
const resizePresetList = document.getElementById('resize-preset-list');
let currentPresetId = null;  // preset sélectionné dans la modale

async function startResizeMode() {
    const presets = await window.dualview.getPortraitPresets();
    const savedPreset = currentSettings.portraitPreset || 'iphone15';
    currentPresetId = savedPreset;

    // Construire la liste de préréglages
    resizePresetList.innerHTML = '';
    presets.forEach(preset => {
        const item = document.createElement('div');
        item.className = 'resize-preset-item' + (preset.id === savedPreset ? ' active' : '');
        item.dataset.id = preset.id;
        item.innerHTML = `<span>📱 ${preset.label}</span><span class="resize-preset-dim">${preset.width} × ${preset.height} px</span>`;
        item.addEventListener('click', () => {
            resizePresetList.querySelectorAll('.resize-preset-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            currentPresetId = preset.id;
            window.dualview.applyPortraitPreset(preset.id);
        });
        resizePresetList.appendChild(item);
    });
    // Option taille libre
    const freeItem = document.createElement('div');
    freeItem.className = 'resize-preset-item free-size';
    freeItem.innerHTML = `<span>↔ Taille libre</span><span class="resize-preset-dim">redimensionnez la fenêtre Portrait</span>`;
    freeItem.addEventListener('click', () => {
        resizePresetList.querySelectorAll('.resize-preset-item').forEach(el => el.classList.remove('active'));
        freeItem.classList.add('active');
        currentPresetId = null;
    });
    resizePresetList.appendChild(freeItem);

    // Ouvrir la modale et activer le redimensionnement portrait
    resizeModalOverlay.classList.add('show');
    window.dualview.startPortraitResize();
}

document.getElementById('resize-modal-validate').addEventListener('click', () => {
    resizeModalOverlay.classList.remove('show');
    if (currentPresetId) {
        currentSettings.portraitPreset = currentPresetId;
        saveCurrentSettings();
    }
    window.dualview.finishPortraitResize();
});

document.getElementById('resize-modal-cancel').addEventListener('click', () => {
    resizeModalOverlay.classList.remove('show');
    window.dualview.cancelPortraitResize();
});