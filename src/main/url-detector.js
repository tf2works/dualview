/**
 * DualView - URL Detector
 * Version: 0.4.2
 *
 * Responsabilité unique : classification d'URLs.
 *   - isLoginPage           : URL est-elle une page de connexion ?
 *   - isAuthUrl             : URL ne doit-elle jamais être synchronisée vers portrait ?
 *   - detectServiceKeyFromUrl : quel service correspond à cette URL ?
 *
 * Aucune dépendance Electron — testable de façon autonome.
 */

'use strict';

// ── Domaines et patterns ──────────────────────────────────────────────────────

/** Domaines exclus de la détection login (jamais de popup). */
const LOGIN_DETECTION_WHITELIST = [
    'localhost',
    '127.0.0.1',
];

/**
 * Domaines TOUJOURS considérés comme pages de login.
 * Pas besoin de vérifier les patterns d'URL sur ces domaines.
 */
const LOGIN_FORCED_DOMAINS = [
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

/** Patterns de chemin qui déclenchent la détection sur les autres domaines. */
const LOGIN_URL_PATTERNS = [
    /\/login\b/i,
    /\/signin\b/i,
    /\/sign-in\b/i,
    /\/sign_in\b/i,
    /\/auth\b/i,
    /\/oauth\b/i,
    /\/connexion\b/i,
    /\/identification\b/i,
    /\/compte\/connexion/i,
    /\/account\/login/i,
];

/**
 * Domaines d'authentification — ne jamais synchroniser vers portrait.
 *
 * IMPORTANT : ne lister ici QUE les domaines de LOGIN.
 * Ne pas inclure les destinations post-auth (outlook.live.com, office.com…)
 * qui arrivent dans portrait après une navigation légitime.
 */
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

// ── Fonctions publiques ───────────────────────────────────────────────────────

/**
 * Retourne true si l'URL correspond à une page de connexion connue.
 * Utilisé pour détecter les pages login dans les webviews et afficher le popup.
 */
function isLoginPage(url) {
    try {
        const u = new URL(url);

        // Exclure localhost / 127.0.0.1
        if (LOGIN_DETECTION_WHITELIST.some(d => u.hostname.includes(d))) return false;

        // Domaines forcés → toujours une page de login
        if (LOGIN_FORCED_DOMAINS.some(d =>
            u.hostname === d || u.hostname.endsWith('.' + d)
        )) return true;

        // Exclure les callbacks OAuth (destination finale, pas page de login)
        if (/\/callback|\/token|\/redirect/i.test(u.pathname)) return false;

        // Tester les patterns de chemin
        return LOGIN_URL_PATTERNS.some(re => re.test(u.pathname + u.search));
    } catch {
        return false;
    }
}

/**
 * Retourne true si l'URL est une page d'authentification qui ne doit JAMAIS
 * être synchronisée vers la fenêtre portrait.
 *
 * Vérifie uniquement le hostname (pas pathname) pour éviter les faux positifs
 * sur des destinations post-auth contenant des paramètres OAuth dans l'URL.
 */
function isAuthUrl(url) {
    try {
        const u = new URL(url);
        if (AUTH_DOMAINS.some(d =>
            u.hostname === d || u.hostname.endsWith('.' + d)
        )) return true;
        // isLoginPage filtre pathname+search mais exclut les domaines courants
        return isLoginPage(url);
    } catch {
        return false;
    }
}

/**
 * Détecte le serviceKey correspondant à une URL.
 * Retourne null si aucun service connu ne correspond.
 * Utilisé par le popup login pour proposer le bon bouton "Se connecter".
 *
 * @param  {string}      url
 * @returns {string|null}    serviceKey (ex: 'google', 'microsoft') ou null
 */
function detectServiceKeyFromUrl(url) {
    try {
        const h = new URL(url).hostname;
        if (h.includes('google.com'))                                                return 'google';
        if (h.includes('microsoft.com') || h.includes('live.com') ||
            h.includes('microsoftonline.com'))                                       return 'microsoft';
        if (h.includes('instagram.com'))                                             return 'instagram';
        if (h.includes('facebook.com'))                                              return 'facebook';
        if (h.includes('twitch.tv'))                                                 return 'twitch';
        if (h.includes('tiktok.com'))                                                return 'tiktok';
        if (h.includes('twitter.com') || h.includes('x.com'))                       return 'twitter';
        if (h.includes('discord.com'))                                               return 'discord';
        if (h.includes('steampowered.com'))                                          return 'steam';
    } catch { /* URL invalide */ }
    return null;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
    isLoginPage,
    isAuthUrl,
    detectServiceKeyFromUrl,
    // Constantes exportées pour usage ou tests externes
    AUTH_DOMAINS,
    LOGIN_FORCED_DOMAINS,
    LOGIN_URL_PATTERNS,
};
