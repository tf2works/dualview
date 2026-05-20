/**
 * DualView - Main Process
 * Version: 0.2.2
 *
 * Corrections v0.2.2 :
 * - Fix bloqueur pub : utilise session.fromPartition('persist:dualview')
 *   car les <webview> ont leur propre session, pas la defaultSession
 * - Fix boutons nav : canGoBack/Forward lu depuis le renderer webview
 *   via IPC, pas depuis landscapeWin.webContents (qui est le parent)
 * - Bouton redimensionnement renomme en icone double-fleche
 */

const { app, BrowserWindow, ipcMain, nativeTheme, screen, session } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Store JSON natif ─────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'dualview-config.json');

const DEFAULTS = {
  landscapeWindow: { width: 1280, height: 720, x: null, y: null },
  portraitWindow:  { width: 390,  height: 844, x: null, y: null },
  controlWindow:   { width: 960,  height: 160, x: null, y: null },
  tabs:            [{ id: 'tab-1', title: 'Onglet 1', url: '' }],
  activeTabId:     'tab-1',
  appVersion:      '0.2.2'
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw  = fs.readFileSync(CONFIG_PATH, 'utf8');
      const data = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, data, {
        landscapeWindow: Object.assign({}, DEFAULTS.landscapeWindow, data.landscapeWindow),
        portraitWindow:  Object.assign({}, DEFAULTS.portraitWindow,  data.portraitWindow),
        controlWindow:   Object.assign({}, DEFAULTS.controlWindow,   data.controlWindow),
      });
    }
  } catch (e) { console.warn('Config load error:', e.message); }
  return Object.assign({}, DEFAULTS);
}

function saveConfig(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.warn('Config save error:', e.message); }
}

let config = loadConfig();

function configSet(keyPath, value) {
  const keys = keyPath.split('.');
  let obj = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  saveConfig(config);
}

function configGet(keyPath) {
  const keys = keyPath.split('.');
  let obj = config;
  for (const k of keys) {
    if (obj == null || typeof obj !== 'object') return undefined;
    obj = obj[k];
  }
  return obj;
}

// ── Bloqueur de publicites ────────────────────────────────────────────────────
// Meme approche que v0.2.1 : defaultSession.
// Les webviews n'utilisent pas de partition explicite donc elles
// partagent la defaultSession et le bloqueur les couvre.

const AD_BLOCK_PATTERNS = [
  '*://*.doubleclick.net/*',
  '*://googleads.g.doubleclick.net/*',
  '*://pubads.g.doubleclick.net/*',
  '*://securepubads.g.doubleclick.net/*',
  '*://pagead2.googlesyndication.com/*',
  '*://ads.youtube.com/*',
  '*://*.googlesyndication.com/*',
  '*://*.adservice.google.com/*',
  '*://*.adservice.google.fr/*',
  '*://analytics.google.com/analytics/collect*',
  '*://www.google-analytics.com/collect*',
  '*://stats.g.doubleclick.net/*',
  '*://imasdk.googleapis.com/js/sdkloader/*',
  '*://imasdk.googleapis.com/admob/*',
  '*://imasdk.googleapis.com/pal/*',
];

function setupAdBlocker() {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: AD_BLOCK_PATTERNS },
    (details, callback) => {
      callback({ cancel: true });
    }
  );
}

// ── Variables globales ───────────────────────────────────────────────────────
let controlWin   = null;
let landscapeWin = null;
let portraitWin  = null;
let syncPaused   = false;
let currentUrl   = '';

function getTheme() {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function broadcastTheme() {
  const theme = getTheme();
  [controlWin, landscapeWin, portraitWin].forEach(win => {
    if (win && !win.isDestroyed()) win.webContents.send('theme-changed', theme);
  });
}

// ── Fenetres ─────────────────────────────────────────────────────────────────
function createControlWindow() {
  const saved = configGet('controlWindow');
  const sw    = screen.getPrimaryDisplay().workAreaSize.width;

  controlWin = new BrowserWindow({
    width:     saved.width  || 960,
    height:    saved.height || 160,
    x:         saved.x !== null ? saved.x : Math.floor((sw - 960) / 2),
    y:         saved.y !== null ? saved.y : 20,
    minWidth:  700, minHeight: 110, maxHeight: 240,
    title: 'DualView - Controle',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload-control.js'),
    },
    autoHideMenuBar: true, resizable: true, show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f0f0f0',
  });

  controlWin.loadFile(path.join(__dirname, 'control.html'));
  controlWin.once('ready-to-show', () => controlWin.show());
  controlWin.on('moved',  () => { const [x,y]=controlWin.getPosition(); configSet('controlWindow.x',x); configSet('controlWindow.y',y); });
  controlWin.on('resize', () => { const [w,h]=controlWin.getSize();     configSet('controlWindow.width',w); configSet('controlWindow.height',h); });
  controlWin.on('closed', () => app.quit());
}

function createLandscapeWindow() {
  const saved = configGet('landscapeWindow');
  const sh    = screen.getPrimaryDisplay().workAreaSize.height;
  const w = saved.width||1280, h = saved.height||720;
  const x = saved.x !== null ? saved.x : 20;
  const y = saved.y !== null ? saved.y : Math.floor((sh-h)/2);

  landscapeWin = new BrowserWindow({
    width:w, height:h, x, y, minWidth:640, minHeight:360,
    title: 'DualView - Paysage',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload-view.js'),
      webviewTag: true,
    },
    autoHideMenuBar: true, resizable: true, show: false,
    backgroundColor: '#ffffff',
  });

  landscapeWin.loadFile(path.join(__dirname, 'landscape.html'));
  landscapeWin.once('ready-to-show', () => landscapeWin.show());
  landscapeWin.on('moved',  () => { const [x,y]=landscapeWin.getPosition(); configSet('landscapeWindow.x',x); configSet('landscapeWindow.y',y); });
  landscapeWin.on('resize', () => { const [w,h]=landscapeWin.getSize();     configSet('landscapeWindow.width',w); configSet('landscapeWindow.height',h); });
  landscapeWin.on('closed', () => { landscapeWin = null; });
}

