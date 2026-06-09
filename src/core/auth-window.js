/**
 * DualView - Auth Window
 * Version: 0.3.3
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
const { EventEmitter } = require('events');
const logger = require('./logger');

// ── User-Agent desktop cross-platform ─────────────────────────────────────────
// Les services web (Google, Microsoft…) adaptent leur UI selon l'OS déclaré.
// On utilise le vrai OS pour éviter les incompatibilités de rendu.
function getDesktopUA() {
    const { platform } = process;
    if (platform === 'darwin') {
        return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }
    if (platform === 'linux') {
        return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
}

const UA_DESKTOP = getDesktopUA();



// Émetteur d'événements pour notifier main.js de la fin d'auth
// (évite un import circulaire)
const authWindowEvents = new EventEmitter();

// ── Définitions des services connus ──────────────────────────────────────────
const KNOWN_SERVICES = {
    google: {
        label: 'Google',
        url: 'https://accounts.google.com/signin',
        ua: UA_DESKTOP,
        authDomains: ['accounts.google.com'],
        cookieNames: ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID'],
        cookieDomains: ['.google.com'],
    },
    microsoft: {
        label: 'Microsoft',
        url: 'https://login.microsoftonline.com/',
        ua: UA_DESKTOP,
        // authDomains : uniquement les pages intermédiaires du flux auth.
        // login.microsoftonline.com/common/oauth2/* reste dans ce domaine
        // mais on tolère la fin de flux via détection cookies (stratégie A).
        authDomains: ['login.microsoftonline.com', 'login.live.com', 'account.live.com'],
        // ESTSAUTH + ESTSAUTHPERSISTENT créés sur login.microsoftonline.com
        cookieNames: ['ESTSAUTH', 'ESTSAUTHPERSISTENT', 'MSISAuth', 'MSISAuthenticated',
            'MUID', 'MicrosoftApplicationsTelemetryDeviceId'],
        // Domaines exacts où chercher les cookies (sans le point initial pour cookies.get)
        cookieDomains: ['login.microsoftonline.com', '.live.com', '.microsoft.com'],
        // URL de destination après login réussi (pour stratégie C)
        postAuthUrls: ['account.microsoft.com', 'office.com', 'outlook.live.com',
            'microsoft.com', 'live.com'],
        // Patterns dans l'URL qui indiquent que le flux auth est encore en cours
        // (utilisés pour ne pas déclencher le bouton "Je suis connecté" trop tôt)
        interimUrlPatterns: [
            'flowEntry', 'flowName', 'oauth2/authorize', 'oauth2/v2.0/authorize',
            '/kmsi', '/GetCredentialType', '/GetOneTimeCode',
            'login_hint', 'prompt=login',
        ],
    },
    instagram: {
        label: 'Instagram',
        url: 'https://www.instagram.com/accounts/login/',
        ua: UA_DESKTOP,
        authDomains: ['www.instagram.com'],
        cookieNames: ['sessionid', 'ds_user_id', 'csrftoken'],
        cookieDomains: ['.instagram.com'],
    },
    facebook: {
        label: 'Facebook',
        url: 'https://www.facebook.com/login',
        ua: UA_DESKTOP,
        authDomains: ['www.facebook.com'],
        cookieNames: ['c_user', 'xs', 'fr'],
        cookieDomains: ['.facebook.com'],
    },
    twitch: {
        label: 'Twitch',
        url: 'https://www.twitch.tv/login',
        ua: UA_DESKTOP,
        authDomains: ['www.twitch.tv', 'passport.twitch.tv'],
        cookieNames: ['auth-token', 'twilight-user', 'persistent'],
        cookieDomains: ['.twitch.tv'],
    },
    tiktok: {
        label: 'TikTok',
        url: 'https://www.tiktok.com/login',
        ua: UA_DESKTOP,
        authDomains: ['www.tiktok.com'],
        cookieNames: ['sessionid', 'sid_guard', 'uid_tt'],
        cookieDomains: ['.tiktok.com'],
    },
    twitter: {
        label: 'X / Twitter',
        url: 'https://twitter.com/i/flow/login',
        ua: UA_DESKTOP,
        authDomains: ['twitter.com', 'x.com'],
        cookieNames: ['auth_token', 'ct0', 'twid'],
        cookieDomains: ['.twitter.com', '.x.com'],
    },
    discord: {
        label: 'Discord',
        url: 'https://discord.com/login',
        ua: UA_DESKTOP,
        authDomains: ['discord.com'],
        cookieNames: ['__dcfduid', '__sdcfduid', 'OptanonConsent'],
        cookieDomains: ['.discord.com'],
    },
    steam: {
        label: 'Steam',
        url: 'https://store.steampowered.com/login/',
        ua: UA_DESKTOP,
        authDomains: ['store.steampowered.com', 'login.steampowered.com'],
        cookieNames: ['steamLoginSecure', 'steamRememberLogin', 'sessionid'],
        cookieDomains: ['.steampowered.com'],
    },
    github: {
        label: 'GitHub',
        url: 'https://github.com/login',
        ua: UA_DESKTOP,
        authDomains: ['github.com'],
        cookieNames: ['user_session', '__Host-user_session_same_site', 'dotcom_user', 'logged_in'],
        cookieDomains: ['.github.com'],
    },
    gitlab: {
        label: 'GitLab',
        url: 'https://gitlab.com/users/sign_in',
        ua: UA_DESKTOP,
        authDomains: ['gitlab.com'],
        cookieNames: ['_gitlab_session', 'known_sign_in', 'event_filter'],
        cookieDomains: ['.gitlab.com'],
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
            logger.log('auth', 'LOG', [
                `checkCookies [${serviceKey}] domain=${domain}`,
                `found=${cookies.length}`,
                `names=[${cookies.map(c => c.name).join(',')}]`
            ]);
            for (const cookie of cookies) {
                if (svc.cookieNames.some(name =>
                    cookie.name.toLowerCase() === name.toLowerCase()
                )) {
                    logger.log('auth', 'LOG', [`checkCookies [${serviceKey}] MATCH: ${cookie.name}`]);
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn('checkKnownServiceCookies error:', e.message);
        logger.log('auth', 'ERROR', ['checkKnownServiceCookies:', e.message]);
    }
    logger.log('auth', 'LOG', [`checkCookies [${serviceKey}] → NO MATCH`]);
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

// Domaines supplémentaires à purger pour chaque service
// (au-delà des cookieDomains principaux)
const DISCONNECT_EXTRA_DOMAINS = {
    microsoft: [
        'login.microsoftonline.com', 'login.live.com', 'account.live.com',
        'account.microsoft.com', 'outlook.live.com', 'office.com',
        'microsoftonline.com', 'microsoft.com', 'live.com',
    ],
    google: [
        'accounts.google.com', 'google.com', 'youtube.com',
        'googleapis.com', 'gstatic.com',
    ],
    github: [
        'github.com', 'api.github.com', 'avatars.githubusercontent.com',
    ],
    gitlab: [
        'gitlab.com', 'auth.gitlab.com',
    ],
};

/**
 * Supprime TOUS les cookies d'un service (déconnexion complète).
 * Pour Microsoft : purge étendue sur tous les domaines du flux OAuth
 * pour éviter que les cookies résiduels déclenchent une reconnexion
 * automatique au prochain openAuthWindow.
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

        // Collecter tous les domaines à purger
        const allDomains = new Set([
            ...svc.cookieDomains.map(d => d.replace(/^\./, '')),
            ...(DISCONNECT_EXTRA_DOMAINS[serviceKey] || []),
        ]);

        logger.log('auth', 'LOG', [`disconnectService [${serviceKey}] domains: ${[...allDomains].join(', ')}`]);

        for (const domain of allDomains) {
            const cookies = await ses.cookies.get({ domain }).catch(() => []);
            for (const c of cookies) {
                // Essayer http et https pour être sûr
                await ses.cookies.remove(`https://${domain}`, c.name).catch(() => { });
                await ses.cookies.remove(`http://${domain}`, c.name).catch(() => { });
            }
        }

        // Pour Microsoft : vider aussi le storage de session Chromium
        // (tokens MSAL stockés dans localStorage/sessionStorage)
        // en forçant un flush des cookies de session
        await ses.cookies.flushStore().catch(() => { });
        logger.log('auth', 'LOG', [`disconnectService [${serviceKey}] → terminé`]);
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
        ? UA_DESKTOP
        : svc.ua;
    const serviceLabel = isCustom ? (customLabel || 'Service personnalisé') : svc.label;

    return new Promise((resolve) => {
        const authWin = new BrowserWindow({
            width: 520,
            height: 700,
            title: `DualView — Connexion ${serviceLabel}`,
            icon: process.platform === 'darwin'
                ? path.join(__dirname, '../..', 'assets', 'icon.icns')
                : process.platform === 'linux'
                    ? path.join(__dirname, '../..', 'assets', 'icon.png')
                    : path.join(__dirname, '../..', 'assets', 'icon.ico'),
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
                preload: path.join(__dirname, '../preload/preload-auth.js'),
            },
            autoHideMenuBar: true,
            show: false,
            backgroundColor: '#ffffff',
        });

        // UA desktop identique aux webviews landscape/portrait
        authWin.webContents.setUserAgent(ua);

        authWin.once('ready-to-show', () => {
            authWin.show();
            logger.log('auth', 'LOG', [`authWin ouvert: ${serviceLabel} → ${startUrl}`]);
            // Mode dev : ouvrir DevTools de la fenêtre auth
            logger.openAuthDevTools(authWin);
        });
        authWin.on('closed', () => {
            logger.log('auth', 'LOG', [`authWin fermé: ${serviceLabel} resolved=${resolved}`]);
            resolve(false);
        });

        let resolved = false;
        function finish(success) {
            if (resolved) return;
            resolved = true;
            if (!authWin.isDestroyed()) authWin.close();
            // BUG-1 fix : notifier main pour recharger portrait après auth réussie
            if (success) {
                // Émettre via ipcMain pour que main.js recharge portrait
                authWindowEvents.emit('auth-success', { serviceKey, serviceLabel });
            }
            resolve(success);
        }

        // ── Détection automatique fin d'auth + bouton fallback (services connus) ──
        if (!isCustom) {
            let stabilityTimer = null;   // Timer de stabilité réseau (2s sans navigation)
            let fallbackBtnShown = false;  // Bouton "Je suis connecté" déjà affiché ?
            let lastUrl = '';     // Dernière URL observée

            // ── Bouton "Je suis connecté" (filet de sécurité) ─────────────────
            // Affiché quand la navigation est stable mais la détection auto échoue
            function injectFallbackBtn() {
                if (fallbackBtnShown || resolved || authWin.isDestroyed()) return;
                fallbackBtnShown = true;
                logger.log('auth', 'LOG', [`[${serviceKey}] Injection bouton fallback`]);
                authWin.webContents.executeJavaScript(`
(function() {
    if (document.getElementById('__dv_connected_btn')) return;
    const btn = document.createElement('div');
    btn.id = '__dv_connected_btn';
    btn.style.cssText = [
        'position:fixed', 'bottom:16px', 'right:16px', 'z-index:2147483647',
        'background:#107c10', 'color:white', 'padding:10px 20px',
        'border-radius:8px', 'font-family:system-ui,sans-serif',
        'font-size:14px', 'font-weight:600', 'cursor:pointer',
        'box-shadow:0 2px 12px rgba(0,0,0,0.35)', 'user-select:none',
        'display:flex', 'align-items:center', 'gap:8px',
    ].join(';');
    btn.innerHTML = '<span style="font-size:18px">✓</span><span>Je suis connecté</span>';
    btn.addEventListener('click', function() {
        window.__dvManualConnected = true;
    });
    document.body.appendChild(btn);
})(); true;
                `).catch(() => { });
            }

            // ── Vérification stabilité → confirmation obligatoire ──────────
            // Appelée après chaque navigation. Déclenche un timer de 2s.
            // Si navigation stable : demander confirmation à l'utilisateur
            // (jamais de fermeture silencieuse — évite de couper le 2FA).
            // Si l'utilisateur confirme → finish(true).
            // Si l'utilisateur refuse → afficher le bouton "Je suis connecté".
            let confirmPending = false;  // Dialog de confirmation déjà affichée ?

            function askConfirmation() {
                if (confirmPending || resolved || authWin.isDestroyed()) return;
                confirmPending = true;
                logger.log('auth', 'LOG', [`[${serviceKey}] Demande confirmation utilisateur`]);
                checkKnownServiceCookies(serviceKey).then(hasCookies => {
                    if (parentWin && !parentWin.isDestroyed()) {
                        parentWin.webContents.send('auth-custom-confirm', {
                            serviceLabel,
                            hasCookies,
                            cookieCount: hasCookies ? 1 : 0,
                        });
                    }
                    ipcMain.once('auth-custom-confirmed', (_, confirmed) => {
                        confirmPending = false;
                        if (confirmed) {
                            finish(true);
                        } else {
                            // L'utilisateur n'a pas encore fini (ex: 2FA en attente)
                            // → afficher le bouton pour qu'il valide manuellement
                            logger.log('auth', 'LOG', [`[${serviceKey}] Refus → bouton fallback`]);
                            injectFallbackBtn();
                        }
                    });
                    ipcMain.once('auth-custom-cancelled', () => {
                        confirmPending = false;
                        // Annulation = même chose que refus
                        injectFallbackBtn();
                    });
                });
            }

            function onNavigationSettled(url) {
                clearTimeout(stabilityTimer);
                lastUrl = url;

                // Ne pas démarrer le timer si on est clairement en cours de flux
                const isInterim = svc.interimUrlPatterns &&
                    svc.interimUrlPatterns.some(p => url.includes(p));
                if (isInterim) {
                    logger.log('auth', 'LOG', [`[${serviceKey}] URL intermédiaire, timer ignoré: ${url}`]);
                    return;
                }

                stabilityTimer = setTimeout(() => {
                    if (resolved || authWin.isDestroyed()) return;
                    logger.log('auth', 'LOG', [`[${serviceKey}] Navigation stable 2s: ${url}`]);
                    // Demander confirmation — jamais de fermeture silencieuse
                    askConfirmation();
                }, 2000);
            }

            // ── Poller : bouton fallback + cookies ────────────────────────────
            const pollInterval = setInterval(async () => {
                if (resolved || authWin.isDestroyed()) {
                    clearInterval(pollInterval);
                    return;
                }

                // 1. Vérifier si l'utilisateur a cliqué "Je suis connecté"
                if (fallbackBtnShown) {
                    try {
                        const clicked = await authWin.webContents.executeJavaScript(
                            'window.__dvManualConnected === true'
                        );
                        if (clicked) {
                            clearInterval(pollInterval);
                            clearTimeout(stabilityTimer);
                            // Demander confirmation à la fenêtre parente
                            const hasCookies = await checkKnownServiceCookies(serviceKey);
                            if (parentWin && !parentWin.isDestroyed()) {
                                parentWin.webContents.send('auth-custom-confirm', {
                                    serviceLabel,
                                    hasCookies,
                                    cookieCount: hasCookies ? 1 : 0,
                                });
                            }
                            ipcMain.once('auth-custom-confirmed', (_, confirmed) => {
                                finish(confirmed);
                            });
                            ipcMain.once('auth-custom-cancelled', () => {
                                // Remettre le flag + réafficher le bouton
                                authWin.webContents.executeJavaScript(
                                    'window.__dvManualConnected = false; true;'
                                ).catch(() => { });
                            });
                            return;
                        }
                    } catch (_) { }
                }

                // Note : plus de fermeture automatique sur postAuthUrls
                // → toujours passer par askConfirmation() via onNavigationSettled
            }, 600);

            // ── Événements de navigation ───────────────────────────────────────
            authWin.webContents.on('did-navigate', (event, url) => {
                logger.log('auth', 'LOG', [`authWin did-navigate [${serviceKey}]: ${url}`]);
                // Réinitialiser le bouton si l'utilisateur navigue (ex: retour arrière)
                if (fallbackBtnShown) {
                    fallbackBtnShown = false;
                    authWin.webContents.executeJavaScript(
                        'const b=document.getElementById("__dv_connected_btn");if(b)b.remove();' +
                        'window.__dvManualConnected=false;true;'
                    ).catch(() => { });
                }
                onNavigationSettled(url);
            });

            authWin.webContents.on('did-navigate-in-page', (_, url) => {
                logger.log('auth', 'LOG', [`authWin did-navigate-in-page [${serviceKey}]: ${url}`]);
                onNavigationSettled(url);
            });

            authWin.webContents.on('did-stop-loading', () => {
                // did-stop-loading = réseau calme ; relancer le timer de stabilité
                // si une URL est déjà connue (évite le déclenchement au chargement initial)
                if (lastUrl && !resolved) onNavigationSettled(lastUrl);
            });

            authWin.once('closed', () => {
                clearInterval(pollInterval);
                clearTimeout(stabilityTimer);
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
    authWindowEvents,
    checkKnownServiceCookies,
    checkGenericCookies,
    checkAllServicesStatus,
    disconnectService,
    openAuthWindow,
};