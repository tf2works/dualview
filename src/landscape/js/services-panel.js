/**
 * DualView - Landscape Services Panel
 * Version: 0.4.2
 *
 * Panneau "Services connectés" dans les paramètres :
 *   loadServicesStatus, connectService, showSvcContextMenu
 */

'use strict';

const SERVICE_ICONS = {
    google: '🔵', microsoft: '🪟', instagram: '📸', facebook: '👤',
    twitch: '💜', tiktok: '🎵', twitter: '🐦', discord: '🎮', steam: '🎮',
};
// SERVICE_LABELS est défini dans login-popup.js (partagé via globals)

async function loadServicesStatus() {
    const loading = document.getElementById('svc-loading');
    const grid    = document.getElementById('svc-grid');
    loading.style.display = 'flex';
    grid.style.display    = 'none';

    const { known, custom } = await window.dualview.getConnectedServicesStatus();
    loading.style.display = 'none';
    grid.style.display    = 'grid';
    grid.innerHTML        = '';

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
            if (connected) showSvcContextMenu(key, null, null, tile, connected);
            else { await connectService(key, null, null); loadServicesStatus(); }
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
    const customList = document.getElementById('svc-custom-list');
    customList.innerHTML = '';
    for (const svc of (custom || [])) {
        const connected = svc.connected === true;
        const item = document.createElement('div');
        item.className  = 'svc-tile' + (connected ? ' connected' : '');
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

async function connectService(serviceKey, customUrl, customLabel) {
    showToast(t('servicesConnecting'), 8000);
    const result = await window.dualview.openAuthWindow({ serviceKey, customUrl, customLabel });
    if (result && result.success) showToast(t('servicesSuccess'));
    else                          showToast(t('servicesFailed'));
    return result && result.success;
}

function showSvcContextMenu(serviceKey, customUrl, customLabel, tileEl, isConnected) {
    const existing = document.getElementById('svc-ctx-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'svc-ctx-menu';
    menu.style.cssText = `position:fixed;background:var(--bg);border:1px solid var(--border);
        border-radius:8px;padding:4px 0;min-width:160px;z-index:9000;
        box-shadow:0 2px 12px rgba(0,0,0,0.15)`;
    const rect = tileEl.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top  = (rect.bottom + 4) + 'px';
    menu.innerHTML  = `
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
    document.getElementById('svc-custom-url').value   = '';
    document.getElementById('svc-custom-msg').className = 's-msg';
});
document.getElementById('svc-custom-connect').addEventListener('click', async () => {
    const label = document.getElementById('svc-custom-label').value.trim();
    let url     = document.getElementById('svc-custom-url').value.trim();
    const msg   = document.getElementById('svc-custom-msg');
    if (!label || !url) { msg.textContent = 'Nom et URL requis.'; msg.className = 's-msg show err'; return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let valid = false;
    try { new URL(url); valid = true; } catch { }
    if (!valid) { msg.textContent = t('urlInvalid'); msg.className = 's-msg show err'; return; }
    msg.textContent = t('servicesConnecting'); msg.className = 's-msg show ok';
    document.getElementById('svc-custom-form').classList.remove('show');
    document.getElementById('svc-custom-label').value = '';
    document.getElementById('svc-custom-url').value   = '';
    await connectService('custom', url, label);
    loadServicesStatus();
});
