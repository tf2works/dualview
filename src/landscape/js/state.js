/**
 * DualView - Landscape State
 * Version: 0.4.2
 *
 * État global partagé entre tous les modules renderer.
 * Exporté comme objet mutable — chaque module lit/écrit directement.
 *
 * RÈGLE : ne jamais importer state.js depuis main.js (Node.js).
 * Ce fichier est exclusivement renderer (navigateur Electron).
 */

'use strict';

// ── Constantes ────────────────────────────────────────────────────────────────

const SETTINGS_TAB_ID = '__settings__';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── État mutable ──────────────────────────────────────────────────────────────

let tabs = [];
let activeTabId = null;
let currentSyncState = 'paused';
let currentSettings = {};
const webviewPool = new Map();   // tabId → <webview>
const tabHistory  = new Map();   // tabId → string[] (URLs récentes en mémoire)
