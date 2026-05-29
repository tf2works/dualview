# DualView - Architecture v0.4.2

## Vue d'ensemble

```
PROCESSUS PRINCIPAL (Node.js / Electron Main)
main.js
  |
  |-- auth-window.js (module)
  |     Gestion fenêtres d'authentification services connectés
  |     checkKnownServiceCookies / checkAllServicesStatus / disconnectService
  |     openAuthWindow → BrowserWindow indépendante (persist:dualview)
  |                      preload: preload-auth.js (anti-détection Electron)
  |
  |-- session.fromPartition('persist:dualview')
  |     webRequest.onBeforeRequest -> bloque ads + schémas non autorisés
  |                                -> BYPASS si YouTube Shorts (/shorts/)
  |     setPermissionRequestHandler -> bloque toutes les permissions
  |     will-download -> bloque les téléchargements (toast dans landscapeWin)
|                      EXCEPTION : images enregistrées via clic droit
|                      → flag _pendingImageSavePath + downloadURL()
  |     NOTE : un seul handler onBeforeSendHeaders autorisé par session
  |            → toute correction sec-ch-ua doit être faite ici uniquement
  |
  |-- BrowserWindow: landscapeWin (landscape.html)
  |     Pool de webviews desktop (une par onglet, display:none si inactive)
  |     Barre de contrôle intégrée + panneau paramètres
  |     Bouton sync (Pause/Reprendre/Redémarrer)
  |     Popup détection page de connexion + bouton "Se connecter" direct
  |
  |-- BrowserWindow: portraitWin (portrait.html)
  |     Pool de webviews mobile (miroir du pool landscape)
  |     resizable=false (setResizable(true/false) via bouton ↔/✅)
  |     Indicateur sync (badge discret en haut)
  |     Overlay login (plein écran, non ignorable, auto-dismiss)
  |
  |-- État synchronisation
  |     syncState : 'paused' | 'active'
  |     Démarre à 'paused', passe à 'active' après 3 s (scheduleSyncStart)
  |     Les IPC scroll/vidéo/nav sont silencieux si syncState !== 'active'
  |     Les URLs d'auth ne sont jamais envoyées à portrait (isAuthUrl guard)
  |
  |-- État onglets (main)
  |     tabUrls  : Map<tabId, url>
  |     activeTabId : string
  |     loginPageTabId : string | null  (onglet avec overlay actif)
  |
  |-- Config: dualview-config.json (%AppData%/DualView/)
  |     landscapeWindow {width,height,x,y}
  |     portraitWindow  {x,y,width,height}
  |     tabs[]          {id,title,url}
  |     activeTabId
  |     settings        {restoreTabs, homepageMode, customHomepageUrl,
  |                      newTabMode, appearance, language,
  |                      customServices[]}
```

---

## Modèle de pool de webviews (v0.2.6, inchangé)

Chaque onglet possède deux webviews persistantes (landscape + portrait).
Switch sans rechargement, état préservé en mémoire.

---

## Synchronisation v0.3.0

### Démarrage différé (3 secondes)
```
app.whenReady()
  → createLandscapeWindow()  → ready-to-show → tryScheduleSyncStart()
  → createPortraitWindow()   → ready-to-show → tryScheduleSyncStart()
                                                 ↓ (les deux prêts)
                                               setTimeout 3000ms
                                                 ↓
                                               syncState = 'active'
                                               broadcastSyncState()
```

### Contrôle sync (bouton dans toolbar landscape)
```
Bouton [● Sync active / ⏸ Sync pausée]
  → Clic → menu déroulant :
      ⏸ Mettre en pause  → ipcMain 'sync-control' pause
      ▶ Reprendre        → ipcMain 'sync-control' resume
                              + portraitWin: 'sync-resume-state' {tabId, url}
      ↺ Redémarrer       → ipcMain 'sync-control' restart (pause 500ms puis resume)
```

### Guards sync dans main.js
```
Channels ignorés si syncState !== 'active' :
  sync-scroll, sync-navigate, nav-back, nav-forward,
  reload-views, video-play, video-pause, video-timeupdate

URLs bloquées vers portrait si isAuthUrl(url) :
  navigate, sync-navigate, sync-resume-state
  → isAuthUrl() vérifie AUTH_DOMAINS (9 services) + patterns LOGIN_URL
```