function createPortraitWindow() {
  const saved = configGet('portraitWindow');
  const { width:sw, height:sh } = screen.getPrimaryDisplay().workAreaSize;
  const w = saved.width||390, h = saved.height||844;
  const x = saved.x !== null ? saved.x : sw-w-20;
  const y = saved.y !== null ? saved.y : Math.floor((sh-h)/2);

  portraitWin = new BrowserWindow({
    width:w, height:h, x, y, minWidth:280, minHeight:400,
    title: 'DualView - Portrait',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload-view.js'),
      webviewTag: true,
    },
    autoHideMenuBar: true, resizable: true, show: false,
    backgroundColor: '#ffffff',
  });

  portraitWin.loadFile(path.join(__dirname, 'portrait.html'));
  portraitWin.once('ready-to-show', () => portraitWin.show());
  portraitWin.on('moved',  () => { const [x,y]=portraitWin.getPosition(); configSet('portraitWindow.x',x); configSet('portraitWindow.y',y); });
  portraitWin.on('resize', () => { const [w,h]=portraitWin.getSize();     configSet('portraitWindow.width',w); configSet('portraitWindow.height',h); });
  portraitWin.on('closed', () => { portraitWin = null; });
}

// ── IPC : Navigation URL ──────────────────────────────────────────────────────
ipcMain.on('navigate', (event, url) => {
  currentUrl = url;
  if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('load-url', url);
  if (portraitWin  && !portraitWin.isDestroyed())  portraitWin.webContents.send('load-url', url);
});

ipcMain.on('sync-scroll', (event, pct) => {
  if (syncPaused) return;
  if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('apply-scroll', pct);
});

ipcMain.on('sync-navigate', (event, url) => {
  if (syncPaused) return;
  currentUrl = url;
  if (controlWin  && !controlWin.isDestroyed())  controlWin.webContents.send('update-addressbar', url);
  if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('load-url', url);
});

// ── IPC : Navigation back/forward ─────────────────────────────────────────────
// FIX v0.2.2 : l'etat back/forward vient maintenant du renderer (webview.canGoBack())
// via 'notify-nav-state', pas de landscapeWin.webContents qui est le BrowserWindow parent.

ipcMain.on('notify-nav-state', (event, state) => {
  // state = { canGoBack: bool, canGoForward: bool } envoye par landscape.html
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.webContents.send('nav-state-changed', state);
  }
});

ipcMain.on('nav-back', () => {
  // Envoyer la commande au renderer landscape qui appelera webview.goBack()
  if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('webview-go-back');
  if (portraitWin  && !portraitWin.isDestroyed())  portraitWin.webContents.send('webview-go-back');
});

ipcMain.on('nav-forward', () => {
  if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('webview-go-forward');
  if (portraitWin  && !portraitWin.isDestroyed())  portraitWin.webContents.send('webview-go-forward');
});

// ── IPC : Video sync ──────────────────────────────────────────────────────────
ipcMain.on('video-play',       (e,t) => { if(!syncPaused&&portraitWin&&!portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd',{action:'play',currentTime:t}); });
ipcMain.on('video-pause',      (e,t) => { if(!syncPaused&&portraitWin&&!portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd',{action:'pause',currentTime:t}); });
ipcMain.on('video-timeupdate', (e,t) => { if(!syncPaused&&portraitWin&&!portraitWin.isDestroyed()) portraitWin.webContents.send('video-cmd',{action:'seek',currentTime:t}); });
ipcMain.on('video-state',      (e,s) => { if(controlWin&&!controlWin.isDestroyed()) controlWin.webContents.send('video-state',s); });

// ── IPC : Divers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-current-url', () => currentUrl);
ipcMain.handle('get-theme',       () => getTheme());

ipcMain.handle('get-store', () => ({
  tabs:        configGet('tabs')        || DEFAULTS.tabs,
  activeTabId: configGet('activeTabId') || DEFAULTS.activeTabId,
  version:     configGet('appVersion')  || DEFAULTS.appVersion,
}));

ipcMain.on('save-tabs', (event, { tabs, activeTabId }) => {
  configSet('tabs', tabs);
  configSet('activeTabId', activeTabId);
});

ipcMain.on('sync-pause', () => {
  syncPaused = true;
  if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('resize-mode', true);
});

ipcMain.on('sync-resume', () => {
  syncPaused = false;
  if (portraitWin && !portraitWin.isDestroyed()) {
    portraitWin.webContents.send('resize-mode', false);
    if (currentUrl) portraitWin.webContents.send('load-url', currentUrl);
    const [w,h] = portraitWin.getSize();
    configSet('portraitWindow.width',w); configSet('portraitWindow.height',h);
  }
});

ipcMain.handle('get-version', () => app.getVersion());

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  setupAdBlocker();
  createControlWindow();
  createLandscapeWindow();
  createPortraitWindow();
  nativeTheme.on('updated', broadcastTheme);
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createControlWindow(); createLandscapeWindow(); createPortraitWindow();
  }
});