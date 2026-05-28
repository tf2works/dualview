/**
 * DualView - History Manager
 * Version: 0.4.0
 *
 * Gestion de l'historique de navigation persistant.
 * Fichier : %AppData%/DualView/history.json
 *
 * Structure d'une entrée :
 *   { url, title, visitedAt (ISO), tabId }
 *
 * Règles :
 * - Max MAX_ENTRIES entrées (FIFO sur les plus anciennes)
 * - Déduplication : même URL + même tabId dans la même heure → mise à jour visitedAt
 * - Les URLs d'authentification ne sont jamais sauvegardées
 */

const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 5000;

// Domaines d'auth à ne jamais historiser
const AUTH_DOMAINS_HISTORY = [
    'accounts.google.com',
    'login.microsoftonline.com', 'login.live.com', 'account.live.com',
    'www.facebook.com', 'www.instagram.com', 'www.tiktok.com',
    'twitter.com', 'x.com', 'discord.com',
    'store.steampowered.com', 'login.steampowered.com', 'passport.twitch.tv',
];

function isAuthUrl(url) {
    try {
        const u = new URL(url);
        if (AUTH_DOMAINS_HISTORY.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return true;
        if (/\/login\b|\/signin\b|\/sign-in\b|\/oauth\b|\/auth\b/i.test(u.pathname)) return true;
    } catch { }
    return false;
}

class HistoryManager {
    constructor(userDataPath) {
        this._filePath = path.join(userDataPath, 'history.json');
        this._entries = [];   // [{url, title, visitedAt, tabId}] — du plus récent au plus ancien
        this._dirty = false;
        this._saveTimer = null;
        this._load();
    }

    // ── Chargement ──────────────────────────────────────────────────────────────
    _load() {
        try {
            if (fs.existsSync(this._filePath)) {
                const raw = fs.readFileSync(this._filePath, 'utf8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this._entries = parsed.filter(e =>
                        e && typeof e.url === 'string' &&
                        typeof e.visitedAt === 'string'
                    );
                }
            }
        } catch (e) {
            console.warn('[history] Erreur chargement:', e.message);
            this._entries = [];
        }
    }

    // ── Sauvegarde (différée 2 s pour grouper les écritures rapides) ────────────
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
                console.warn('[history] Erreur sauvegarde:', e.message);
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
            console.warn('[history] Erreur sauvegarde finale:', e.message);
        }
    }

    // ── Ajout d'une entrée ──────────────────────────────────────────────────────
    add({ url, title, tabId }) {
        if (!url || url === 'about:blank') return;
        if (isAuthUrl(url)) return;

        const now = new Date().toISOString();
        const hourKey = now.slice(0, 13); // YYYY-MM-DDTHH

        // Déduplication : même URL + même tabId dans la même heure → mise à jour
        const existingIdx = this._entries.findIndex(e =>
            e.url === url &&
            e.tabId === tabId &&
            e.visitedAt.slice(0, 13) === hourKey
        );

        if (existingIdx !== -1) {
            // Remettre en tête avec timestamp mis à jour
            const [entry] = this._entries.splice(existingIdx, 1);
            entry.visitedAt = now;
            entry.title = title || entry.title || '';
            this._entries.unshift(entry);
        } else {
            this._entries.unshift({ url, title: title || '', visitedAt: now, tabId: tabId || '' });
        }

        // Limiter à MAX_ENTRIES
        if (this._entries.length > MAX_ENTRIES) {
            this._entries.length = MAX_ENTRIES;
        }

        this._scheduleSave();
    }

    // ── Lecture ─────────────────────────────────────────────────────────────────

    /**
     * Toutes les entrées (du plus récent au plus ancien).
     * Utilisé par le panneau latéral.
     */
    getAll() {
        return this._entries.slice();
    }

    /**
     * Les N dernières entrées pour un tabId donné.
     * Utilisé par le dropdown ← → de l'onglet actif.
     */
    getByTab(tabId, limit = 10) {
        return this._entries
            .filter(e => e.tabId === tabId)
            .slice(0, limit);
    }

    /**
     * Recherche fulltext sur url + title.
     */
    search(query, limit = 100) {
        const q = query.trim().toLowerCase();
        if (!q) return this.getAll().slice(0, limit);
        return this._entries
            .filter(e =>
                e.url.toLowerCase().includes(q) ||
                (e.title && e.title.toLowerCase().includes(q))
            )
            .slice(0, limit);
    }

    // ── Suppression ─────────────────────────────────────────────────────────────

    /** Supprime toutes les occurrences d'une URL (tous tabIds). */
    deleteUrl(url) {
        const before = this._entries.length;
        this._entries = this._entries.filter(e => e.url !== url);
        if (this._entries.length !== before) this._scheduleSave();
    }

    /** Supprime une entrée précise par index. */
    deleteByIndex(index) {
        if (index < 0 || index >= this._entries.length) return;
        this._entries.splice(index, 1);
        this._scheduleSave();
    }

    /** Efface tout l'historique. */
    clearAll() {
        this._entries = [];
        this._scheduleSave();
    }

    /** Efface l'historique d'un onglet. */
    clearTab(tabId) {
        const before = this._entries.length;
        this._entries = this._entries.filter(e => e.tabId !== tabId);
        if (this._entries.length !== before) this._scheduleSave();
    }
}

module.exports = HistoryManager;