---

## Services connectés v0.3.0

### Architecture
```
auth-window.js
  |
  |-- KNOWN_SERVICES : 9 services (Google, Microsoft, Instagram, Facebook,
  |                    Twitch, TikTok, X/Twitter, Discord, Steam)
  |
  |-- checkKnownServiceCookies(serviceKey)
  |     → session.cookies.get({ domain })
  |     → vérifie présence cookies de session spécifiques
  |
  |-- checkAllServicesStatus()
  |     → boucle sur tous les services connus
  |     → retourne Map<serviceKey, boolean>
  |
  |-- disconnectService(serviceKey, customUrl?)
  |     → supprime tous les cookies du domaine service
  |
  |-- openAuthWindow(opts)
  |     → BrowserWindow indépendante, partition:persist:dualview
  |     → preload: preload-auth.js (neutralise détection Electron)
  |     → UA desktop standard (Chrome)
  |     Services connus :
  |       → Détection fin auth : stratégie A (cookies) + C (URL hors marqueurs)
  |       → Fermeture automatique dès auth confirmée
  |     URL personnalisée :
  |       → idem + bouton "J'ai terminé" injecté dans la page
  |       → Stratégie A (cookies génériques) → dialog confirmation
  |       → Confirmation via IPC auth-custom-confirmed
```

### Anti-détection Electron (preload-auth.js)
```
Couche 1 — app.commandLine (main.js, avant app.whenReady)
  --disable-blink-features=AutomationControlled
  → neutralise navigator.webdriver au niveau moteur Chromium

Couche 2 — preload-auth.js (webPreferences.preload de authWin)
  Injection dans le main world via webFrame.executeJavaScript AVANT
  tout script de la page :
  - navigator.webdriver          → undefined
  - navigator.userAgentData      → brands sans "Electron"
  - window.chrome                → complété (app, runtime, csi, loadTimes)
  - navigator.plugins/mimeTypes  → 3 plugins PDF simulés
  - navigator.permissions.query  → patché

Couche 3 — setUserAgent(UA_DESKTOP)
  UA cohérent avec Chromium réel (pas de marqueur Electron)

ATTENTION : ne pas installer de handler onBeforeSendHeaders
  supplémentaire dans auth-window.js — session.webRequest n'accepte
  qu'un seul handler par événement. Un second handler écrase le premier
  et sa suppression retire TOUS les handlers → ERR_ABORTED généralisé.
```

### Flux connexion service connu
```
Utilisateur → clic tuile service → openAuthWindow({ serviceKey })
  → BrowserWindow s'ouvre sur URL auth du service
  → did-navigate : URL hors domaine auth + vérif cookies → fermeture auto
  → Toast "Connecté avec succès"
  → loadServicesStatus() → rafraîchit tuiles
  → Portrait rechargera l'onglet actif via sync-resume-state si nécessaire
```

### Flux connexion URL personnalisée
```
Utilisateur → formulaire (nom + URL) → clic Connecter
  → openAuthWindow({ serviceKey:'custom', customUrl, customLabel })
  → BrowserWindow s'ouvre sur customUrl
  → Bouton "✓ J'ai terminé" injecté (fixed bottom-right)
  → Poller 500ms détecte clic
  → checkGenericCookies() → count cookies suspects
  → main envoie 'auth-custom-confirm' { serviceLabel, hasCookies, cookieCount }
  → landscape affiche dialog confirmation
  → Utilisateur confirme → ipcMain 'auth-custom-confirmed' true
  → configSet customServices + connected:true
  → Toast "Connecté avec succès"
```

### Reconnexion (session expirée)
```
Bouton "Se reconnecter" → connectService(serviceKey, ...)
  → openAuthWindow() comme une connexion normale
  → Les cookies existants sont dans la session → auto-login possible
  → Si page login réapparaît → flux auth normal
```

