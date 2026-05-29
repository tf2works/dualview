/**
 * DualView - Landscape History Panel
 * Version: 0.4.2
 *
 * Panneau latéral d'historique persistant (v0.4.0) :
 *   openHistoryPanel, closeHistoryPanel, renderHistoryList
 */

'use strict';

const historyPanel   = document.getElementById('history-panel');
const historyList    = document.getElementById('history-list');
const historyEmpty   = document.getElementById('history-empty');
const histSearchInput = document.getElementById('history-search-input');
let historyOpen    = false;
let histSearchTimer = null;

document.getElementById('history-panel-close').addEventListener('click', closeHistoryPanel);

document.getElementById('history-clear-all-btn').addEventListener('click', async () => {
    if (!confirm('Effacer tout l\'historique ?')) return;
    window.dualview.historyClearAll();
    renderHistoryList([]);
});

histSearchInput.addEventListener('input', () => {
    clearTimeout(histSearchTimer);
    histSearchTimer = setTimeout(async () => {
        const q       = histSearchInput.value.trim();
        const results = await window.dualview.historySearch(q, 200);
        renderHistoryList(results);
    }, 200);
});

async function openHistoryPanel() {
    historyOpen = true;
    historyPanel.classList.add('open');
    histSearchInput.value = '';
    const entries = await window.dualview.historyGetAll();
    renderHistoryList(entries);
    setTimeout(() => histSearchInput.focus(), 250);
}

function closeHistoryPanel() {
    historyOpen = false;
    historyPanel.classList.remove('open');
}

// Fermeture sur clic extérieur
document.addEventListener('click', (e) => {
    if (historyOpen && !historyPanel.contains(e.target) && e.target.id !== 'menu-history') {
        closeHistoryPanel();
    }
});

function renderHistoryList(entries) {
    historyList.innerHTML = '';
    historyList.appendChild(historyEmpty);
    if (!entries || entries.length === 0) { historyEmpty.style.display = 'flex'; return; }
    historyEmpty.style.display = 'none';

    const groups   = new Map();
    const now      = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);

    entries.forEach(entry => {
        const d  = new Date(entry.visitedAt);
        const ds = d.toDateString();
        let label;
        if (ds === todayStr)          label = "Aujourd'hui";
        else if (ds === yesterdayStr) label = 'Hier';
        else if (d >= weekAgo)        label = 'Cette semaine';
        else {
            label = d.toLocaleDateString(getLang() === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
            label = label.charAt(0).toUpperCase() + label.slice(1);
        }
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(entry);
    });

    groups.forEach((groupEntries, label) => {
        const lbl = document.createElement('div');
        lbl.className   = 'hist-group-label';
        lbl.textContent = label;
        historyList.appendChild(lbl);

        groupEntries.forEach(entry => {
            const item   = document.createElement('div');
            item.className = 'hist-item';
            const favicon  = document.createElement('span');
            favicon.className  = 'hist-favicon';
            favicon.textContent = '🌐';
            const text   = document.createElement('div');
            text.className = 'hist-text';
            const title  = document.createElement('div');
            title.className   = 'hist-title';
            title.textContent = entry.title || entry.url;
            title.title       = entry.url;
            const url = document.createElement('div');
            url.className   = 'hist-url';
            url.textContent = entry.url;
            text.appendChild(title);
            text.appendChild(url);
            const time = document.createElement('span');
            time.className   = 'hist-time';
            const d = new Date(entry.visitedAt);
            time.textContent = d.toLocaleTimeString(getLang() === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
            const delBtn = document.createElement('button');
            delBtn.className   = 'hist-delete-btn';
            delBtn.title       = 'Supprimer';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                window.dualview.historyDeleteUrl(entry.url);
                item.remove();
                let next = lbl.nextElementSibling;
                if (!next || next.classList.contains('hist-group-label')) lbl.remove();
                if (!historyList.querySelector('.hist-item')) historyEmpty.style.display = 'flex';
            });
            item.appendChild(favicon);
            item.appendChild(text);
            item.appendChild(time);
            item.appendChild(delBtn);
            item.addEventListener('click', () => { navigate(entry.url); closeHistoryPanel(); });
            historyList.appendChild(item);
        });
    });
}
