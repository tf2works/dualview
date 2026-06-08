/*
 * DualView - Traductions interface paysage
 * Version: 0.4.4
 *
 * Ajouter une langue :
 *   1. Dupliquer le bloc 'en' et lui donner un code ISO (ex. 'de')
 *   2. Ajouter l'option correspondante dans settings > Langue (landscape.html)
 *   3. La fonction t(key) sélectionne automatiquement la langue active
 *
 * Utilisé par : landscape.html (chargé via <script src>)
 * Dépendances : aucune
 */

// ── Traductions ────────────────────────────────────────────────────────────────
const I18N = {
    fr: {
        syncActive: 'Sync active', syncPaused: 'Sync pausée', syncStarting: 'Sync…',
        syncPauseAction: 'Mettre en pause', syncResumeAction: 'Reprendre', syncRestartAction: 'Redémarrer',
        adblockActive: 'Bloqueur pub actif', newTab: 'Nouvel onglet',
        landscapeView: 'Vue Paysage (Desktop)', enterUrl: "Entrez une URL dans la barre d'adresse",
        downloadBlocked: 'Téléchargement non autorisé', addressPlaceholder: 'https://exemple.com',
        resize: 'Redimensionner', settings: 'Paramètres',
        history: 'Historique',
        settingsGeneral: 'Général', settingsAppearance: 'Apparence', settingsLanguage: 'Langue',
        settingsServices: 'Services connectés', settingsPrivacy: 'Confidentialité',
        restoreTabs: 'Ouvrir les fenêtres et onglets précédents',
        restoreTabsDesc: 'Au démarrage, restaure les onglets et URL de la session précédente.',
        autoPauseLabel: 'Pause automatique des vidéos YouTube',
        autoPauseDesc: 'Pause la vidéo au lancement (classique et Shorts). La pub joue librement ; la vraie vidéo est pausée à la fin de la pub.',
        autoMutePortraitLabel: 'Mute automatique portrait',
        autoMutePortraitDesc: 'Force le silence dans la fenêtre portrait. Un bouton d\'alerte s\'affiche si le son s\'active accidentellement.',
        homepageLabel: "Page d'accueil et nouvelles fenêtres", homepageDesc: "Page affichée au démarrage et sur le bouton accueil.",
        homepageKnack3: "Page d'accueil Knack3 (par défaut)", homepageCustom: 'Adresse web personnalisée', homepageEmpty: 'Page vide',
        newTabLabel: 'Nouveaux onglets', newTabHomepage: "Page d'accueil sélectionnée", newTabEmpty: 'Page vide',
        customUrlPlaceholder: 'https://exemple.com', validateBtn: 'Valider',
        urlValid: "URL valide — page d'accueil mise à jour.", urlInvalid: 'Seules les URL sont autorisées (http:// ou https://).',
        appearanceLabel: 'Apparence des sites web', appearanceDesc: "Applique le thème aux sites visités et à l'interface DualView.",
        appearanceAuto: 'Automatique (suit le système)', appearanceLight: 'Clair', appearanceDark: 'Sombre',
        languageLabel: "Langue de l'interface", languageDesc: "Langue utilisée pour l'interface DualView.",
        langFr: 'Français', langEn: 'English',
        servicesDesc: 'Connectez-vous à vos services pour naviguer sans interruption.',
        servicesLoading: 'Vérification des connexions…', servicesCustom: 'Service personnalisé',
        servicesCustomDesc: 'Ajoutez un service non listé.', servicesAddCustom: 'Ajouter un service',
        servicesConnect: 'Connecter', servicesConnected: 'Connecté', servicesNotConnected: 'Non connecté',
        servicesReconnect: 'Se reconnecter', servicesDisconnect: 'Déconnecter',
        servicesConnecting: 'Connexion en cours…', servicesSuccess: 'Connecté avec succès.',
        servicesFailed: 'Connexion non confirmée.', servicesDeleted: 'Service supprimé.',
        privacyDownloads: 'Téléchargements', privacyDownloadsDesc: "Les téléchargements sont désactivés. Exception : enregistrement d'image via clic droit (→ Enregistrer l'image sous…).",
        privacyPermissions: 'Permissions', privacyPermissionsDesc: 'Caméra, microphone, géolocalisation et notifications sont bloqués.',
        privacySchemes: 'Navigation sécurisée', privacySchemesDesc: 'Seuls les protocoles http://, https:// et file:// sont autorisés.',
        privacyShorts: 'YouTube Shorts', privacyShortsDesc: 'Le bloqueur de publicités est désactivé sur YouTube Shorts (pas de pré-roll).',
        restartTitle: 'Redémarrage requis',
        restartAppearanceDesc: "Le thème sera appliqué au prochain démarrage. Redémarrer maintenant ?",
        restartLanguageDesc: "La langue sera appliquée au prochain démarrage. Redémarrer maintenant ?",
        loginPopupTitle: 'Connexion requise',
        loginPopupDesc: "Pour continuer sans difficulté, il est recommandé d'enregistrer ce service dans Services connectés.",
        loginPopupBack: 'Retour', loginPopupConnect: 'Se connecter', loginPopupServices: 'Services connectés',
        ignoreConfirmTitle: 'Continuer sans connexion ?',
        ignoreConfirmDesc: "Pour se connecter sans difficulté, il est recommandé d'ajouter un service connecté. Voulez-vous toujours ignorer ?",
        ignoreCancel: 'Annuler', ignoreOk: 'Ignorer quand même',
        authConfirmCancel: 'Pas encore', authConfirmOk: 'Confirmer',
        syncResumeVideoHint: 'Synchronisation vidéo reprise.', syncResumeScrollHint: 'Synchronisation scroll reprise.',
        settingsObs: 'OBS',
        obsEnabledLabel: 'Activer le contrôle depuis OBS',
        obsEnabledDesc: "Démarre un serveur local (127.0.0.1) permettant le dock OBS et les raccourcis clavier. Aucune donnée n'est exposée au réseau.",
        obsPortLabel: 'Port du serveur',
        obsPortDesc: '0 = port choisi automatiquement. Fixez une valeur (ex. 49231) pour un port stable.',
        obsPortApply: 'Appliquer', obsPortApplied: 'Port appliqué.', obsPortInvalid: 'Port invalide (0–65535).',
        obsStatusLabel: 'État du serveur', obsStatusRunning: 'Actif sur', obsStatusStopped: 'Arrêté', obsStatusDisabled: 'Désactivé',
        obsDockUrlLabel: 'URL du dock OBS',
        obsDockUrlDesc: 'À coller dans OBS : Affichage → Docks → Dock de navigateur personnalisé.',
        obsPortValueLabel: 'Port (pour le script de hotkeys)',
        obsTokenLabel: 'Token (pour le script de hotkeys)', obsTokenDesc: 'Sécurise les commandes OBS. Ne le partagez pas.',
        obsGuideTitle: 'Guide complet', obsGuideDesc: 'Voir obs-integration/OBS_INTEGRATION.md pour la mise en place du dock et des raccourcis clavier.',
        copyBtn: 'Copier', copiedBtn: 'Copié !',
        // v0.4.0
        searchEngineLabel: 'Moteur de recherche',
        searchEngineDesc: "Utilisé quand le texte saisi n'est pas une adresse web.",
        searchEngineAdd: '+ Ajouter',
        searchEngineNamePlaceholder: 'Nom',
        searchEngineUrlPlaceholder: 'https://moteur.com/search?q=',
        searchEngineExists: 'Ce moteur existe déjà.',
        searchEngineInvalid: 'URL invalide (doit commencer par http).',
        screenshotLabel: "Captures d'écran",
        screenshotDesc: 'Dossier de sauvegarde des captures.',
        screenshotBrowse: 'Parcourir…',
        screenshotOk: '✓ Captures sauvegardées',
        screenshotErr: 'Erreur lors de la capture.',
    },
    en: {
        syncActive: 'Sync active', syncPaused: 'Sync paused', syncStarting: 'Sync…',
        syncPauseAction: 'Pause', syncResumeAction: 'Resume', syncRestartAction: 'Restart',
        adblockActive: 'Ad blocker active', newTab: 'New tab',
        landscapeView: 'Landscape view (Desktop)', enterUrl: 'Enter a URL in the address bar',
        downloadBlocked: 'Download not allowed', addressPlaceholder: 'https://example.com',
        resize: 'Resize', settings: 'Settings',
        history: 'History',
        settingsGeneral: 'General', settingsAppearance: 'Appearance', settingsLanguage: 'Language',
        settingsServices: 'Connected services', settingsPrivacy: 'Privacy',
        restoreTabs: 'Restore windows and tabs from previous session',
        restoreTabsDesc: 'On startup, restores tabs and URLs from the previous session.',
        autoPauseLabel: 'Auto-pause YouTube videos',
        autoPauseDesc: 'Pauses the video on launch (classic and Shorts). Ads play freely; the real video is paused once the ad ends.',
        autoMutePortraitLabel: 'Auto-mute portrait',
        autoMutePortraitDesc: 'Forces silence in the portrait window. An alert button appears if sound is accidentally enabled.',
        homepageLabel: 'Homepage and new windows', homepageDesc: 'Page shown on startup and when clicking the home button.',
        homepageKnack3: 'Knack3 homepage (default)', homepageCustom: 'Custom web address', homepageEmpty: 'Empty page',
        newTabLabel: 'New tabs', newTabHomepage: 'Selected homepage', newTabEmpty: 'Empty page',
        customUrlPlaceholder: 'https://example.com', validateBtn: 'Apply',
        urlValid: 'Valid URL — homepage updated.', urlInvalid: 'Only URLs are allowed (http:// or https://).',
        appearanceLabel: 'Website appearance', appearanceDesc: 'Applies theme to visited sites and DualView interface.',
        appearanceAuto: 'Automatic (follows system)', appearanceLight: 'Light', appearanceDark: 'Dark',
        languageLabel: 'Interface language', languageDesc: 'Language used for the DualView interface.',
        langFr: 'Français', langEn: 'English',
        servicesDesc: 'Sign in to your services to browse without interruption.',
        servicesLoading: 'Checking connections…', servicesCustom: 'Custom service',
        servicesCustomDesc: 'Add an unlisted service.', servicesAddCustom: 'Add a service',
        servicesConnect: 'Connect', servicesConnected: 'Connected', servicesNotConnected: 'Not connected',
        servicesReconnect: 'Reconnect', servicesDisconnect: 'Disconnect',
        servicesConnecting: 'Connecting…', servicesSuccess: 'Successfully connected.',
        servicesFailed: 'Connection not confirmed.', servicesDeleted: 'Service removed.',
        privacyDownloads: 'Downloads', privacyDownloadsDesc: 'Downloads are disabled. Exception: images can be saved via right-click (→ Save image as…).',
        privacyPermissions: 'Permissions', privacyPermissionsDesc: 'Camera, microphone, geolocation and notifications are blocked.',
        privacySchemes: 'Secure browsing', privacySchemesDesc: 'Only http://, https:// and file:// protocols are allowed.',
        privacyShorts: 'YouTube Shorts', privacyShortsDesc: 'Ad blocker is disabled on YouTube Shorts (no pre-roll).',
        restartTitle: 'Restart required',
        restartAppearanceDesc: 'The theme will be applied on next startup. Restart now?',
        restartLanguageDesc: 'The language will be applied on next startup. Restart now?',
        loginPopupTitle: 'Sign in required',
        loginPopupDesc: 'To continue smoothly, it is recommended to add this service to Connected Services.',
        loginPopupBack: 'Go back', loginPopupConnect: 'Sign in', loginPopupServices: 'Connected services',
        ignoreConfirmTitle: 'Continue without signing in?',
        ignoreConfirmDesc: 'It is recommended to add a connected service for a smooth experience. Ignore anyway?',
        ignoreCancel: 'Cancel', ignoreOk: 'Ignore anyway',
        authConfirmCancel: 'Not yet', authConfirmOk: 'Confirm',
        syncResumeVideoHint: 'Video sync resumed.', syncResumeScrollHint: 'Scroll sync resumed.',
        settingsObs: 'OBS',
        obsEnabledLabel: 'Enable control from OBS',
        obsEnabledDesc: 'Starts a local server (127.0.0.1) enabling the OBS dock and keyboard shortcuts. No data is exposed to the network.',
        obsPortLabel: 'Server port',
        obsPortDesc: '0 = automatically chosen port. Set a value (e.g. 49231) for a stable port.',
        obsPortApply: 'Apply', obsPortApplied: 'Port applied.', obsPortInvalid: 'Invalid port (0–65535).',
        obsStatusLabel: 'Server status', obsStatusRunning: 'Running on', obsStatusStopped: 'Stopped', obsStatusDisabled: 'Disabled',
        obsDockUrlLabel: 'OBS dock URL',
        obsDockUrlDesc: 'Paste into OBS: Docks → Custom Browser Docks.',
        obsPortValueLabel: 'Port (for the hotkeys script)',
        obsTokenLabel: 'Token (for the hotkeys script)', obsTokenDesc: 'Secures OBS commands. Do not share it.',
        obsGuideTitle: 'Full guide', obsGuideDesc: 'See obs-integration/OBS_INTEGRATION.md to set up the dock and keyboard shortcuts.',
        copyBtn: 'Copy', copiedBtn: 'Copied!',
        // v0.4.0
        searchEngineLabel: 'Search engine',
        searchEngineDesc: 'Used when the typed text is not a web address.',
        searchEngineAdd: '+ Add',
        searchEngineNamePlaceholder: 'Name',
        searchEngineUrlPlaceholder: 'https://engine.com/search?q=',
        searchEngineExists: 'This engine already exists.',
        searchEngineInvalid: 'Invalid URL (must start with http).',
        screenshotLabel: 'Screenshots',
        screenshotDesc: 'Save folder for screenshots.',
        screenshotBrowse: 'Browse…',
        screenshotOk: '✓ Screenshots saved',
        screenshotErr: 'Screenshot error.',
    }
};
let currentLang = 'fr';
function t(key) { return (I18N[currentLang] || I18N.fr)[key] || key; }
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (el.tagName === 'OPTION') el.textContent = t(key);
        else el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
    document.getElementById('url-input').placeholder = t('addressPlaceholder');
    const cui = document.getElementById('s-custom-url-input');
    if (cui) cui.placeholder = t('customUrlPlaceholder');
    document.documentElement.lang = currentLang;
}