### Bugs identifiés v0.3.0 (à corriger en v0.3.1)
```
BUG-1 : Portrait non connecté après auth Google/YouTube
  Symptôme : connexion Google réussie dans authWin, mais YouTube dans
             portrait affiche l'utilisateur comme non connecté.
  Cause    : la webview portrait a chargé YouTube AVANT la fin de l'écriture
             des cookies par authWin. Les cookies persist:dualview sont
             présents mais la page ne les a pas relus (pas de rechargement).
  Fix prévu : après finish(true) dans openAuthWindow, envoyer un IPC
              'auth-success' { serviceKey } → main recharge la webview
              portrait de l'onglet actif si son URL appartient au service.

BUG-2 : Microsoft — fenêtre auth ne se ferme pas, service déconnecté
  Symptôme : après login Microsoft, la fenêtre auth reste ouverte et
             redirige dans auth-window sans se fermer. Le statut reste
             "Non connecté" dans les paramètres.
  Cause A  : authDomains trop larges — après login, Microsoft redirige
             vers login.microsoftonline.com/common/oauth2/... qui reste
             dans authDomains → la condition "hors domaine auth" n'est
             jamais vraie, la fenêtre ne se ferme pas.
  Cause B  : les cookies ESTSAUTH sont créés sur login.microsoftonline.com
             mais checkKnownServiceCookies cherche sur .microsoft.com et
             .microsoftonline.com — le domaine exact peut ne pas matcher.
  Fix prévu : affiner authDomains Microsoft + ajouter login.microsoftonline.com
              dans cookieDomains avec domaine exact.

BUG-3 : Outlook non synchronisé dans portrait (ERR_ABORTED)
  Symptôme : navigation vers outlook.live.com dans landscape → portrait
             reçoit ERR_ABORTED, ne charge pas la page.
  Cause    : le handler onBeforeSendHeaders installé dans auth-window.js
             sur la session persist:dualview écrase le handler de
             setupSessionSecurity(). Sa suppression à la fermeture retire
             tous les handlers → les requêtes des webviews portrait sont
             bloquées (ERR_ABORTED généralisé sur toutes les URLs).
  Fix prévu : supprimer onBeforeSendHeaders de auth-window.js. Intégrer
              la correction sec-ch-ua dans setupSessionSecurity() de
              main.js (seul handler autorisé sur la session).
```

---

## Détection pages de connexion v0.3.0

```
Patterns URL (renderer landscape, attachWebviewListeners) :
  /\/login\b/i, /\/signin\b/i, /\/sign-in\b/i, /\/sign_in\b/i,
  /\/auth\b/i, /\/oauth\b/i, /\/connexion\b/i, /\/identification\b/i,
  /\/compte\/connexion/i, /\/account\/login/i

Whitelist : localhost, 127.0.0.1
Exclusions : /callback, /token, /redirect (retours OAuth)

Flux :
  did-navigate → isLoginPage(url) → dualview.notifyLoginPage(url, tabId)
    → ipcMain 'login-page-detected'
    → detectServiceKeyFromUrl(url) → serviceKey (null si inconnu)
    → landscapeWin: 'show-login-popup' { url, tabId, serviceKey }
    → portraitWin:  'show-login-popup' { url, tabId, serviceKey }

  did-navigate URL non-login → dualview.notifyLoginPageLeft(tabId)
    → ipcMain 'login-page-left'
    → broadcastLoginPageCleared() → les deux fenêtres masquent leur UI

Popup landscape :
  - "Retour"             → goBack() dans la webview
  - "Se connecter (Svc)" → openAuthWindow direct (si service détecté)
  - "Services connectés" → openSettingsTab('services')
  - Clic fond → dialog confirmation ignorance
    - "Annuler"          → retour au popup
    - "Ignorer quand même" → ferme tout

Overlay portrait (plein écran, non ignorable) :
  - Masqué automatiquement par login-page-cleared (piloté par main.js)
  - Message : "Page de connexion détectée — Synchronisation en pause"
```

---

## YouTube Shorts v0.3.0

```
main.js → isYouTubeShort(initiatorUrl)
  Si URL initiateur = https://www.youtube.com/shorts/*
  → isBlockedUrl() retourne false (bypass bloqueur pub)
  → Les requêtes ads/tracking passent pour les Shorts

Les scripts VIDEO_WATCHER/EXECUTOR restent actifs sur les Shorts.
```

