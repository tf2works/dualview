/**
 * DualView - Main Process
 * Version: 0.1.0
 *
 * Persistance via fs+JSON natif (pas de dependance externe).
 */

const { app, BrowserWindow, ipcMain, nativeTheme, screen } = require('electron');
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
  appVersion:      '0.1.0'
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw  = fs.readFileSync(CONFIG_PATH, 'utf8');
      const data = JSON.parse(raw);
      // Fusion profonde avec les defaults pour les cles manquantes
      return Object.assign({}, DEFAULTS, data, {
        landscapeWindow: Object.assign({}, DEFAULTS.landscapeWindow, data.landscapeWindow),
        portraitWindow:  Object.assign({}, DEFAULTS.portraitWindow,  data.portraitWindow),
        controlWindow:   Object.assign({}, DEFAULTS.controlWindow,   data.controlWindow),
      });
    }
  } catch (e) {
    console.warn('Config load error, using defaults:', e.message);
  }
  return Object.assign({}, DEFAULTS);
}

function saveConfig(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Config save error:', e.message);
  }
}

// Config globale
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

// ── Variables globales ───────────────────────────────────────────────────────
let controlWin   = null;
let landscapeWin = null;
let portraitWin  = null;
let syncPaused   = false;
let currentUrl   = '';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getTheme() {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function broadcastTheme() {
  const theme = getTheme();
  [controlWin, landscapeWin, portraitWin].forEach(win => {
    if (win && !win.isDestroyed()) win.webContents.send('theme-changed', theme);
  });
}

// ── Fenetre de controle ──────────────────────────────────────────────────────
function createControlWindow() {
  const saved   = configGet('controlWindow');
  const display = screen.getPrimaryDisplay();
  const sw      = display.workAreaSize.width;

  controlWin = new BrowserWindow({
    width:    saved.width  || 960,
    height:   saved.height || 160,
    x:        saved.x !== null ? saved.x : Math.floor((sw - 960) / 2),
    y:        saved.y !== null ? saved.y : 20,
    minWidth:  700,
    minHeight: 110,
    maxHeight: 240,
    title: 'DualView - Controle',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-control.js'),
    },
    autoHideMenuBar: true,
    resizable: true,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f0f0f0',
  });

  controlWin.loadFile(path.join(__dirname, 'control.html'));
  controlWin.once('ready-to-show', () => controlWin.show());

  controlWin.on('moved', () => {
    const [x, y] = controlWin.getPosition();
    configSet('controlWindow.x', x);
    configSet('controlWindow.y', y);
  });
  controlWin.on('resize', () => {
    const [w, h] = controlWin.getSize();
    configSet('controlWindow.width', w);
    configSet('controlWindow.height', h);
  });
  controlWin.on('closed', () => app.quit());
}

// ── Fenetre paysage ──────────────────────────────────────────────────────────
function createLandscapeWindow() {
  const saved   = configGet('landscapeWindow');
  const display = screen.getPrimaryDisplay();
  const sh      = display.workAreaSize.height;

  const w = saved.width  || 1280;
  const h = saved.height || 720;
  const x = saved.x !== null ? saved.x : 20;
  const y = saved.y !== null ? saved.y : Math.floor((sh - h) / 2);

  landscapeWin = new BrowserWindow({
    width: w, height: h, x, y,
    minWidth: 640, minHeight: 360,
    title: 'DualView - Paysage',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-view.js'),
      webviewTag: true,
    },
    autoHideMenuBar: true,
    resizable: true,
    show: false,
    backgroundColor: '#ffffff',
  });

  landscapeWin.loadFile(path.join(__dirname, 'landscape.html'));
  landscapeWin.once('ready-to-show', () => landscapeWin.show());

  landscapeWin.on('moved', () => {
    const [x, y] = landscapeWin.getPosition();
    configSet('landscapeWindow.x', x);
    configSet('landscapeWindow.y', y);
  });
  landscapeWin.on('resize', () => {
    const [w, h] = landscapeWin.getSize();
    configSet('landscapeWindow.width', w);
    configSet('landscapeWindow.height', h);
  });
  landscapeWin.on('closed', () => { landscapeWin = null; });
}

// ── Fenetre portrait ─────────────────────────────────────────────────────────
function createPortraitWindow() {
  const saved   = configGet('portraitWindow');
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;

  const w = saved.width  || 390;
  const h = saved.height || 844;
  const x = saved.x !== null ? saved.x : sw - w - 20;
  const y = saved.y !== null ? saved.y : Math.floor((sh - h) / 2);

  portraitWin = new BrowserWindow({
    width: w, height: h, x, y,
    minWidth: 280, minHeight: 400,
    title: 'DualView - Portrait',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-view.js'),
      webviewTag: true,
    },
    autoHideMenuBar: true,
    resizable: true,
    show: false,
    backgroundColor: '#ffffff',
  });

  portraitWin.loadFile(path.join(__dirname, 'portrait.html'));
  portraitWin.once('ready-to-show', () => portraitWin.show());

  portraitWin.on('moved', () => {
    const [x, y] = portraitWin.getPosition();
    configSet('portraitWindow.x', x);
    configSet('portraitWindow.y', y);
  });
  portraitWin.on('resize', () => {
    const [w, h] = portraitWin.getSize();
    configSet('portraitWindow.width', w);
    configSet('portraitWindow.height', h);
  });
  portraitWin.on('closed', () => { portraitWin = null; });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.on('navigate', (event, url) => {
  currentUrl = url;
  if (landscapeWin && !landscapeWin.isDestroyed()) landscapeWin.webContents.send('load-url', url);
  if (portraitWin  && !portraitWin.isDestroyed())  portraitWin.webContents.send('load-url', url);
});

ipcMain.on('sync-scroll', (event, scrollPercent) => {
  if (syncPaused) return;
  if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('apply-scroll', scrollPercent);
});

ipcMain.on('sync-navigate', (event, url) => {
  if (syncPaused) return;
  currentUrl = url;
  if (controlWin  && !controlWin.isDestroyed())  controlWin.webContents.send('update-addressbar', url);
  if (portraitWin && !portraitWin.isDestroyed()) portraitWin.webContents.send('load-url', url);
});

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
    const [w, h] = portraitWin.getSize();
    configSet('portraitWindow.width', w);
    configSet('portraitWindow.height', h);
  }
});

ipcMain.handle('get-version', () => app.getVersion());

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createControlWindow();
  createLandscapeWindow();
  createPortraitWindow();
  nativeTheme.on('updated', broadcastTheme);
});

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createControlWindow();
    createLandscapeWindow();
    createPortraitWindow();
  }
});
