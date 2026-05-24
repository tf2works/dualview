/**
 * DualView - Preload Auth Window
 * Version: 0.3.0
 *
 * Injecté dans la BrowserWindow d'authentification AVANT que la page de
 * login commence à charger. Neutralise les signaux de détection Electron.
 *
 * Signaux neutralisés :
 *  1. navigator.webdriver         → undefined (signal principal Google)
 *  2. navigator.userAgentData     → brands sans "Electron"
 *  3. window.chrome               → complété (app, runtime, csi, loadTimes)
 *  4. navigator.plugins/mimeTypes → 3 plugins PDF simulés (Chrome en a 2+)
 *  5. navigator.permissions       → query patché
 */
const { webFrame } = require('electron');

// Injection dans le main world (contexte de la page) avant tout script
webFrame.executeJavaScript(`
(function() {
    'use strict';

    // ── 1. navigator.webdriver ─────────────────────────────────────────────
    try {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
            configurable: true,
        });
    } catch(e) {}

    // ── 2. navigator.userAgentData (Client Hints) ──────────────────────────
    try {
        const chromiumVersion = (navigator.userAgent.match(/Chrome\\/(\\d+)/) || [])[1] || '124';
        const brands = [
            { brand: 'Google Chrome',  version: chromiumVersion },
            { brand: 'Chromium',       version: chromiumVersion },
            { brand: 'Not=A?Brand',    version: '99' },
        ];
        const uaDataOverride = {
            brands,
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: (hints) => Promise.resolve({
                brands, mobile: false, platform: 'Windows',
                platformVersion: '15.0.0', architecture: 'x86',
                bitness: '64', model: '',
                uaFullVersion: chromiumVersion + '.0.0.0',
                fullVersionList: brands.map(b => ({ brand: b.brand, version: b.version + '.0.0.0' })),
            }),
            toJSON: () => ({ brands, mobile: false, platform: 'Windows' }),
        };
        Object.defineProperty(navigator, 'userAgentData', {
            get: () => uaDataOverride,
            configurable: true,
        });
    } catch(e) {}

    // ── 3. window.chrome ───────────────────────────────────────────────────
    try {
        if (!window.chrome || !window.chrome.runtime) {
            window.chrome = {
                app: {
                    isInstalled: false,
                    InstallState: { DISABLED:'disabled', INSTALLED:'installed', NOT_INSTALLED:'not_installed' },
                    RunningState: { CANNOT_RUN:'cannot_run', READY_TO_RUN:'ready_to_run', RUNNING:'running' },
                    getDetails:  () => null,
                    getIsInstalled: () => false,
                    installState: (cb) => cb('not_installed'),
                    runningState: () => 'cannot_run',
                },
                runtime: {
                    OnInstalledReason: { CHROME_UPDATE:'chrome_update', INSTALL:'install', SHARED_MODULE_UPDATE:'shared_module_update', UPDATE:'update' },
                    OnRestartRequiredReason: { APP_UPDATE:'app_update', OS_UPDATE:'os_update', PERIODIC:'periodic' },
                    PlatformArch: { ARM:'arm', ARM64:'arm64', MIPS:'mips', MIPS64:'mips64', X86_32:'x86-32', X86_64:'x86-64' },
                    PlatformOs: { ANDROID:'android', CROS:'cros', LINUX:'linux', MAC:'mac', OPENBSD:'openbsd', WIN:'win' },
                    RequestUpdateCheckStatus: { NO_UPDATE:'no_update', THROTTLED:'throttled', UPDATE_AVAILABLE:'update_available' },
                    id: undefined,
                    connect: () => {},
                    sendMessage: () => {},
                },
                csi: () => ({ startE: Date.now(), onloadT: Date.now(), pageT: Date.now(), tran: 15 }),
                loadTimes: () => ({
                    requestTime: Date.now() / 1000,
                    startLoadTime: Date.now() / 1000,
                    commitLoadTime: Date.now() / 1000,
                    finishDocumentLoadTime: Date.now() / 1000,
                    finishLoadTime: Date.now() / 1000,
                    firstPaintTime: Date.now() / 1000,
                    firstPaintAfterLoadTime: 0,
                    navigationType: 'Other',
                    wasFetchedViaSpdy: false,
                    wasNpnNegotiated: false,
                    npnNegotiatedProtocol: 'unknown',
                    wasAlternateProtocolAvailable: false,
                    connectionInfo: 'http/1.1',
                }),
            };
        }
    } catch(e) {}

    // ── 4. Plugins simulés ─────────────────────────────────────────────────
    try {
        const fakePlugin = (name, desc, filename) => ({
            name, description: desc, filename, length: 1,
            item: () => null, namedItem: () => null,
            [0]: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf',
                   description: 'Portable Document Format', enabledPlugin: null },
        });
        const pluginArr = [
            fakePlugin('Chrome PDF Plugin',  'Portable Document Format', 'internal-pdf-viewer'),
            fakePlugin('Chrome PDF Viewer',  '', 'mhjfbmdgcfjbbpaeojofohoefgiehjai'),
            fakePlugin('Native Client',      '', 'internal-nacl-plugin'),
        ];
        Object.defineProperty(navigator, 'plugins', {
            get: () => Object.assign(pluginArr, {
                item: i => pluginArr[i] || null,
                namedItem: n => pluginArr.find(p => p.name === n) || null,
                refresh: () => {},
            }),
            configurable: true,
        });
        Object.defineProperty(navigator, 'mimeTypes', {
            get: () => ({
                length: 2,
                item: () => null,
                namedItem: () => null,
                [0]: { type:'application/pdf',                   suffixes:'pdf', description:'',                       enabledPlugin: pluginArr[0] },
                [1]: { type:'application/x-google-chrome-pdf',  suffixes:'pdf', description:'Portable Document Format', enabledPlugin: pluginArr[0] },
            }),
            configurable: true,
        });
    } catch(e) {}

    // ── 5. navigator.permissions ───────────────────────────────────────────
    try {
        const origQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (params) => {
            if (params && params.name === 'notifications') {
                return Promise.resolve({ state: Notification.permission, onchange: null });
            }
            return origQuery(params);
        };
    } catch(e) {}

})();
`).catch(() => { });