---

## Flux IPC complet v0.3.0

```
Nouveaux canaux v0.3.0 :

landscapeWin → main :
  sync-control(action)              : 'pause'|'resume'|'restart'
  login-page-detected({url,tabId})  : détection page login
  login-page-left({tabId})          : navigation hors page login
  open-auth-window(opts)            : ouvre fenêtre auth (invoke)
  disconnect-service(opts)          : supprime cookies (invoke)
  delete-custom-service(opts)       : supprime service perso (invoke)
  auth-custom-confirmed(bool)       : confirmation auth perso
  auth-custom-cancelled()           : annulation auth perso

main → landscapeWin + portraitWin :
  sync-state-changed(state)         : 'active'|'paused'
  show-login-popup({url,tabId,serviceKey}) : affiche popup/overlay connexion
  login-page-cleared()              : masque popup/overlay connexion

main → portraitWin :
  sync-resume-state({tabId,url})    : reprise sync (réinjection scripts)

main → landscapeWin :
  auth-custom-confirm({serviceLabel,hasCookies,cookieCount})
```

---

## Structure des fichiers v0.4.2

```
dualview/
|
|-- package.json              Version 0.4.2
|-- HOW_TO_INSTALL.md         Procédure d'installation + config OBS
|-- ARCHITECTURE.md           Ce fichier
|-- README.md
|
|-- src/
|   |
|   |-- main.js               Point d'entrée v0.4.2 (~120 lignes)
|   |                         Lifecycle app (whenReady, before-quit)
|   |                         OBS helpers (handleObsCommand, pushObsStatus)
|   |                         Require et câblage de tous les modules
|   |
|   |-- main/                 NOUVEAU v0.4.2 — Modules extraits de main.js
|   |   |
|   |   |-- config-manager.js   Configuration JSON
|   |   |                       init(userDataPath), configGet, configSet
|   |   |                       DEFAULTS, SETTINGS_DEFAULTS,
|   |   |                       PORTRAIT_PRESETS, KNACK3_URL
|   |   |
|   |   |-- security.js         Sécurité session
|   |   |                       sanitizeUrl, isYouTubeShort, isBlockedUrl
|   |   |                       setupSessionSecurity({ onDownloadBlocked,
|   |   |                         getPendingImageSavePath,
|   |   |                         clearPendingImageSavePath })
|   |   |                       RÈGLE : UN SEUL handler onBeforeSendHeaders
|   |   |                       sur persist:dualview (jamais dans auth-window)
|   |   |
|   |   |-- url-detector.js     Classification d'URLs
|   |   |                       isLoginPage(url), isAuthUrl(url)
|   |   |                       detectServiceKeyFromUrl(url)
|   |   |                       AUTH_DOMAINS, LOGIN_FORCED_DOMAINS,
|   |   |                       LOGIN_URL_PATTERNS
|   |   |
|   |   |-- sync-manager.js     Cycle de vie synchronisation
|   |   |                       init({ getLandscapeWin, getPortraitWin,
|   |   |                             getActiveTabId, getTabUrl })
|   |   |                       getSyncState(), broadcastSyncState()
|   |   |                       tryScheduleSyncStart('landscape'|'portrait')
|   |   |                       applySyncAction('pause'|'resume'|'restart')
|   |   |                       → chemin partagé UI + OBS (zéro duplication)
|   |   |
|   |   |-- window-manager.js   Fenêtres BrowserWindow
|   |   |                       createLandscapeWindow({ onContextMenu,
|   |   |                                               onWindowOpen })
|   |   |                       createPortraitWindow()
|   |   |                       getLandscapeWin(), getPortraitWin()
|   |   |                       saveWindowBounds() à la fermeture
|   |   |
|   |   |-- context-menu.js     Menu contextuel clic droit (v0.4.1)
|   |   |                       buildAndShowContextMenu(params, wvContents)
|   |   |                       Lien, image, texte sélectionné, page
|   |   |                       Enregistrement image : flag
|   |   |                       _pendingImageSavePath + downloadURL()
|   |   |
|   |   |-- ipc/                Handlers IPC thématiques
|   |       |-- ipc-navigation.js   navigate, back, forward, reload, home
|   |       |                       load-url, update-addressbar,
|   |       |                       nav-state-changed, mouse-nav
|   |       |-- ipc-sync.js         sync-control, sync-state-changed
|   |       |                       sync-resume-state, sync-navigate
|   |       |                       sync-scroll, video-play/pause/timeupdate
|   |       |-- ipc-tabs.js         tab-created, tab-switched, tab-closed
|   |       |                       tab-title-updated, reload-views
|   |       |-- ipc-history.js      history-add, history-get-all,
|   |       |                       history-get-by-tab, history-search,
|   |       |                       history-delete-url, history-clear-all,
|   |       |                       history-clear-tab
|   |       |-- ipc-portrait.js     start/apply/finish/cancel-portrait-resize
|   |       |-- ipc-services.js     open-auth-window, disconnect-service,
|   |       |                       delete-custom-service,
|   |       |                       auth-custom-confirmed/cancelled,
|   |       |                       get-connected-services-status
|   |       |-- ipc-settings.js     get-settings, save-settings,
|   |       |                       get-is-dev, get-user-data-path
|   |       |-- ipc-obs.js          get-obs-info
|   |       |-- ipc-screenshot.js   take-screenshot, choose-screenshot-dir
|   |
|   |-- landscape/            NOUVEAU v0.4.2 — Découpage de landscape.html
|   |   |
|   |   |-- landscape.html    HTML pur (~420 lignes)
|   |   |                     Structure DOM + <link> CSS + <script src> JS
|   |   |                     (remplace src/landscape.html)
|   |   |
|   |   |-- landscape.css     Tous les styles (~955 lignes)
|   |   |                     Thèmes clair/sombre, toolbar, onglets,
|   |   |                     omnibar, panneaux, modales, popups
|   |   |
|   |   |-- js/
|   |       |-- i18n.js            Traductions FR/EN, t(), applyTranslations()
|   |       |-- state.js           Variables globales partagées
|   |       |                      (tabs, webviewPool, activeTabId…)
|   |       |-- ui-utils.js        showToast, escHtml, applyWebviewTheme,
|   |       |                      copyToClipboard
|   |       |-- webview-pool.js    Pool de webviews, scripts injectés
|   |       |                      (VIDEO_WATCHER, SCROLL_LISTENER,
|   |       |                       EXECUTOR), listeners did-navigate
|   |       |-- tabs-manager.js    renderTabs, switchTab, addTab, closeTab,
|   |       |                      saveTabsState
|   |       |-- navigation.js      navigate, resolveInput (URL vs recherche)
|   |       |                      urlInput, go-btn, back/forward, reload, home
|   |       |-- sync-ui.js         Bouton sync, menu dropdown, badge état
|   |       |-- login-popup.js     Popup page de connexion (landscape)
|   |       |                      + overlay portrait via IPC
|   |       |-- history-panel.js   Panneau Historique (⚙️ → Historique)
|   |       |                      groupé par date, recherche, suppression
|   |       |-- nav-history-dropdown.js  Dropdown ← → (survol 500 ms /
|   |       |                            clic 400 ms), 10 dernières URLs
|   |       |-- resize-modal.js    Modale redimensionnement Portrait
|   |       |                      Préréglages + taille libre, Valider/Annuler
|   |       |-- settings-panel.js  Panneau Paramètres → Général, Apparence,
|   |       |                      Langue, Moteur de recherche, OBS, Captures
|   |       |-- services-panel.js  Panneau Services connectés : tuiles,
|   |       |                      auth, déconnexion, service personnalisé
|   |       |-- keyboard-shortcuts.js  Raccourcis clavier (Alt+←/→, F5,
|   |       |                          Ctrl+R/T/W/Tab, Ctrl+L/F6)
|   |       |                          Boutons souris 3/4 (before-input-event)
|   |       |                          Listeners obs-command, screenshot
|   |       |-- landscape-init.js  Point d'entrée renderer : séquence init,
|   |                              chargement config, IPC entrants
|   |
|   |-- auth-window.js        Fenêtres authentification services
|   |                         KNOWN_SERVICES (9), openAuthWindow
|   |                         checkKnownServiceCookies, checkAllServicesStatus
|   |                         disconnectService, authWindowEvents (EventEmitter)
|   |
|   |-- history-manager.js    Historique de navigation (v0.4.0)
|   |                         Fichier : %AppData%/DualView/history.json
|   |                         Entrée : { url, title, visitedAt, tabId }
|   |                         Max 5000 entrées (FIFO), déduplication,
|   |                         sauvegarde différée 2 s, filtre URLs auth
|   |
|   |-- obs-control.js        Serveur de contrôle OBS (v0.3.2)
|   |                         HTTP + WebSocket sur 127.0.0.1, token aléatoire
|   |                         start/stop/updateStatus/getInfo
|   |                         Liste blanche ALLOWED_ACTIONS
|   |
|   |-- obs-dock.html         Page du dock OBS (v0.3.2)
|   |                         UI compacte, onglets défilables
|   |                         WebSocket temps réel + repli HTTP
|   |
|   |-- logger.js             Logger mode --dev : fichier + console
|   |                         Niveaux LOG/WARN/ERROR, source taggée
|   |
|   |-- preload-auth.js       Anti-détection Electron (authWin)
|   |                         webFrame.executeJavaScript (main world) :
|   |                         navigator.webdriver, userAgentData,
|   |                         window.chrome, plugins, permissions
|   |
|   |-- preload-dev.js        Bridge mode debug (--dev)
|   |                         Raccourcis F12 / Ctrl+F12 (DevTools)
|   |
|   |-- preload-landscape.js  Bridge sécurisé landscape
|   |                         Expose window.dualview (contextBridge)
|   |                         Sync, navigation, tabs, history, services,
|   |                         screenshot, portrait resize, OBS, dev
|   |
|   |-- preload-view.js       Bridge sécurisé webviews
|   |                         sync-state-changed, show-login-popup
|   |                         login-page-cleared, sync-resume-state
|   |
|   |-- portrait.html         Fenêtre portrait
|   |                         Indicateur sync, overlay login plein écran
|   |                         sync-resume-state → réinjection scripts
|   |
|-- obs-integration/          Ressources OBS (hors binaire, non embarqué)
|   |-- dualview-obs-hotkeys.lua   Script hotkeys natives OBS → /command
|   |-- OBS_INTEGRATION.md         Guide d'utilisation (dock + hotkeys)
|
|-- assets/
|   |-- icon.ico
|   |-- README.txt
|
|-- installer/
    |-- build-installer.bat
    |-- build-installer.ps1
```

