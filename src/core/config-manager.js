/**
 * DualView - Config Manager
 *
 * Gestion de la configuration persistante (dualview-config.json).
 * Fournit : constantes, loadConfig/saveConfig, configGet/configSet.
 *
 * Extrait de main.js v0.4.5 pour améliorer la maintenabilité open source.
 */

'use strict';

const { app } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Constantes ────────────────────────────────────────────────────────────────

const KNACK3_URL = 'https://marketplace.atlassian.com/vendors/920480808/';

const SETTINGS_DEFAULTS = {
    restoreTabs:        true,
    homepageMode:       'knack3',
    customHomepageUrl:  '',
    newTabMode:         'homepage',
    appearance:         'auto',
    language:           'fr',
    // Services connectés (custom uniquement ; connus = cookies)
    customServices:     [],  // [{ id, label, url, connected }]
    // Intégration OBS (v0.3.2)
    obsEnabled:         true,   // serveur de contrôle OBS actif au démarrage
    obsPort:            0,      // 0 = port libre choisi automatiquement
    // Moteur de recherche (v0.4.0)
    searchEngineId:     'duckduckgo',
    searchEngineUrl:    'https://duckduckgo.com/?q=',
    // Screenshot (v0.4.0)
    screenshotDir:      '',     // '' = dossier Images utilisateur par défaut
    // Portrait preset (v0.4.0)
    portraitPreset:     'iphone15',
    // Mute automatique portrait (v0.4.3)
    autoMutePortrait:   true,   // force video.muted=true dans portrait
};

// Préréglages de taille de la fenêtre portrait (v0.4.0)
const PORTRAIT_PRESETS = [
    { id: 'iphone15',  label: 'iPhone 15',  width: 390,  height: 844  },
    { id: 'pixel8',    label: 'Pixel 8',    width: 412,  height: 915  },
    { id: 'galaxys24', label: 'Galaxy S24', width: 360,  height: 780  },
    { id: 'ipad',      label: 'iPad',       width: 768,  height: 1024 },
];

const DEFAULTS = {
    landscapeWindow: { width: 1280, height: 720, x: null, y: null },
    portraitWindow:  { width: 390,  height: 844, x: null, y: null },
    tabs:            [{ id: 'tab-1', title: 'Onglet 1', url: '' }],
    activeTabId:     'tab-1',
    settings:        Object.assign({}, SETTINGS_DEFAULTS),
    appVersion:      '0.3.0',
};

// ── Chemin du fichier de config ───────────────────────────────────────────────
// app.getPath('userData') est disponible avant app.whenReady() sur Electron moderne.
const CONFIG_PATH = path.join(app.getPath('userData'), 'dualview-config.json');

// ── Chargement / sauvegarde ───────────────────────────────────────────────────

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw  = fs.readFileSync(CONFIG_PATH, 'utf8');
            const data = JSON.parse(raw);
            return Object.assign({}, DEFAULTS, data, {
                landscapeWindow: Object.assign({}, DEFAULTS.landscapeWindow, data.landscapeWindow),
                portraitWindow:  Object.assign({}, DEFAULTS.portraitWindow,  data.portraitWindow),
                settings:        Object.assign({}, SETTINGS_DEFAULTS,        data.settings),
            });
        }
    } catch (e) { console.warn('Config load error:', e.message); }
    return Object.assign({}, DEFAULTS, { settings: Object.assign({}, SETTINGS_DEFAULTS) });
}

function saveConfig(data) {
    try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.warn('Config save error:', e.message); }
}

// ── État interne ──────────────────────────────────────────────────────────────
let _config = loadConfig();

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Lit une valeur dans la config via un chemin pointé (ex. 'settings.language').
 * Retourne undefined si le chemin n'existe pas.
 */
function configGet(keyPath) {
    const keys = keyPath.split('.');
    let obj = _config;
    for (const k of keys) {
        if (obj == null || typeof obj !== 'object') return undefined;
        obj = obj[k];
    }
    return obj;
}

/**
 * Écrit une valeur dans la config et sauvegarde immédiatement sur disque.
 * Crée les objets intermédiaires manquants.
 */
function configSet(keyPath, value) {
    const keys = keyPath.split('.');
    let obj = _config;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    saveConfig(_config);
}

/**
 * Retourne une référence directe à l'objet config courant.
 * Utiliser configGet/configSet plutôt que de muter directement.
 */
function getConfig() { return _config; }

module.exports = {
    KNACK3_URL,
    SETTINGS_DEFAULTS,
    PORTRAIT_PRESETS,
    DEFAULTS,
    CONFIG_PATH,
    configGet,
    configSet,
    getConfig,
    loadConfig,
    saveConfig,
};