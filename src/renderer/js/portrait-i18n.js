/*
 * DualView - Traductions interface portrait
 * Version: 0.4.4
 *
 * Portrait n'a pas de panneau de paramètres propre ; les traductions
 * sont appliquées par applyPortraitTranslations() appelée depuis
 * portrait-app.js au démarrage et à chaque changement de langue.
 *
 * Pour ajouter une langue :
 *   1. Dupliquer le bloc 'en' avec le code ISO voulu (ex. 'de')
 *   2. Ajouter la même clé dans landscape-i18n.js → languageDesc
 *
 * Utilisé par : portrait.html (chargé via <script src>)
 * Dépendances : aucune
 */

const PORTRAIT_I18N = {
    fr: {
        // Indicateur sync (dynamique JS)
        syncActive:  '● Sync active',
        syncPaused:  '⏸ Sync pausée',
        // Overlay pub (dynamique JS)
        adCountdownMin:   (m, s)   => `⏱ ${m}:${s} restantes`,
        adCountdownSec:   (remaining) => `⏱ ${remaining}s restantes`,
        // Overlay redimensionnement (HTML statique via data-i18n)
        resizeMsg:        'Redimensionnez cette fenêtre',
        resizeSub:        'Cliquez Valider dans le contrôle pour reprendre',
        // Empty state (HTML statique via data-i18n)
        emptyTitle:       'Vue Portrait (Mobile)',
        emptySub:         'Entrez une URL dans la fenêtre de contrôle',
        // Overlay paramètres (HTML statique via data-i18n)
        settingsTitle:    'Personnalisation en cours',
        settingsSub:      'L\'utilisateur configure l\'application\ndans la fenêtre Paysage.\n\nLe stream reprendra automatiquement\ndès la fermeture des paramètres.',
        // Toast reprise (HTML statique via data-i18n)
        resumeToast:      '▶ Stream en cours de reprise…',
        // Overlay login (HTML statique via data-i18n)
        loginTitle:       'Page de connexion détectée\nSynchronisation en pause',
        loginSub:         'Connectez-vous dans la fenêtre Paysage.\nLa synchronisation reprendra automatiquement.',
        // Bouton remute (HTML statique via data-i18n)
        remuteAction:     '🔇 Remettre en mute',
        remuteAriaLabel:  'Son portrait actif',
        remuteActionTitle:'Remettre en mute',
        // Overlay pub (HTML statique via data-i18n)
        adTitle:          'Publicité en cours',
        adSub:            'Une publicité est diffusée\ndans la fenêtre paysage.',
    },
    en: {
        syncActive:  '● Sync active',
        syncPaused:  '⏸ Sync paused',
        adCountdownMin:   (m, s)   => `⏱ ${m}:${s} remaining`,
        adCountdownSec:   (remaining) => `⏱ ${remaining}s remaining`,
        resizeMsg:        'Resize this window',
        resizeSub:        'Click Apply in the control to resume',
        emptyTitle:       'Portrait View (Mobile)',
        emptySub:         'Enter a URL in the control window',
        settingsTitle:    'Customisation in progress',
        settingsSub:      'The user is configuring the application\nin the Landscape window.\n\nThe stream will resume automatically\nwhen settings are closed.',
        resumeToast:      '▶ Stream resuming…',
        loginTitle:       'Login page detected\nSync paused',
        loginSub:         'Sign in from the Landscape window.\nSync will resume automatically.',
        remuteAction:     '🔇 Mute again',
        remuteAriaLabel:  'Portrait audio active',
        remuteActionTitle:'Mute again',
        adTitle:          'Ad playing',
        adSub:            'An ad is playing\nin the landscape window.',
    }
};

let portraitLang = 'fr';
function tp(key, ...args) {
    const dict = PORTRAIT_I18N[portraitLang] || PORTRAIT_I18N.fr;
    const val = dict[key];
    if (typeof val === 'function') return val(...args);
    return val !== undefined ? val : key;
}

function applyPortraitTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = tp(key);
        if (val !== undefined) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = tp(el.getAttribute('data-i18n-title'));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        el.setAttribute('aria-label', tp(el.getAttribute('data-i18n-aria')));
    });
    document.documentElement.lang = portraitLang;
}