### Fichiers de données utilisateur (runtime, non versionnés)

```
%AppData%/DualView/
|-- dualview-config.json      Configuration (fenêtres, onglets, paramètres)
|-- history.json              NOUVEAU v0.4.0 — Historique de navigation
|                             [{url, title, visitedAt, tabId}, ...]
|                             Max 5000 entrées, géré par history-manager.js
|-- Partitions/
    |-- persist_dualview/     Cookies et sessions (partition Electron)
```

---

## Sécurité

```
Session persist:dualview — UN SEUL handler par événement webRequest
  webRequest.onBeforeRequest (setupSessionSecurity dans main.js)
    isBlockedUrl(url, initiatorUrl)
      → isYouTubeShort(initiatorUrl) → bypass si Shorts
      → sinon : protocoles + domaines pub + paths analytics

  RÈGLE : ne jamais installer un second onBeforeSendHeaders dans
  auth-window.js ou ailleurs — cela écrase le handler de main.js
  et provoque ERR_ABORTED sur toutes les webviews portrait.
```

---

## Paramètres v0.3.1

```
Clé               | Valeurs                         | Effet
------------------|----------------------------------|---------------------------
restoreTabs       | true / false                     | Prochain démarrage
homepageMode      | knack3 / custom / empty          | Immédiat
customHomepageUrl | URL http/https validée           | Immédiat
newTabMode        | homepage / empty                 | Immédiat
appearance        | auto / light / dark              | Redémarrage requis
language          | fr / en                          | Redémarrage requis
customServices    | [{id,label,url,connected}]       | Persisté, géré via UI
```

