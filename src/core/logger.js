/**
 * DualView - Logger
 * Version: 0.5.4
 *
 * Système de logs centralisé — actif en permanence (toujours écrit dans dualview.log).
 *
 * v0.5.4 : suppression du mode --dev. Le logger écrit toujours dans userData.
 *   Ctrl+Maj+I ouvre les DevTools Electron nativement (toutes les fenêtres).
 *
 * - Écrit dans le dossier userData Electron (cross-platform) : dualview.log
 *     Windows : %AppData%/DualView/  |  macOS : ~/Library/Application Support/DualView/
 *     Linux   : ~/.config/DualView/
 * - Chaque entrée est horodatée et préfixée par la source :
 *     [main] [landscape] [portrait] [auth] [obs]
 * - Redirige console.log/warn/error de main.js vers le fichier
 */

const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const LOG_PATH = path.join(app.getPath('userData'), 'dualview.log');

let logStream = null;

// ── Initialisation ────────────────────────────────────────────────────────────
function init() {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    logStream = fs.createWriteStream(LOG_PATH, { flags: 'w', encoding: 'utf-8' });

    const startLine = `${'='.repeat(60)}\nDualView — session démarrée ${new Date().toISOString()}\n${'='.repeat(60)}\n`;
    logStream.write(startLine);

    // Rediriger console de main.js vers le fichier
    const orig = { log: console.log, warn: console.warn, error: console.error };
    console.log   = (...a) => { orig.log(...a);   write('main', 'LOG',   a); };
    console.warn  = (...a) => { orig.warn(...a);  write('main', 'WARN',  a); };
    console.error = (...a) => { orig.error(...a); write('main', 'ERROR', a); };

    log('main', 'LOG', ['Logger actif — fichier :', LOG_PATH]);
}

// ── Écriture ──────────────────────────────────────────────────────────────────
function write(source, level, args) {
    if (!logStream) return;
    const ts  = new Date().toISOString().replace('T', ' ').slice(0, 23);
    const msg = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a, null, 0); } catch { return String(a); }
    }).join(' ');
    logStream.write(`[${ts}] [${source.padEnd(9)}] [${level.padEnd(5)}] ${msg}\n`);
}

function log(source, level, args) {
    write(source, level, args);
}

// ── Export ────────────────────────────────────────────────────────────────────
module.exports = { init, log };