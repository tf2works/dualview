// DualView — Tests de régression (P3-I — v0.8.0)
//
// Runner : node:test (intégré Node.js 18+, zéro dépendance externe)
// Lancement : npm test   (= node --test tests/)
//
// 5 tests couvrant les chemins critiques :
//   01. Structure des fichiers (aucun fichier clé ne doit manquer)
//   02. package.json version et scripts
//   03. Injection CSS/JS — logique de matching domaine/wildcard
//   04. Config-manager — defaults SETTINGS_DEFAULTS
//   05. url-guard — sanitizeUrl et détection de service

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'src');

// ── Helpers ───────────────────────────────────────────────────────────────────

function exists(rel) {
    return fs.existsSync(path.join(ROOT, rel));
}

/**
 * Charge le source d'un fichier JS renderer (pas de require Electron)
 * et évalue un extrait isolé pour en extraire une valeur.
 */
function loadRendererExport(relPath, extractFn) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    return extractFn(src);
}

// ── Test 01 — Structure des fichiers ─────────────────────────────────────────
// Vérifie que tous les fichiers livrés en v0.8.0 sont bien présents.

test('01 — structure : fichiers principaux présents', () => {
    const required = [
        'src/main.js',
        'src/core/config-manager.js',
        'src/core/url-guard.js',
        'src/renderer/landscape.html',
        'src/renderer/portrait.html',
        'src/renderer/css/landscape.css',
        'src/renderer/js/landscape-i18n.js',
        'src/renderer/js/landscape-views.js',
        'src/renderer/js/landscape-settings.js',
        // v0.8.0
        'src/renderer/js/landscape-injection.js',
        'tests/dualview.spec.js',
    ];
    for (const rel of required) {
        assert.ok(exists(rel), `Fichier manquant : ${rel}`);
    }
});

// ── Test 02 — package.json ────────────────────────────────────────────────────
// Vérifie que la version est 0.9.2 et que les scripts essentiels sont présents.

test('02 — package.json : version 0.9.2 et scripts corrects', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);

    assert.equal(pkg.version, '0.9.2', 'Version attendue : 0.9.2');
    assert.equal(pkg.main, 'src/main.js', 'main doit pointer sur src/main.js');
    assert.ok(pkg.scripts && pkg.scripts.start, 'Script "start" manquant');
    assert.ok(pkg.scripts && pkg.scripts.test,  'Script "test" manquant');
    assert.ok(
        pkg.devDependencies && pkg.devDependencies.electron,
        'electron manquant dans devDependencies'
    );
});

// ── Test 03 — Injection CSS/JS — logique de matching ─────────────────────────
// Extrait et évalue les fonctions _injDomainFromUrl et _injRuleMatches
// depuis landscape-injection.js (renderer, sans Electron).

test('03 — injection : matching domaine exact et wildcard', () => {
    const src = fs.readFileSync(
        path.join(ROOT, 'src/renderer/js/landscape-injection.js'), 'utf8'
    );

    // Évaluer le module dans un contexte sandbox minimal
    // (pas de require electron — JS renderer pur)
    // document est mocké pour neutraliser _setupInjectionListeners()
    // qui appelle getElementById au chargement ; les guards `if (el)` dans
    // le code assurent qu'aucune exception n'est levée si l'élément est null.
    const sandbox = {
        document:        { getElementById: () => null, addEventListener: () => {} },
        currentSettings: { userScripts: [] },
    };
    const wrapped = `(function(exports, document, currentSettings){\n${src}\n
        exports._injDomainFromUrl = _injDomainFromUrl;
        exports._injRuleMatches = _injRuleMatches;
    })(sandbox, sandbox.document, sandbox.currentSettings)`;

    // eslint-disable-next-line no-new-func
    new Function('sandbox', wrapped)(sandbox);

    const { _injDomainFromUrl, _injRuleMatches } = sandbox;

    // _injDomainFromUrl
    assert.equal(_injDomainFromUrl('https://www.github.com/foo'), 'github.com');
    assert.equal(_injDomainFromUrl('https://maps.google.com/'),    'maps.google.com');
    assert.equal(_injDomainFromUrl('not-a-url'),                   null);

    // _injRuleMatches — domaine exact
    const exactRule = { domain: 'github.com', enabled: true };
    assert.ok( _injRuleMatches(exactRule, 'https://github.com/settings'));
    assert.ok(!_injRuleMatches(exactRule, 'https://gitlab.com/foo'));

    // _injRuleMatches — wildcard *.google.com
    const wildcardRule = { domain: '*.google.com', enabled: true };
    assert.ok( _injRuleMatches(wildcardRule, 'https://maps.google.com/'));
    assert.ok( _injRuleMatches(wildcardRule, 'https://mail.google.com/'));
    assert.ok(!_injRuleMatches(wildcardRule, 'https://github.com/'));

    // _injRuleMatches — règle désactivée
    const offRule = { domain: 'github.com', enabled: false };
    assert.ok(!_injRuleMatches(offRule, 'https://github.com/'));
});