---

## Historique des versions

| Version | Changements |
|---------|-------------|
| 0.1.0 | Version initiale. Navigation, onglets, scroll sync, thèmes, persistance. |
| 0.2.0 | Sync vidéo play/pause/currentTime. Détecteur YouTube/TikTok/Instagram. |
| 0.2.1 | Bloqueur pub. Nav back/forward. |
| 0.2.2 | Fix bloqueur pub (persist:dualview). Fix nav (webview.canGoBack dans renderer). |
| 0.2.3 | Fix sync vidéo (reset flags sur navigation). |
| 0.2.4 | Barre de contrôle intégrée dans paysage. Portrait non redimensionnable. Bouton ▶. |
| 0.2.5 | Sécurité. Paramètres. Menu ⚙️. Boutons ⟳ 🏠. i18n FR/EN. Installeur simplifié. |
| 0.2.6 | Pool de webviews. Switch onglet sans rechargement. IPC tab-switched/closed/created. |
| 0.3.0 | Démarrage sync différé 3 s. Bouton sync. Services connectés (9 + URL perso). Détection pages login + popup/overlay. Bouton "Se connecter" direct. YouTube Shorts bypass. Anti-détection Electron (preload-auth.js, 4 couches). |
| 0.3.1 | Fix portrait partition persist:dualview (connexion cookies). Fix ERR_ABORTED (isAuthUrl hostname-only, AUTH_DOMAINS login-only). Fix sync vidéo (seek préserve état pause, executor réaligné). Fix injection scripts SPA (did-navigate-in-page). Fix session pre-init (pub 1re vidéo YouTube). Fix ordre fenêtres (portrait attend landscape). Fix déconnexion Microsoft (flush complet cookies). Auth Microsoft : confirmation obligatoire + bouton fallback (plus de fermeture automatique). LOGIN_FORCED_DOMAINS (login.microsoftonline.com toujours détecté). Portrait : overlay "Personnalisation en cours" sur onglet paramètres. Système de debug --dev (logger.js, preload-dev.js, F12, Ctrl+F12). |
| 0.3.2 | Intégration OBS (Méthode 1 + 3). Serveur de contrôle local (obs-control.js) : HTTP + WebSocket sur 127.0.0.1, token d'authentification. Dock OBS (obs-dock.html) : sync, navigation, URL, onglets pilotables depuis l'interface OBS. Script Lua de hotkeys natives (obs-integration/dualview-obs-hotkeys.lua → /command). Paramètres → OBS (activation, port, dock URL, token). Refactor applySyncAction (partagé UI native / OBS). Canal IPC obs-command (renderer landscape réutilise addTab/closeTab/switchTab/navigate). Zéro régression. |
| 0.4.2 | Restructuration modulaire. `main.js` (1 243 lignes) → point d'entrée ~120 lignes + 6 modules `src/main/` + 9 handlers IPC `src/main/ipc/`. `landscape.html` (4 237 lignes) → HTML pur ~420 lignes + `landscape.css` ~955 lignes + 15 modules JS dans `src/landscape/js/`. Zéro régression fonctionnelle. |
| 0.4.1 | Raccourcis clavier (Alt+←/→, F5/Ctrl+R, Ctrl+T/W/Tab, Ctrl+L/F6). Boutons souris retour/avance (boutons 3 et 4, via before-input-event). Toute ouverture de nouvelle fenêtre redirigée en onglet DualView (new-window + setWindowOpenHandler). Menu contextuel natif clic droit (did-attach-webview → wvContents.on context-menu → buildAndShowContextMenu) : lien, image, texte sélectionné, page — sans "Ouvrir dans une nouvelle fenêtre". Enregistrement d'image (clic droit → "Enregistrer l'image sous…") : dialogue natif + downloadURL via flag _pendingImageSavePath — seule exception au blocage des téléchargements. |
| 0.4.0 | Expérience utilisateur : Redimensionnement Portrait via modale (⚙️ → Redimensionner) avec préréglages iPhone 15/Pixel 8/Galaxy S24/iPad + taille libre — suppression du bouton ✅ de la toolbar. Capture instantanée (bouton 📷 toolbar) : PNG horodatés des deux vues via capturePage(), dossier configurable (Paramètres → Général). Omnibar : sélection automatique de l'URL au focus, Échap annule, suggestions locales (historique + domaine) + recherche, navigation clavier ↑↓. Détection URL vs recherche (resolveInput) : TLDs reconnus = URL directe, tout le reste = moteur de recherche. Moteur de recherche dans Paramètres → Général : DuckDuckGo par défaut, Google/Bing/Brave/Qwant prédéfinis, ajout de moteurs personnalisés. Historique de navigation persistant (history-manager.js → history.json, max 5000 entrées, déduplication, filtre auth) : panneau latéral groupé par date (⚙️ → Historique), recherche fulltext, suppression unitaire et globale ; dropdown sur ← → (survol 500 ms / clic maintenu 400 ms) affichant les 10 dernières URLs de l'onglet actif. |

