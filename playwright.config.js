// DualView — Configuration Playwright (P3-I — v0.8.0)
//
// Fichier à la racine du projet (emplacement standard Playwright).
// Tests dans tests/dualview.spec.js
//
// Lancement : npm test   (= playwright test)
// En local  : npx playwright test

'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    // Dossier contenant les fichiers de test
    testDir: './tests',

    // Timeout global par test (30s — l'app Electron prend ~3s à démarrer)
    timeout: 30_000,
    // Timeout pour chaque assertion expect()
    expect: { timeout: 8_000 },

    // Pas de parallélisme : une seule instance Electron à la fois
    workers: 1,
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,

    reporter: [
        ['list'],
        ['junit', { outputFile: 'test-results/results.xml' }],
    ],

    use: {
        screenshot: 'only-on-failure',
        video:      'off',
    },
});