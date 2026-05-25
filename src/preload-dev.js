/**
 * DualView - Preload Dev
 * Version: 0.3.1
 *
 * Injecté dans landscape.html et portrait.html uniquement en mode --dev.
 * Redirige console.log/warn/error vers main.js via IPC 'dev-log',
 * qui les écrit dans dualview.log avec le préfixe source correct.
 *
 * NB : ce preload n'est chargé que si IS_DEV=true dans main.js.
 * En production le fichier est présent mais jamais chargé.
 */

const { ipcRenderer } = require('electron');

// Source injectée par main.js via additionalArguments
const SOURCE = process.argv.find(a => a.startsWith('--dev-source='))
    ?.replace('--dev-source=', '') || 'renderer';

function forward(level, args) {
    // Sérialiser les arguments (éviter les objets non-clonable)
    const safe = args.map(a => {
        if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack}`;
        if (typeof a === 'object') {
            try { return JSON.stringify(a, null, 0); } catch { return String(a); }
        }
        return String(a);
    });
    ipcRenderer.send('dev-log', { source: SOURCE, level, args: safe });
}

const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

console.log = (...a) => { orig.log(...a); forward('LOG', a); };
console.warn = (...a) => { orig.warn(...a); forward('WARN', a); };
console.error = (...a) => { orig.error(...a); forward('ERROR', a); };

// Capturer les erreurs non gérées du renderer
window.addEventListener('error', (e) => {
    forward('ERROR', [`Uncaught: ${e.message}`, `at ${e.filename}:${e.lineno}`]);
});
window.addEventListener('unhandledrejection', (e) => {
    forward('ERROR', [`UnhandledRejection: ${e.reason}`]);
});