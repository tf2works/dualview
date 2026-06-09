/**
 * DualView - URL Guard
 *
 * Fonctions de validation et de classification des URLs :
 *   - sanitizeUrl        : valide qu'une URL est sûre (http/https/file)
 *   - isLoginPage        : détecte les pages de connexion par domaine ou pattern
 *   - isAuthUrl          : guard sync — URLs jamais transmises au portrait
 *   - detectServiceKeyFromUrl : identifie le service connu associé à une URL
 *
 * Extrait de main.js v0.4.5 pour améliorer la maintenabilité open source.
 */

'use strict';

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Vérifie qu'une URL est valide et utilise un protocole autorisé.
 * Retourne l'URL trimée ou null si invalide.
 */
function sanitizeUrl(url) {
    if (typeof url !== 'string') return null;
    url = url.trim();
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return null;
        return url;
    } catch { return null; }
}

// ── Détection pages de connexion ──────────────────────────────────────────────

// Domaines exclus de la détection (jamais de popup login)
const LOGIN_DETECTION_WHITELIST = [
    'localhost', '127.0.0.1',
];

// Domaines TOUJOURS considérés comme pages de login (sans vérifier les patterns)
const LOGIN_FORCED_DOMAINS = [
    'accounts.google.com',
    'login.microsoftonline.com', 'login.live.com', 'account.live.com',
    'www.facebook.com', 'www.instagram.com',
    'www.tiktok.com', 'twitter.com', 'x.com',
    'discord.com', 'store.steampowered.com',
    'login.steampowered.com', 'passport.twitch.tv',
];

// Patterns de chemin qui déclenchent la détection sur les autres domaines
const LOGIN_URL_PATTERNS = [
    /\/login\b/i, /\/signin\b/i, /\/sign-in\b/i, /\/sign_in\b/i,
    /\/auth\b/i, /\/oauth\b/i, /\/connexion\b/i, /\/identification\b/i,
    /\/compte\/connexion/i, /\/account\/login/i,
];

/**
 * Retourne true si l'URL correspond à une page de connexion.
 */
function isLoginPage(url) {
    try {
        const u = new URL(url);
        if (LOGIN_DETECTION_WHITELIST.some(d => u.hostname.includes(d))) return false;
        if (LOGIN_FORCED_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return true;
        // Exclure les callbacks OAuth (destination finale, pas une page de login)
        if (/\/callback|\/token|\/redirect/i.test(u.pathname)) return false;
        return LOGIN_URL_PATTERNS.some(re => re.test(u.pathname + u.search));
    } catch { return false; }
}

// ── Guard sync ────────────────────────────────────────────────────────────────

// Domaines d'authentification connus — ne jamais synchroniser vers portrait.
// AUTH_DOMAINS : domaines de LOGIN uniquement.
// Ne pas inclure les domaines de destination post-auth (outlook.live.com,
// office.com, etc.) — ces URLs arrivent dans portrait après une navigation
// légitime et ne doivent PAS être bloquées.
const AUTH_DOMAINS = [
    'accounts.google.com',
    'login.microsoftonline.com', 'login.live.com', 'account.live.com',
    'www.facebook.com',
    'www.instagram.com',
    'www.tiktok.com',
    'twitter.com', 'x.com',
    'discord.com',
    'store.steampowered.com', 'login.steampowered.com',
    'passport.twitch.tv',
];

/**
 * Retourne true si l'URL est une page d'authentification.
 * Ces URLs ne doivent jamais être envoyées au portrait (guard sync).
 */
function isAuthUrl(url) {
    try {
        const u = new URL(url);
        // Vérifier uniquement le hostname — PAS pathname ni search.
        // outlook.live.com/mail/ a un paramètre redirect_uri contenant
        // oauth2/authorize mais ce n'est PAS une page d'auth : c'est la
        // destination finale après connexion.
        if (AUTH_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return true;
        return isLoginPage(url);
    } catch { return false; }
}

// ── Identification de service ─────────────────────────────────────────────────

/**
 * Détecte le serviceKey correspondant à une URL.
 * Utilisé pour le bouton "Se connecter" du popup login.
 * Retourne null si aucun service connu ne correspond.
 */
function detectServiceKeyFromUrl(url) {
    try {
        const u = new URL(url);
        const h = u.hostname;
        if (h.includes('google.com'))                                                   return 'google';
        if (h.includes('microsoft.com') || h.includes('live.com') ||
            h.includes('microsoftonline.com'))                                          return 'microsoft';
        if (h.includes('instagram.com'))                                                return 'instagram';
        if (h.includes('facebook.com'))                                                 return 'facebook';
        if (h.includes('twitch.tv'))                                                    return 'twitch';
        if (h.includes('tiktok.com'))                                                   return 'tiktok';
        if (h.includes('twitter.com') || h.includes('x.com'))                          return 'twitter';
        if (h.includes('discord.com'))                                                  return 'discord';
        if (h.includes('steampowered.com'))                                             return 'steam';
    } catch { }
    return null;
}

module.exports = {
    sanitizeUrl,
    isLoginPage,
    isAuthUrl,
    detectServiceKeyFromUrl,
};