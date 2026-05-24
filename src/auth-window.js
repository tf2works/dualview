/**
 * DualView - Auth Window
 * Version: 0.3.0
 *
 * Gestion des fenêtres d'authentification pour les services connectés.
 * Chaque service ouvre une BrowserWindow modale indépendante avec la
 * session persist:dualview (cookies partagés avec les webviews).
 *
 * Stratégie de détection fin d'auth :
 *  - Services connus  : A (cookies) + C (URL hors marqueurs d'auth)
 *  - URL personnalisée : A (cookies) + B (bouton "J'ai terminé" + confirmation)
 */

const { BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');

// ── Définitions des services connus ──────────────────────────────────────────
const KNOWN_SERVICES = {
    google: {
        label: 'Google',
        url: 'https://accounts.google.com/signin',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        authDomains: ['accounts.google.com'],
        cookieNames: ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID'],
        cookieDomains: ['.google.com'],
    },
    microsoft: {
        label: 'Microsoft',
        url: 'https://login.microsoftonline.com/',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        authDomains: ['login.microsoftonline.com', 'login.live.com'],
        cookieNames: ['ESTSAUTH', 'ESTSAUTHPERSISTENT', 'MSISAuth', 'MSISAuthenticated'],
        cookieDomains: ['.microsoft.com', '.microsoftonline.com', '.live.com'],
    },
    instagram: {
        label: 'Instagram',
        url: 'https://www.instagram.com/accounts/login/',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        authDomains: ['www.instagram.com'],
        cookieNames: ['sessionid', 'ds_user_id', 'csrftoken'],
        cookieDomains: ['.instagram.com'],
    },
    facebook: {
        label: 'Facebook',
        url: 'https://www.facebook.com/login',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        authDomains: ['www.facebook.com'],
        cookieNames: ['c_user', 'xs', 'fr'],
        cookieDomains: ['.facebook.com'],
    },
    twitch: {
        label: 'Twitch',
        url: 'https://www.twitch.tv/login',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        authDomains: ['www.twitch.tv', 'passport.twitch.tv'],
        cookieNames: ['auth-token', 'twilight-user', 'persistent'],
        cookieDomains: ['.twitch.tv'],
    },
    tiktok: {
        label: 'TikTok',
        url: 'https://www.tiktok.com/login',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        authDomains: ['www.tiktok.com'],
        cookieNames: ['sessionid', 'sid_guard', 'uid_tt'],
        cookieDomains: ['.tiktok.com'],
    },
    twitter: {
        label: 'X / Twitter',
        url: 'https://twitter.com/i/flow/login',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        authDomains: ['twitter.com', 'x.com'],
        cookieNames: ['auth_token', 'ct0', 'twid'],
        cookieDomains: ['.twitter.com', '.x.com'],
    },
    discord: {
        label: 'Discord',
        url: 'https://discord.com/login',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        authDomains: ['discord.com'],
        cookieNames: ['__dcfduid', '__sdcfduid', 'OptanonConsent'],
        cookieDomains: ['.discord.com'],
    },
    steam: {
        label: 'Steam',
        url: 'https://store.steampowered.com/login/',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        authDomains: ['store.steampowered.com', 'login.steampowered.com'],
        cookieNames: ['steamLoginSecure', 'steamRememberLogin', 'sessionid'],
        cookieDomains: ['.steampowered.com'],
    },
};

// Marqueurs d'URL indiquant une page d'authentification
const AUTH_URL_MARKERS = [
    'login', 'signin', 'sign-in', 'sign_in', 'auth', 'oauth',
    'connect', 'sso', 'account', 'password', 'register', 'signup',
    'identification', 'connexion', 'authentification',
];

// Noms de cookies génériques indiquant une session active
const GENERIC_SESSION_COOKIE_NAMES = [
    'session', 'sessionid', 'sess', 'token', 'auth', 'sid',
    'user', 'uid', 'logged', 'access_token', 'refresh_token',
];

/**
 * Vérifie si une URL contient un marqueur d'authentification.
 */
function isAuthUrl(url) {
    try {
        const lower = url.toLowerCase();
        return AUTH_URL_MARKERS.some(marker => lower.includes(marker));
    } catch { return false; }
}

/**
 * Vérifie les cookies d'un service connu dans la session.
 * Retourne true si au moins un cookie de session est trouvé.
 */
async function checkKnownServiceCookies(serviceKey) {
    const svc = KNOWN_SERVICES[serviceKey];
    if (!svc) return false;
    try {
        const ses = session.fromPartition('persist:dualview');
        for (const domain of svc.cookieDomains) {
            const cookies = await ses.cookies.get({ domain: domain.replace(/^\./, '') });
            for (const cookie of cookies) {
                if (svc.cookieNames.some(name =>
                    cookie.name.toLowerCase() === name.toLowerCase()
                )) {
                    return true;
                }
            }
        }
    } catch (e) { console.warn('checkKnownServiceCookies error:', e.message); }
    return false;
}

/**
 * Vérifie les cookies génériques pour une URL personnalisée.
 * Retourne la liste des cookies suspects trouvés.
 */
async function checkGenericCookies(url) {
    try {
        const ses = session.fromPartition('persist:dualview');
        const parsed = new URL(url);
        const domain = parsed.hostname;
        const cookies = await ses.cookies.get({ domain });
        return cookies.filter(c =>
            GENERIC_SESSION_COOKIE_NAMES.some(name =>
                c.name.toLowerCase().includes(name)
            )
        );
    } catch (e) { console.warn('checkGenericCookies error:', e.message); }
    return [];
}

/**
 * Vérifie tous les services connus et retourne leur statut.
 * Utilisé pour l'affichage dans le panneau "Services connectés".
 */
async function checkAllServicesStatus() {
    const result = {};
    for (const key of Object.keys(KNOWN_SERVICES)) {
        result[key] = await checkKnownServiceCookies(key);
    }
    return result;
}

/**
 * Supprime les cookies d'un service (déconnexion).
 */
async function disconnectService(serviceKey, customUrl) {
    try {
        const ses = session.fromPartition('persist:dualview');
        if (serviceKey === 'custom' && customUrl) {
            const parsed = new URL(customUrl);
            const cookies = await ses.cookies.get({ domain: parsed.hostname });
            for (const c of cookies) {
                await ses.cookies.remove(`https://${parsed.hostname}`, c.name).catch(() => { });
            }
            return true;
        }
        const svc = KNOWN_SERVICES[serviceKey];
        if (!svc) return false;
        for (const domain of svc.cookieDomains) {
            const cleanDomain = domain.replace(/^\./, '');
            const cookies = await ses.cookies.get({ domain: cleanDomain });
            for (const c of cookies) {
                await ses.cookies.remove(`https://${cleanDomain}`, c.name).catch(() => { });
            }
        }
        return true;
    } catch (e) { console.warn('disconnectService error:', e.message); return false; }
}

/**
 * Ouvre une fenêtre d'authentification pour un service.
 * @param {Object} opts - { serviceKey, customUrl, customLabel, parentWin }
 * @returns {Promise<boolean>} - true si authentification réussie
 */
function openAuthWindow(opts) {
    const { serviceKey, customUrl, customLabel, parentWin } = opts;
    const isCustom = serviceKey === 'custom';
    const svc = isCustom ? null : KNOWN_SERVICES[serviceKey];
    const startUrl = isCustom ? customUrl : svc.url;
    const ua = isCustom
        ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        : svc.ua;
    const serviceLabel = isCustom ? (customLabel || 'Service personnalisé') : svc.label;

    return new Promise((resolve) => {
        const authWin = new BrowserWindow({
            width: 520,
            height: 700,
            title: `DualView — Connexion ${serviceLabel}`,
            parent: parentWin || null,
            modal: false,
            resizable: true,
            webPreferences: {
                partition: 'persist:dualview',
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
                // preload-auth.js neutralise tous les signaux de détection
                // Electron avant le chargement de la page (main world)
                preload: path.join(__dirname, 'preload-auth.js'),
            },
            autoHideMenuBar: true,
            show: false,
            backgroundColor: '#ffffff',
        });

        // UA desktop identique aux webviews landscape/portrait
        authWin.webContents.setUserAgent(ua);

        // Couche 4 : corriger les headers HTTP sec-ch-ua qui contiennent
        // "Electron" par défaut — vérifiés par Google côté serveur
        const authSes = session.fromPartition('persist:dualview');
        const headerHandler = (details, callback) => {
            const h = details.requestHeaders;
            // Supprimer le header Electron et reconstruire proprement
            delete h['sec-ch-ua'];
            const v = process.versions.chrome.split('.')[0];
            h['sec-ch-ua'] = `"Google Chrome";v="${v}", "Chromium";v="${v}", "Not=A?Brand";v="99"`;
            h['sec-ch-ua-mobile'] = '?0';
            h['sec-ch-ua-platform'] = '"Windows"';
            callback({ requestHeaders: h });
        };
        authSes.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, headerHandler);
        authWin.once('closed', () => {
            // Retirer le handler HTTP quand la fenêtre se ferme
            // (la session persist:dualview est partagée — éviter les fuites)
            try { authSes.webRequest.onBeforeSendHeaders(null); } catch (_) { }
        });

        authWin.once('ready-to-show', () => authWin.show());
        authWin.on('closed', () => resolve(false));

        let resolved = false;
        function finish(success) {
            if (resolved) return;
            resolved = true;
            if (!authWin.isDestroyed()) authWin.close();
            resolve(success);
        }

        // ── Détection automatique fin d'auth (services connus) ────────────────
        if (!isCustom) {
            authWin.webContents.on('did-navigate', async (event, url) => {
                // Stratégie C : l'URL ne contient plus de marqueur d'auth
                const onAuthDomain = svc.authDomains.some(d => url.includes(d));
                if (!onAuthDomain && !isAuthUrl(url)) {
                    // Vérifier les cookies (stratégie A)
                    const hasCookies = await checkKnownServiceCookies(serviceKey);
                    if (hasCookies) { finish(true); return; }
                }
                // Vérification par cookies même sur la page auth (ex: Google One-Tap)
                const hasCookies = await checkKnownServiceCookies(serviceKey);
                if (hasCookies) { finish(true); }
            });

            authWin.webContents.on('did-navigate-in-page', async (_, url) => {
                if (!isAuthUrl(url)) {
                    const hasCookies = await checkKnownServiceCookies(serviceKey);
                    if (hasCookies) { finish(true); }
                }
            });
        }

        // ── URL personnalisée : bouton "J'ai terminé" via IPC ─────────────────
        if (isCustom) {
            // Injecter le bouton "J'ai terminé" après chaque navigation
            authWin.webContents.on('dom-ready', () => {
                authWin.webContents.executeJavaScript(`
(function() {
    if (document.getElementById('__dv_auth_done_btn')) return;
    const btn = document.createElement('div');
    btn.id = '__dv_auth_done_btn';
    btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;' +
        'background:#0066cc;color:white;padding:10px 20px;border-radius:8px;' +
        'font-family:system-ui,sans-serif;font-size:14px;font-weight:600;' +
        'cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,0.3);user-select:none;';
    btn.textContent = '✓ J\\'ai terminé';
    btn.addEventListener('click', function() {
        window.__dvAuthDone = true;
    });
    document.body.appendChild(btn);
})(); true;
                `).catch(() => { });
            });

            // Poller pour détecter le clic sur "J'ai terminé"
            const pollInterval = setInterval(async () => {
                if (authWin.isDestroyed()) { clearInterval(pollInterval); return; }
                try {
                    const clicked = await authWin.webContents.executeJavaScript(
                        'window.__dvAuthDone === true'
                    );
                    if (clicked) {
                        clearInterval(pollInterval);
                        // Vérifier d'abord par cookies (stratégie A)
                        const genericCookies = await checkGenericCookies(
                            authWin.webContents.getURL()
                        );
                        // Envoyer signal à la fenêtre parente pour afficher la confirmation
                        if (parentWin && !parentWin.isDestroyed()) {
                            parentWin.webContents.send('auth-custom-confirm', {
                                serviceLabel,
                                hasCookies: genericCookies.length > 0,
                                cookieCount: genericCookies.length,
                            });
                        }
                        // Attendre la confirmation depuis le renderer parent
                        ipcMain.once('auth-custom-confirmed', (_, confirmed) => {
                            finish(confirmed);
                        });
                        ipcMain.once('auth-custom-cancelled', () => {
                            // Remettre le flag à false pour permettre un nouvel essai
                            authWin.webContents.executeJavaScript(
                                'window.__dvAuthDone = false; true;'
                            ).catch(() => { });
                        });
                    }
                } catch (_) { }
            }, 500);

            authWin.on('closed', () => clearInterval(pollInterval));
        }

        authWin.loadURL(startUrl);
    });
}

module.exports = {
    KNOWN_SERVICES,
    AUTH_URL_MARKERS,
    isAuthUrl,
    checkKnownServiceCookies,
    checkGenericCookies,
    checkAllServicesStatus,
    disconnectService,
    openAuthWindow,
};