---

## Intégration OBS v0.3.2

### Principe de communication

OBS est **toujours serveur** (son propre obs-websocket) et **ne se connecte
jamais** à une app externe. L'intégration DualView ne s'appuie donc PAS sur
le WebSocket d'OBS : c'est DualView qui héberge son propre serveur local, et
OBS s'y connecte (dock) ou y envoie des requêtes (hotkeys via script Lua).

```
Méthode 1 — Dock visuel
  OBS (Browser Dock) ──charge──> http://127.0.0.1:PORT/dock?token=...
        │  (page obs-dock.html servie par DualView)
        │  WebSocket bidirectionnel
        ▼
  obs-control.js ──onCommand──> main.js (handleObsCommand)
        ▲                              │
        └──updateStatus(sync,tabs)─────┘  (état temps réel poussé au dock)

Méthode 3 — Hotkeys natives
  Touche OBS ──> script Lua (obs_hotkey_register_frontend)
        │  curl POST /command  (X-DualView-Token)
        ▼
  obs-control.js ──onCommand──> main.js (handleObsCommand)
```

### Module obs-control.js
```
start({port, dockHtmlPath, onCommand, logFn})  → {port, token} | null (non bloquant)
updateStatus(partial)   diffuse {sync, activeTabId, url, tabs} aux clients WS
stop()                  ferme sockets + serveur (à l'extinction)
getInfo()               {port, token} ou null

Sécurité :
  - écoute UNIQUEMENT sur 127.0.0.1 (loopback)
  - token aléatoire (24 octets hex) requis sur /command, /status et upgrade WS
  - liste blanche ALLOWED_ACTIONS (toute autre action rejetée)
  - WebSocket maison minimal (RFC 6455 texte), aucune dépendance npm ajoutée
```

