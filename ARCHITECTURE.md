# DualView - Architecture v0.2.6

## Vue d'ensemble

```
PROCESSUS PRINCIPAL (Node.js / Electron Main)
main.js
  |
  |-- @ghostery/adblocker-electron  (NEW v0.3.0)
  |     ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, { cache })
  |       -> charge EasyList + uBlock Origin (réseau ou cache local)
  |       -> upgradeSessionBlocker() : remplace le handler onBeforeRequest
  |          + active filtrage cosmétique (CSS injection) + CNAME uncloaking
  |
  |-- session.fromPartition('persist:dualview')
  |     webRequest.onBeforeRequest -> bloque ads + schémas non autorisés
  |     setPermissionRequestHandler -> bloque toutes les permissions
  |     will-download -> bloque les téléchargements (toast dans landscapeWin)
  |
  |-- BrowserWindow: landscapeWin (landscape.html)
  |     Barre de controle integree + webview paysage + panneau paramètres
  |
  |-- BrowserWindow: portraitWin  (portrait.html)
  |     resizable=false
  |
  |-- Store: dualview-config.json (%AppData%/DualView/)
  |     landscapeWindow {width,height,x,y}
  |     portraitWindow  {x,y}  (taille fixe, non sauvegardee)
  |     tabs[]          {id,title,url}
  |     activeTabId
  |     settings        {restoreTabs, homepageMode, customHomepageUrl,
  |                      newTabMode, appearance, language}
```

---

## Flux IPC complet

```
landscapeWin (landscape.html)
  preload-landscape.js
    |
    | navigate(url)          --> main: 'navigate'
    | navBack()              --> main: 'nav-back'
    | navForward()           --> main: 'nav-forward'
    | saveTabs(data)         --> main: 'save-tabs'
    | sendNavigate(url)      --> main: 'sync-navigate'
    |                            --> portraitWin: 'load-url'
    |                            --> landscapeWin: 'update-addressbar'
    | notifyNavState(state)  --> main: 'notify-nav-state'
    |                            --> landscapeWin: 'nav-state-changed'
    | sendScroll(pct)        --> main: 'sync-scroll'
    |                            --> portraitWin: 'apply-scroll'
    | sendVideoPlay(t)       --> main: 'video-play'
    | sendVideoPause(t)      --> main: 'video-pause'   --> portraitWin: 'video-cmd'
    | sendVideoTimeUpdate(t) --> main: 'video-timeupdate'
    |
    | <-- 'load-url'
    | <-- 'update-addressbar'
    | <-- 'nav-state-changed'
    | <-- 'webview-go-back'
    | <-- 'webview-go-forward'
    | <-- 'theme-changed'

portraitWin (portrait.html)
  preload-view.js
    |
    | <-- 'load-url'
    | <-- 'apply-scroll'
    | <-- 'video-cmd'    {action:'play'|'pause'|'seek', currentTime}
    | <-- 'webview-go-back'
    | <-- 'webview-go-forward'
    | <-- 'theme-changed'
```

---

## Structure des fichiers

```
dualview/
|
|-- package.json              Version, dependances, config electron-builder
|                             dependencies: @ghostery/adblocker-electron  (NEW)
|-- HOW_TO_INSTALL.md         Instructions utilisateur et contributeurs
|-- ARCHITECTURE.md           Ce fichier
|
|-- src/
|   |-- main.js               Processus principal Electron
|   |                         - Cree landscapeWin et portraitWin
|   |                         - Sécurité : blocage schémas, permissions,
|   |                           téléchargements, validation IPC
|   |                         - Bloqueur publicités (persist:dualview)
|   |                         - Handlers IPC (navigation, vidéo, settings)
|   |                         - Persistance config (fs + JSON)
|   |
|   |-- preload-landscape.js  Bridge sécurisé pour landscapeWin
|   |                         - Fusion ex preload-control.js + preload-view.js
|   |                         - Expose : navigate, navBack/Forward, reloadViews,
|   |                           saveTabs, saveSettings, getHomepageUrl,
|   |                           getStore, getVersion, pauseSync, resumeSync,
|   |                           relaunchApp, sendScroll, sendNavigate,
|   |                           sendVideoPlay/Pause/TimeUpdate, notifyNavState
|   |
|   |-- preload-view.js       Bridge sécurisé pour portraitWin
|   |                         - Écoute : load-url, apply-scroll, video-cmd,
|   |                           resize-mode, webview-go-back/forward,
|   |                           reload-webview, theme-changed
|   |
|   |-- landscape.html        Fenêtre paysage (Desktop 16:9)
|   |                         BARRE DE CONTRÔLE INTÉGRÉE :
|   |                           - Onglets (ajout, fermeture, switch)
|   |                           - Toolbar : ← → ⟳ 🏠 [url] ▶ [✅] ⚙️
|   |                           - Menu ⚙️ : Redimensionner | Paramètres
|   |                           - Barre de statut (sync, adblock, version)
|   |                         PANNEAU PARAMÈTRES (onglet dédié) :
|   |                           - Général : restauration onglets, page d'accueil,
|   |                             nouveaux onglets
|   |                           - Apparence : auto/clair/sombre (redémarrage)
|   |                           - Langue : fr/en (redémarrage)
|   |                           - Confidentialité : info blocages actifs
|   |                         WEBVIEW :
|   |                           - partition="persist:dualview"
|   |                           - useragent Desktop Chrome
|   |                           - VIDEO_WATCHER_SCRIPT injecté
|   |                           - Reset flags sur navigation (fix v0.2.3)
|   |                           - Polling scroll 100ms + vidéo 150ms
|   |
|   |-- portrait.html         Fenêtre portrait (Mobile 9:16)
|   |                         - partition="persist:dualview"
|   |                         - useragent Mobile Chrome Pixel 7
|   |                         - resizable=false (togglable via ↔/✅)
|   |                         - VIDEO_EXECUTOR_SCRIPT injecté
|   |                         - Overlay mode redimensionnement
|   |                         - Handler reload-webview
|
|-- assets/
|   |-- icon.ico              Icône application (à fournir)
|   |-- README.txt            Instructions icône
|
|-- installer/                Systeme d'installation MSI (WiX Toolset v4)
    |-- build-installer.bat   Lanceur contributeurs
    |-- build-installer.ps1   Script build MSI complet
    |-- product.wxs            Package MSI (WiX v4)
    |-- bundle.wxs             Burn Bootstrapper
    |-- custom-actions.wxs     CustomActions desinstallation
    |-- npm-build.ps1          Script build npm embarque
    |-- uninstall-userdata.ps1 Dialog suppression donnees
    |-- bundle-fr.wxl          Localisation francaise
    |-- bundle-en.wxl          Localisation anglaise
```

