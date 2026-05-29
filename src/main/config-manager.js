/**
 * DualView - Config Manager
 * Version: 0.4.2
 *
 * Responsabilité unique : lecture/écriture de dualview-config.json.
 * Expose loadConfig, saveConfig, configGet, configSet, et les constantes
 * DEFAULTS, SETTINGS_DEFAULTS, PORTRAIT_PRESETS, KNACK3_URL.
 *
 * Ce module ne dépend d'aucun autre module DualView (pas d'Electron,
 * pas de logger) — il peut donc être testé de façon autonome.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Constantes ────────────────────────────────────────────────────────────────

const KNACK3_URL = 'https://marketplace.atlassian.com/vendors/920480808/';

const PORTRAIT_PRESETS = [
    { id: 'iphone15',  label: 'iPhone 15',  width: 390,  height: 844  },
    { id: 'pixel8',    label: 'Pixel 8',    width: 412,  height: 915  },
    { id: 'galaxys24', label: 'Galaxy S24', width: 360,  height: 780  },
    { id: 'ipad',      label: 'iPad',       width: 768,  height: 1024 },
];

const SETTINGS_DEFAULTS = {
    restoreTabs:        true,
    homepageMode:       'knack3',
    customHomepageUrl:  '',
    newTabMode:         'homepage',
    appearance:         'auto',
    language:           'fr',
    customServices:     [],          // [{ id, label, url, connected }]
    // OBS (v0.3.2)
    obsEnabled:         true,
    obsPort:            0,           // 0 = port libre automatique
    // Moteur de recherche (v0.4.0)
    searchEngineId:     'duckduckgo',
    searchEngineUrl:    'https://duckduckgo.com/?q=',
    // Screenshot (v0.4.0)
    screenshotDir:      '',          // '' = dossier Images utilisateur
    // Portrait preset (v0.4.0)
    portraitPreset:     'iphone15',
};

const DEFAULTS = {
    landscapeWindow: { width: 1280, height: 720,  x: null, y: null },
    portraitWindow:  { width: 390,  height: 844,  x: null, y: null },
    tabs:            [{ id: 'tab-1', title: 'Onglet 1', url: '' }],
    activeTabId:     'tab-1',
    settings:        Object.assign({}, SETTINGS_DEFAULTS),
    appVersion:      '0.4.2',
};

// ── État interne ──────────────────────────────────────────────────────────────

let _configPath = null;
let _config     = null;

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Doit être appelé une fois au démarrage, avant tout accès à la config.
 * @param {string} userDataPath  app.getPath('userData')
 */
function init(userDataPath) {
    _configPath = path.join(userDataPath, 'dualview-config.json');
    _config     = _load();
}

// ── Lecture / écriture fichier ────────────────────────────────────────────────

function _load() {
    try {
        if (fs.existsSync(_configPath)) {
            const raw  = fs.readFileSync(_configPath, 'utf8');
            const data = JSON.parse(raw);
            return Object.assign({}, DEFAULTS, data, {
                landscapeWindow: Object.assign({}, DEFAULTS.landscapeWindow, data.landscapeWindow),
                portraitWindow:  Object.assign({}, DEFAULTS.portraitWindow,  data.portraitWindow),
                settings:        Object.assign({}, SETTINGS_DEFAULTS,        data.settings),
            });
        }
    } catch (e) {
        console.warn('[config] Erreur chargement:', e.message);
    }
    return Object.assign({}, DEFAULTS, { settings: Object.assign({}, SETTINGS_DEFAULTS) });
}

function _save() {
    try {
        fs.mkdirSync(path.dirname(_configPath), { recursive: true });
        fs.writeFileSync(_configPath, JSON.stringify(_config, null, 2), 'utf8');
    } catch (e) {
        console.warn('[config] Erreur sauvegarde:', e.message);
    }
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Lit une valeur par chemin pointé (ex: 'settings.appearance').
 * Retourne undefined si le chemin n'existe pas.
 */
function configGet(keyPath) {
    _assertInit();
    const keys = keyPath.split('.');
    let obj = _config;
    for (const k of keys) {
        if (obj == null || typeof obj !== 'object') return undefined;
        obj = obj[k];
    }
    return obj;
}

/**
 * Écrit une valeur par chemin pointé et persiste immédiatement.
 */
function configSet(keyPath, value) {
    _assertInit();
    const keys = keyPath.split('.');
    let obj = _config;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    _save();
}

/** Recharge la config depuis le disque (utile après une migration). */
function reload() {
    _assertInit();
    _config = _load();
}

/** Accès direct à l'objet config (lecture seule — utiliser configSet pour écrire). */
function getAll() {
    _assertInit();
    return _config;
}

function _assertInit() {
    if (!_configPath) throw new Error('[config] init() non appelé avant utilisation.');
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
    init,
    configGet,
    configSet,
    reload,
    getAll,
    // Constantes exportées pour usage dans d'autres modules
    KNACK3_URL,
    PORTRAIT_PRESETS,
    SETTINGS_DEFAULTS,
    DEFAULTS,
};
