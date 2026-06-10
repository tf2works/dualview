/**
 * DualView - Favorites Manager
 * Version: 0.4.7
 *
 * Gestion des favoris (marque-pages) persistants.
 * Fichier : %AppData%/DualView/favorites.json
 *
 * Structure d'une entrée :
 *   { url, title, addedAt (ISO) }
 *
 * Règles :
 * - Max MAX_ENTRIES entrées
 * - Déduplication : même URL → mise à jour title + addedAt
 * - Suppression une à une uniquement (jamais en masse)
 * - Les URLs d'authentification ne sont jamais sauvegardées
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const MAX_ENTRIES = 500;

// Domaines d'auth à ne jamais mettre en favoris
const AUTH_DOMAINS_FAV = [
    'accounts.google.com',
    'login.microsoftonline.com', 'login.live.com', 'account.live.com',
    'www.facebook.com', 'www.instagram.com', 'www.tiktok.com',
    'twitter.com', 'x.com', 'discord.com',
    'store.steampowered.com', 'login.steampowered.com', 'passport.twitch.tv',
];

function isAuthUrl(url) {
    try {
        const u = new URL(url);
        if (AUTH_DOMAINS_FAV.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return true;
        if (/\/login\b|\/signin\b|\/sign-in\b|\/oauth\b|\/auth\b/i.test(u.pathname)) return true;
    } catch { }
    return false;
}

class FavoritesManager {
    constructor(userDataPath) {
        this._filePath = path.join(userDataPath, 'favorites.json');
        this._entries  = [];  // [{url, title, addedAt}] — du plus récent au plus ancien
        this._dirty    = false;
        this._saveTimer = null;
        this._load();
    }

    // ── Chargement ──────────────────────────────────────────────────────────────
    _load() {
        try {
            if (fs.existsSync(this._filePath)) {
                const raw    = fs.readFileSync(this._filePath, 'utf8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this._entries = parsed.filter(e =>
                        e && typeof e.url     === 'string' &&
                             typeof e.addedAt === 'string'
                    );
                }
            }
        } catch (e) {
            console.warn('[favorites] Erreur chargement:', e.message);
            this._entries = [];
        }
    }

    // ── Sauvegarde (différée 2 s) ────────────────────────────────────────────
    _scheduleSave() {
        this._dirty = true;
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            if (!this._dirty) return;
            this._dirty = false;
            try {
                fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
                fs.writeFileSync(this._filePath, JSON.stringify(this._entries, null, 2), 'utf8');
            } catch (e) {
                console.warn('[favorites] Erreur sauvegarde:', e.message);
            }
        }, 2000);
    }

    // Sauvegarde immédiate (appel à la fermeture de l'app)
    saveNow() {
        if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
        if (!this._dirty && fs.existsSync(this._filePath)) return;
        try {
            fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
            fs.writeFileSync(this._filePath, JSON.stringify(this._entries, null, 2), 'utf8');
            this._dirty = false;
        } catch (e) {
            console.warn('[favorites] Erreur sauvegarde finale:', e.message);
        }
    }

    // ── Ajout d'un favori ───────────────────────────────────────────────────────
    add({ url, title }) {
        if (!url || url === 'about:blank') return false;
        if (isAuthUrl(url)) return false;

        const now = new Date().toISOString();

        // Déduplication : même URL → mise à jour
        const existingIdx = this._entries.findIndex(e => e.url === url);
        if (existingIdx !== -1) {
            // Remettre en tête avec données mises à jour
            const [entry] = this._entries.splice(existingIdx, 1);
            entry.addedAt = now;
            entry.title   = title || entry.title || '';
            this._entries.unshift(entry);
            this._scheduleSave();
            return true; // déjà en favori, on le rafraîchit
        }

        // Limiter à MAX_ENTRIES (supprimer le plus ancien)
        if (this._entries.length >= MAX_ENTRIES) {
            this._entries.pop();
        }

        this._entries.unshift({ url, title: title || '', addedAt: now });
        this._scheduleSave();
        return true;
    }

    // ── Vérification ────────────────────────────────────────────────────────────
    isFavorite(url) {
        if (!url || url === 'about:blank') return false;
        return this._entries.some(e => e.url === url);
    }

    // ── Lecture ─────────────────────────────────────────────────────────────────
    getAll() {
        return this._entries.slice();
    }

    search(query, limit = 100) {
        const q = (query || '').trim().toLowerCase();
        if (!q) return this.getAll().slice(0, limit);
        return this._entries
            .filter(e =>
                e.url.toLowerCase().includes(q) ||
                (e.title && e.title.toLowerCase().includes(q))
            )
            .slice(0, limit);
    }

    // ── Suppression (une à une — jamais toutes) ──────────────────────────────
    deleteUrl(url) {
        const before = this._entries.length;
        this._entries = this._entries.filter(e => e.url !== url);
        if (this._entries.length !== before) this._scheduleSave();
    }
}

module.exports = FavoritesManager;