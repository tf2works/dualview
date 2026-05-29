/**
 * DualView - Landscape UI Utils
 * Version: 0.4.2
 *
 * Utilitaires UI partagés entre tous les modules renderer :
 *   showToast, showIndicator, hideIndicator, escHtml, applyWebviewTheme
 */

'use strict';

// ── Toast ─────────────────────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg, duration) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('show'), duration || 3500);
}

// ── Indicateur vidéo ──────────────────────────────────────────────────────────

function showIndicator(text, paused) {
    const indicator    = document.getElementById('video-indicator');
    const indicatorTxt = document.getElementById('video-indicator-text');
    indicatorTxt.textContent = text;
    indicator.classList.toggle('paused', paused);
    indicator.classList.add('visible');
}

function hideIndicator() {
    document.getElementById('video-indicator').classList.remove('visible');
}

// ── Sécurité HTML ─────────────────────────────────────────────────────────────

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── Thème webview ─────────────────────────────────────────────────────────────

function applyWebviewTheme(wv) {
    const appearance = currentSettings.appearance || 'auto';
    if (appearance === 'auto' || !wv.getURL || wv.getURL() === 'about:blank') return;
    const theme = document.documentElement.getAttribute('data-theme');
    const css = theme === 'dark'
        ? ':root{color-scheme:dark!important}'
        : ':root{color-scheme:light!important}';
    wv.insertCSS(css).catch(() => { });
}

// ── Clipboard helper ─────────────────────────────────────────────────────────

function copyToClipboard(text, btn) {
    if (!text) return;
    try { navigator.clipboard.writeText(text); } catch { /* ignore */ }
    const orig = btn.textContent;
    btn.textContent = t('copiedBtn');
    setTimeout(() => { btn.textContent = orig; }, 1500);
}
