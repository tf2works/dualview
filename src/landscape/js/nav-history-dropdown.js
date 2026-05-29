/**
 * DualView - Landscape Nav History Dropdown
 * Version: 0.4.2
 *
 * Dropdown de navigation (pile webview) sur survol/clic maintenu ← → (v0.4.0) :
 *   showNavHistDropdown, closeNavHistDropdown, attachNavHistEvents
 */

'use strict';

const navHistDropdown = document.getElementById('nav-history-dropdown');
let navHistTimer     = null;
let navHistHoldTimer = null;
let navHistActiveBtn = null;

function positionNavHistDropdown(btn) {
    const toolbarRect = document.getElementById('toolbar').getBoundingClientRect();
    const btnRect     = btn.getBoundingClientRect();
    navHistDropdown.style.left = (btnRect.left - toolbarRect.left) + 'px';
}

async function showNavHistDropdown(btn) {
    navHistActiveBtn = btn;
    const wv = getActiveWebview();
    let navEntries  = [];
    let currentIndex = -1;

    if (wv && wv.navigationHistory) {
        try {
            const nh = wv.navigationHistory;
            currentIndex = nh.getActiveIndex();
            const total  = nh.length();
            for (let i = 0; i < total; i++) {
                const entry = nh.getEntryAtIndex(i);
                if (entry) navEntries.push({ url: entry.url, title: entry.title || '' });
            }
        } catch { navEntries = []; }
    }

    if (navEntries.length === 0) {
        const memHist = tabHistory.get(activeTabId) || [];
        navEntries   = memHist.map(url => ({ url, title: '' }));
        currentIndex  = 0;
    }

    navHistDropdown.innerHTML = '';

    if (navEntries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'nav-hist-item';
        empty.style.cssText = 'color:var(--fg-muted);font-style:italic;padding:8px 12px';
        empty.textContent   = 'Aucun historique pour cet onglet';
        navHistDropdown.appendChild(empty);
    } else {
        const afterCurrent  = navEntries.slice(currentIndex + 1).reverse();
        const current       = navEntries[currentIndex] || null;
        const beforeCurrent = navEntries.slice(0, currentIndex).reverse();

        if (afterCurrent.length > 0) {
            const lbl = document.createElement('div');
            lbl.className   = 'nav-hist-section';
            lbl.textContent = 'Suivant';
            navHistDropdown.appendChild(lbl);
            afterCurrent.forEach(entry => navHistDropdown.appendChild(makeNavHistItem(entry, false)));
            const sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:var(--border);margin:2px 0';
            navHistDropdown.appendChild(sep);
        }

        if (current) {
            if (!afterCurrent.length) {
                const lbl = document.createElement('div');
                lbl.className   = 'nav-hist-section';
                lbl.textContent = 'Onglet actif';
                navHistDropdown.appendChild(lbl);
            }
            navHistDropdown.appendChild(makeNavHistItem(current, true));
        }

        if (beforeCurrent.length > 0) {
            const sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:var(--border);margin:2px 0';
            navHistDropdown.appendChild(sep);
            const lbl = document.createElement('div');
            lbl.className   = 'nav-hist-section';
            lbl.textContent = 'Précédent';
            navHistDropdown.appendChild(lbl);
            beforeCurrent.slice(0, 8).forEach(entry => navHistDropdown.appendChild(makeNavHistItem(entry, false)));
        }
    }

    const footer    = document.createElement('div');
    footer.className = 'nav-hist-footer';
    const btnHistory = document.createElement('button');
    btnHistory.className   = 'nav-hist-footer-btn';
    btnHistory.textContent = '🕐 Voir l\'historique';
    btnHistory.addEventListener('mousedown', e => { e.preventDefault(); closeNavHistDropdown(); openHistoryPanel(); });
    const btnHide = document.createElement('button');
    btnHide.className   = 'nav-hist-footer-btn hide-btn';
    btnHide.textContent = '✕ Cacher';
    btnHide.addEventListener('mousedown', e => { e.preventDefault(); closeNavHistDropdown(); });
    footer.appendChild(btnHistory);
    footer.appendChild(btnHide);
    navHistDropdown.appendChild(footer);

    positionNavHistDropdown(btn);
    navHistDropdown.classList.add('open');
}

function makeNavHistItem(entry, isCurrent) {
    const item = document.createElement('div');
    item.className = 'nav-hist-item' + (isCurrent ? ' current' : '');
    const icon = document.createElement('span');
    icon.className   = 'nav-hist-icon';
    icon.textContent = isCurrent ? '●' : '○';
    const urlSpan = document.createElement('span');
    urlSpan.className = 'nav-hist-url';
    let label = entry.title || entry.url;
    if (!entry.title) {
        try { label = new URL(entry.url).hostname.replace('www.', ''); } catch { label = entry.url; }
    }
    urlSpan.textContent = label;
    urlSpan.title       = entry.url;
    item.appendChild(icon);
    item.appendChild(urlSpan);
    if (!isCurrent) {
        item.addEventListener('mousedown', e => { e.preventDefault(); closeNavHistDropdown(); navigate(entry.url); });
    }
    return item;
}

function closeNavHistDropdown() {
    navHistDropdown.classList.remove('open');
    navHistActiveBtn = null;
    clearTimeout(navHistTimer);
    clearTimeout(navHistHoldTimer);
}

function attachNavHistEvents(btn) {
    btn.addEventListener('mouseenter', () => {
        if (btn.disabled) return;
        navHistTimer = setTimeout(() => showNavHistDropdown(btn), 500);
    });
    btn.addEventListener('mouseleave', () => { clearTimeout(navHistTimer); });
    btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || btn.disabled) return;
        navHistHoldTimer = setTimeout(() => showNavHistDropdown(btn), 400);
    });
    btn.addEventListener('mouseup',    () => clearTimeout(navHistHoldTimer));
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

// Init : attacher events aux boutons ← →
attachNavHistEvents(backBtn);
attachNavHistEvents(forwardBtn);
