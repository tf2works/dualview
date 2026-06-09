/**
 * DualView - Logger
 * Version: 0.3.1
 *
 * Système de logs centralisé.
 * Actif uniquement si l'argument --dev est passé : npm start -- --dev
 *
 * - Écrit dans le dossier userData Electron (cross-platform) : dualview.log
 *     Windows : %AppData%/DualView/  |  macOS : ~/Library/Application Support/DualView/
 *     Linux   : ~/.config/DualView/
 * - Chaque entrée est horodatée et préfixée par la source :
 *     [main] [landscape] [portrait] [auth]
 * - Redirige console.log/warn/error de main.js vers le fichier
 * - Reçoit les logs des renderers via IPC 'dev-log'
 * - En mode dev : ouvre DevTools des fenêtres principales au démarrage
 */

const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const IS_DEV = process.argv.includes('--dev');

const LOG_PATH = IS_DEV
    ? path.join(app.getPath('userData'), 'dualview.log')
    : null;

let logStream = null;

// ── Initialisation ────────────────────────────────────────────────────────────
function init() {
    if (!IS_DEV) return;

    // Remettre le fichier à zéro
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    logStream = fs.createWriteStream(LOG_PATH, { flags: 'w', encoding: 'utf-8' });

    const startLine = `${'='.repeat(60)}\nDualView -- session démarrée ${new Date().toISOString()}\n${'='.repeat(60)}\n`;
    logStream.write(startLine);

    // Rediriger console de main.js
    const orig = { log: console.log, warn: console.warn, error: console.error };
    console.log = (...a) => { orig.log(...a); write('main', 'LOG', a); };
    console.warn = (...a) => { orig.warn(...a); write('main', 'WARN', a); };
    console.error = (...a) => { orig.error(...a); write('main', 'ERROR', a); };

    log('main', 'LOG', ['Mode DEV actif — logs dans', LOG_PATH]);
}

// ── Écriture ──────────────────────────────────────────────────────────────────
function write(source, level, args) {
    if (!logStream) return;
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
    const msg = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a, null, 0); } catch { return String(a); }
    }).join(' ');
    logStream.write(`[${ts}] [${source.padEnd(9)}] [${level.padEnd(5)}] ${msg}\n`);
}

function log(source, level, args) {
    write(source, level, args);
}

// ── IPC depuis les renderers ──────────────────────────────────────────────────
function setupIpc() {
    if (!IS_DEV) return;
    ipcMain.on('dev-log', (event, { source, level, args }) => {
        write(source, level, args);
    });
}

// ── DevTools fenêtres ─────────────────────────────────────────────────────────
/**
 * Ouvre les DevTools des fenêtres principales au démarrage en mode dev.
 * F12 et Ctrl+F12 sont gérés côté renderer (landscape.html) via keydown,
 * car globalShortcut ne peut pas accéder aux webviews du renderer.
 * @param {object} wins - { landscapeWin, portraitWin }
 */
function setupDevTools(wins) {
    if (!IS_DEV) return;

    const { landscapeWin, portraitWin } = wins;

    // Ouvrir DevTools au démarrage pour landscape et portrait
    landscapeWin.webContents.openDevTools({ mode: 'detach' });
    if (portraitWin && !portraitWin.isDestroyed()) {
        portraitWin.webContents.openDevTools({ mode: 'detach' });
    }

    log('main', 'LOG', ['DevTools ouverts. F12=fenêtre landscape, Ctrl+F12=webview active (géré dans renderer).']);
}

// ── DevTools auth window ──────────────────────────────────────────────────────
function openAuthDevTools(authWin) {
    if (!IS_DEV) return;
    authWin.webContents.openDevTools({ mode: 'detach' });
}

// ── Export ────────────────────────────────────────────────────────────────────
module.exports = { IS_DEV, init, log, setupIpc, setupDevTools, openAuthDevTools };