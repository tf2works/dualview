/**
 * DualView - Landscape Sync UI
 * Version: 0.4.2
 *
 * Interface de synchronisation côté renderer :
 *   updateSyncUI, pollers vidéo et scroll,
 *   gestion du thème, indicateur vidéo.
 */

'use strict';

// ── Bouton sync ───────────────────────────────────────────────────────────────

const syncBtn        = document.getElementById('sync-btn');
const syncMenu       = document.getElementById('sync-menu');
const syncLabel      = document.getElementById('sync-btn-label');
const syncPauseItem  = document.getElementById('sync-pause-item');
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

window.dualview.on('sync-state-changed', state => updateSyncUI(state));
window.dualview.on('sync-resume-state', () => showToast(t('syncResumeScrollHint')));

// ── Thème ─────────────────────────────────────────────────────────────────────

window.dualview.getTheme().then(th => document.documentElement.setAttribute('data-theme', th));
window.dualview.on('theme-changed', th => {
    document.documentElement.setAttribute('data-theme', th);
    webviewPool.forEach(wv => applyWebviewTheme(wv));
});

// ── Version ───────────────────────────────────────────────────────────────────

window.dualview.getVersion().then(v => {
    document.getElementById('version-label').textContent = 'v' + v;
});

// ── Toast download-blocked ────────────────────────────────────────────────────

window.dualview.on('download-blocked', filename => {
    showToast(t('downloadBlocked') + (filename ? ' : ' + filename : ''));
});

// ── Pollers vidéo et scroll ───────────────────────────────────────────────────

let lastVideoEvent = null, lastTimeSyncAt = 0;

function pollVideoState() {
    if (currentSyncState !== 'active') return;
    const wv = getActiveWebview();
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;
    wv.executeJavaScript('window.__dualviewVideoEvent||null').then(evt => {
        if (!evt) return;
        const key = evt.type + '_' + Math.round(evt.time * 10);
        if (key === lastVideoEvent) return;
        lastVideoEvent = key;
        wv.executeJavaScript('window.__dualviewVideoEvent=null;true;').catch(() => { });
        if (evt.type === 'play')  { showIndicator('Lecture (' + evt.platform + ')', false); window.dualview.sendVideoPlay(evt.time); }
        if (evt.type === 'pause') { showIndicator('Pause (' + evt.platform + ')', true);   window.dualview.sendVideoPause(evt.time); }
        if (evt.type === 'seek') {
            wv.executeJavaScript('(window.__dualviewVideoState&&window.__dualviewVideoState.playing)||false')
                .then(isPlaying => {
                    if (isPlaying) window.dualview.sendVideoPlay(evt.time);
                    else           window.dualview.sendVideoPause(evt.time);
                }).catch(() => window.dualview.sendVideoPlay(evt.time));
        }
    }).catch(() => { });

    const now = Date.now();
    if (now - lastTimeSyncAt >= 5000) {
        lastTimeSyncAt = now;
        wv.executeJavaScript('window.__dualviewVideoState||null').then(s => {
            if (s && s.hasVideo && s.playing) showIndicator('Lecture (' + s.platform + ')', false);
            else if (s && s.hasVideo)          showIndicator('Pause (' + s.platform + ')', true);
            else                               hideIndicator();
            if (s && s.hasVideo && s.playing)  window.dualview.sendVideoTimeUpdate(s.currentTime);
        }).catch(() => { });
    }
}

setInterval(pollVideoState, 150);

function resetVideoCounters() { lastVideoEvent = null; lastTimeSyncAt = 0; hideIndicator(); }

let lastScrollPct = -1;
function pollScroll() {
    if (currentSyncState !== 'active') return;
    const wv = getActiveWebview();
    if (!wv || !wv.getURL || wv.getURL() === 'about:blank') return;
    wv.executeJavaScript('window.__dualviewScrollPct||0').then(pct => {
        if (typeof pct === 'number' && Math.abs(pct - lastScrollPct) > 0.001) {
            lastScrollPct = pct;
            window.dualview.sendScroll(pct);
        }
    }).catch(() => { });
}

setInterval(pollScroll, 100);