// ── Test 04 — Config-manager — SETTINGS_DEFAULTS ─────────────────────────────
// Vérifie que userScripts est bien dans les defaults (v0.8.0) et que
// les clés essentielles sont présentes, sans lancer Electron.

test('04 — config-manager : SETTINGS_DEFAULTS contient userScripts', () => {
    const src = fs.readFileSync(
        path.join(ROOT, 'src/core/config-manager.js'), 'utf8'
    );

    // Vérifier par analyse du source (pas de require electron)
    assert.ok(
        src.includes('userScripts'),
        'userScripts manquant dans SETTINGS_DEFAULTS'
    );
    assert.ok(src.includes('allowDownloads'),  'allowDownloads manquant');
    assert.ok(src.includes('searchEngineId'),  'searchEngineId manquant');
    assert.ok(src.includes('GITHUB_REPO'),     'GITHUB_REPO manquant');
    assert.ok(src.includes('PORTRAIT_PRESETS'),'PORTRAIT_PRESETS manquant');
    assert.ok(
        src.includes("userScripts:        [],"),
        'userScripts doit être initialisé à un tableau vide'
    );
});

// ── Test 05 — landscape-i18n.js — clés v0.8.0 ────────────────────────────────
// Vérifie que les clés de traduction des deux nouvelles features sont présentes
// dans les deux langues.

test('05 — i18n : clés v0.8.0 présentes en FR et EN', () => {
    const src = fs.readFileSync(
        path.join(ROOT, 'src/renderer/js/landscape-i18n.js'), 'utf8'
    );

    const keysRequired = [
        // Injection CSS/JS
        'settingsUserScripts',
        'usAddBtn',
        'usDomainRequired',
        'usSaved',
        'usDeleteConfirm',
        // Mode comparaison
        'compareMode',
        'compareModeOn',
        'compareModeOff',
        'compareLabelDesktop',
        'compareLabelMobile',
        'scCompareMode',
    ];

    for (const key of keysRequired) {
        assert.ok(
            src.includes(`${key}:`),
            `Clé i18n manquante : "${key}"`
        );
    }
});

// ── Test 06 — focusVideoSeek — pause/reprise autour du seek (v0.9.2) ─────────
// Garde de non-régression statique : le script injecté ne peut pas être
// exécuté ici (pas de vrai <video>/webview dans node:test), on vérifie donc
// par analyse de source que la séquence pause → seek → play est bien
// présente, pour éviter qu'un futur refactor ne réintroduise le bug
// "seek en lecture non synchronisé vers Portrait" (mode vidéo seule).
test('06 — landscape-webview : focusVideoSeek pause/reprend autour du seek', () => {
    const src = fs.readFileSync(
        path.join(ROOT, 'src/renderer/js/landscape-webview.js'), 'utf8'
    );

    const fnMatch = src.match(/function focusVideoSeek\(wv, t\)[\s\S]*?\n}/);
    assert.ok(fnMatch, 'Fonction focusVideoSeek introuvable');
    const fnSrc = fnMatch[0];

    assert.ok(/wasPlaying\s*=\s*!v\.paused/.test(fnSrc),
        'focusVideoSeek doit détecter si la vidéo jouait avant le seek');
    assert.ok(/if\s*\(\s*wasPlaying\s*\)\s*v\.pause\(\)/.test(fnSrc),
        'focusVideoSeek doit pauser la vidéo avant le seek si elle jouait');
    assert.ok(/v\.currentTime\s*=/.test(fnSrc),
        'focusVideoSeek doit toujours affecter currentTime');
    assert.ok(/setTimeout\([\s\S]*v\.play\(\)/.test(fnSrc),
        'focusVideoSeek doit relancer la lecture après le seek si elle jouait');
});