---

## Changements v0.2.4

- `controlWin` supprime. La barre de controle (onglets, adresse, statut)
  est desormais integree directement dans `landscape.html`.
- `preload-landscape.js` remplace et fusionne `preload-control.js`
  et l'ex `preload-view.js` pour landscapeWin.
- `portraitWin` : `resizable: false`. La fenetre portrait ne peut plus
  etre redimensionnee. Le bouton ↔ et la logique sync-pause/resume
  sont supprimes.
- Bouton "Charger" remplace par "▶" dans la barre d'adresse.
- Labels "PAYSAGE 16:9" et "PORTRAIT 9:16" retires des fenetres.

---

## Sessions Electron

```
Session persist:dualview
  |
  |-- webRequest.onBeforeRequest (toutes URLs)
  |     isBlockedUrl() :
  |       - Protocoles non autorisés (seuls http:, https:, file: permis)
  |       - Domaines publicitaires (doubleclick, googlesyndication, etc.)
  |       - Paths analytics/imasdk
  |
  |-- setPermissionRequestHandler
  |     -> callback(false) pour toute permission
  |        (caméra, micro, géolocalisation, notifications...)
  |
  |-- will-download
  |     -> item.cancel() + toast 'Téléchargement non autorisé'
  |
  IPC entrant (main.js)
  |-- sanitizeUrl() : vérifie protocole http/https/file + URL valide
  |-- save-settings : validation de chaque valeur (whitelist)
  |-- sync-scroll : vérifie typeof number
  |-- notify-nav-state : vérifie typeof object
```

---

## Bloqueur de publicites

```
Patterns interceptes (session persist:dualview) :
  *.doubleclick.net / googleads / pubads / securepubads
  pagead2.googlesyndication.com / ads.youtube.com
  *.googlesyndication.com / *.adservice.google.com / .google.fr
  analytics.google.com/analytics/collect
  www.google-analytics.com/collect
  stats.g.doubleclick.net
  imasdk.googleapis.com/js/sdkloader/
  imasdk.googleapis.com/admob/
  imasdk.googleapis.com/pal/
```

---

## Synchronisation video

```
landscapeWin <webview>
  VIDEO_WATCHER_SCRIPT injecte au dom-ready
    FIX v0.2.3 : resetWatcherFlags() sur did-navigate
    MutationObserver + polling 500ms -> attache listeners play/pause/seeked
    window.__dualviewVideoEvent = {type, time, platform}

  Polling 150ms -> sendVideoPlay/Pause/TimeUpdate
  Polling 5000ms -> sendVideoTimeUpdate si playing

main.js
  video-play       -> portraitWin: video-cmd {action:'play',  currentTime}
  video-pause      -> portraitWin: video-cmd {action:'pause', currentTime}
  video-timeupdate -> portraitWin: video-cmd {action:'seek',  currentTime}

portraitWin <webview>
  VIDEO_EXECUTOR_SCRIPT injecte au dom-ready
    FIX v0.2.3 : reset __dualviewExecutorReady sur navigation
    play/pause: sync si ecart > 3s
    seek: sync si ecart > 5s
```

---

## Persistance

```
Fichier : %AppData%\DualView\dualview-config.json

{
  "landscapeWindow": { "width": 1280, "height": 720, "x": 20, "y": 200 },
  "portraitWindow":  { "x": 1500, "y": 100 },
  "tabs": [
    { "id": "tab-1", "title": "youtube.com", "url": "https://youtube.com" }
  ],
  "activeTabId": "tab-1",
  "appVersion": "0.2.4"
}
```

---

## Historique des versions

| Version | Changements |
|---------|-------------|
| 0.1.0 | Version initiale. Navigation, onglets, scroll sync, themes, persistance. |
| 0.2.0 | Sync video play/pause/currentTime. Detecteur YouTube/TikTok/Instagram. |
| 0.2.1 | Bloqueur pub. Nav back/forward. |
| 0.2.2 | Fix bloqueur pub (persist:dualview). Fix nav (webview.canGoBack dans renderer). |
| 0.2.3 | Fix sync vidéo (reset flags sur navigation). Installeur WiX MSI (retiré en 0.2.5). |
| 0.2.4 | Barre de contrôle intégrée dans paysage. Portrait non redimensionnable. Bouton ▶. Labels OBS retirés. |
| 0.2.5 | Sécurité (blocage schémas, permissions, téléchargements, validation IPC). Paramètres (apparence, langue, page d'accueil, restauration onglets). Menu ⚙️. Boutons ⟳ 🏠. i18n FR/EN. Installeur simplifié (electron-builder NSIS). |