### Dispatch des commandes (main.js)
```
handleObsCommand(action, payload) :
  sync-pause | sync-resume | sync-restart
        → applySyncAction()   (même code que l'IPC 'sync-control')
  nav-back | nav-forward | nav-reload | nav-home
  navigate | tab-new | tab-close | tab-switch
        → landscapeWin.send('obs-command', {action, payload})
          → le renderer appelle navBack/addTab/closeTab/switchTab/navigate
            (fonctions UI existantes → comportement identique au clic)
```

### Paramètres OBS (config)
```
Clé        | Valeurs              | Effet
-----------|----------------------|-------------------------------------
obsEnabled | true / false         | Démarre/arrête le serveur (immédiat)
obsPort    | 0–65535 (0 = auto)   | Redémarre le serveur sur le nouveau port
```

### Fichiers ajoutés v0.3.2
```
src/obs-control.js                      Serveur HTTP + WebSocket local
src/obs-dock.html                       Page du dock OBS (token/port injectés)
obs-integration/
  dualview-obs-hotkeys.lua              Script hotkeys natives OBS
  OBS_INTEGRATION.md                    Guide d'utilisation OBS
```
Note : `obs-integration/` n'est PAS embarqué dans le binaire (fichiers destinés
à OBS, pas à Electron). `package.json.files` couvre `src/**/*` → obs-control.js
et obs-dock.html sont bien inclus dans l'installeur.