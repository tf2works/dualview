/**
 * DualView - Landscape Login Popup
 * Version: 0.4.2
 *
 * Popup de détection de page de connexion et dialogs associés :
 *   show-login-popup, login-page-cleared,
 *   auth-custom-confirm, ignore-confirm
 */

'use strict';

const SERVICE_LABELS = {
    google: 'Google', microsoft: 'Microsoft', instagram: 'Instagram',
    facebook: 'Facebook', twitch: 'Twitch', tiktok: 'TikTok',
    twitter: 'X / Twitter', discord: 'Discord', steam: 'Steam',
};

const loginPopup    = document.getElementById('login-popup');
const ignoreConfirm = document.getElementById('ignore-confirm');
let loginPopupActive     = false;
let loginPopupServiceKey = null;

window.dualview.on('show-login-popup', ({ url, tabId, serviceKey }) => {
    if (loginPopupActive) return;
    loginPopupActive     = true;
    loginPopupServiceKey = serviceKey || null;
    const connectBtn = document.getElementById('login-popup-connect');
    if (serviceKey) {
        connectBtn.style.display = '';
        connectBtn.textContent   = 'Se connecter (' + (SERVICE_LABELS[serviceKey] || serviceKey) + ')';
    } else {
        connectBtn.style.display = 'none';
    }
    loginPopup.classList.add('show');
});

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

// Confirmation auth personnalisée
window.dualview.on('auth-custom-confirm', ({ serviceLabel, hasCookies, cookieCount }) => {
    const dialog = document.getElementById('auth-confirm-dialog');
    document.getElementById('auth-confirm-title').textContent = `Confirmation — ${serviceLabel}`;
    document.getElementById('auth-confirm-desc').textContent  = hasCookies
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
