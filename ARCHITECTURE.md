# DualView - Architecture v0.2.6

## Vue d'ensemble

```
PROCESSUS PRINCIPAL (Node.js / Electron Main)
main.js
  |
  |-- session.fromPartition('persist:dualview')
  |     webRequest.onBeforeRequest -> bloque ads + schémas non autorisés
  |     setPermissionRequestHandler -> bloque toutes les permissions
  |     will-download -> bloque les téléchargements (toast dans landscapeWin)
  |
  |-- BrowserWindow: landscapeWin (landscape.html)
  |     Pool de webviews desktop (une par onglet, display:none si inactive)
  |     Barre de contrôle intégrée + panneau paramètres
  |
  |-- BrowserWindow: portraitWin (portrait.html)
  |     Pool de webviews mobile (miroir du pool landscape)
  |     resizable=false (setResizable(true/false) via bouton ↔/✅)
  |
  |-- État onglets (main)
  |     tabUrls  : Map<tabId, url>   (URL courante par onglet)
  |     activeTabId : string          (onglet visible dans les deux fenêtres)
  |
  |-- Config: dualview-config.json (%AppData%/DualView/)
  |     landscapeWindow {width,height,x,y}
  |     portraitWindow  {x,y}
  |     tabs[]          {id,title,url}
  |     activeTabId
  |     settings        {restoreTabs, homepageMode, customHomepageUrl,
  |                      newTabMode, appearance, language}
```

---

## Modèle de pool de webviews (v0.2.6)

### Principe
Chaque onglet possède **deux webviews persistantes** (une dans landscapeWin,
une dans portraitWin) qui restent vivantes en mémoire tant que l'onglet est ouvert.

```
Onglet tab-1  →  wv-landscape[tab-1] (desktop)  +  wv-portrait[tab-1] (mobile)
Onglet tab-2  →  wv-landscape[tab-2] (desktop)  +  wv-portrait[tab-2] (mobile)
Onglet tab-3  →  wv-landscape[tab-3] (desktop)  +  wv-portrait[tab-3] (mobile)
```

### Switch d'onglet
```
Avant v0.2.6 :  switchTab(id) → webview.src = tab.url  → rechargement complet
Depuis v0.2.6 : switchTab(id) → wv[id].classList.add('active')  → affichage instantané
                                 wv[prev].classList.remove('active') → mise en cache
```

Les webviews inactives sont positionnées en `display:none` (CSS absolu).
Le processus renderer Chromium reste actif : JS non suspendu, vidéo non interrompue.

### Cycle de vie d'un onglet
```
Création  : createWebview(tabId, url)  → <webview> ajouté au DOM, src=url
            → IPC tab-created → portraitWin crée sa webview miroir

Switch    : showWebview(tabId)         → display:flex sur wv[tabId], display:none sur les autres
            → IPC tab-switched → portraitWin fait de même

Fermeture : destroyWebview(tabId)      → wv.stop() + wv.remove() + Map.delete()
            → IPC tab-closed  → portraitWin détruit sa webview miroir
            Aucune confirmation (comportement navigateur standard)
```

### Consommation mémoire
Chaque webview = un processus renderer Chromium (~80–150 Mo RAM).
Recommandation : ≤ 5 onglets simultanés pour le streaming OBS.
Aucun déchargement automatique (pratique standard Chrome/Firefox).

---

## Flux IPC complet (v0.2.6)

```
landscapeWin (landscape.html)
  preload-landscape.js
    |
    | navigate(url)          --> main: 'navigate'
    |                            tabUrls.set(activeTabId, url)
    |                            --> landscapeWin: 'load-url' (url string)
    |                            --> portraitWin:  'load-url' ({tabId, url})
    |
    | switchTab(tabId)       --> main: 'tab-switched'
    |                            activeTabId = tabId
    |                            --> portraitWin: 'tab-switched' (tabId)
    |
    | closeTab(tabId)        --> main: 'tab-closed'
    |                            tabUrls.delete(tabId)
    |                            --> portraitWin: 'tab-closed' (tabId)
    |
    | createTab(tabId, url)  --> main: 'tab-created'
    |                            tabUrls.set(tabId, url)
    |                            --> portraitWin: 'tab-created' ({tabId, url})
    |
    | navBack()              --> main: 'nav-back'   --> landscapeWin + portraitWin
    | navForward()           --> main: 'nav-forward' --> landscapeWin + portraitWin
    | reloadViews()          --> main: 'reload-views' --> portraitWin: 'reload-webview'
    | saveTabs(data)         --> main: 'save-tabs'  (tabUrls + activeTabId sync)
    | saveSettings(s)        --> main: 'save-settings'
    | pauseSync()            --> main: 'sync-pause' -> portraitWin: setResizable(true)
    | resumeSync()           --> main: 'sync-resume'-> portraitWin: setResizable(false)
    |                            + portraitWin: 'load-url' ({tabId, url}) si redim
    | relaunchApp()          --> main: 'relaunch-app' -> app.relaunch()
    | sendNavigate(url)      --> main: 'sync-navigate'
    |                            --> portraitWin: 'load-url' ({tabId, url})
    |                            --> landscapeWin: 'update-addressbar'
    | notifyNavState(state)  --> main: 'notify-nav-state'
    |                            --> landscapeWin: 'nav-state-changed'
    | sendScroll(pct)        --> main: 'sync-scroll'  -> portraitWin: 'apply-scroll'
    | sendVideoPlay(t)       --> main: 'video-play'
    | sendVideoPause(t)      --> main: 'video-pause'  --> portraitWin: 'video-cmd'
    | sendVideoTimeUpdate(t) --> main: 'video-timeupdate'
    |
    | <-- 'load-url'          (string : charger dans la webview active du pool)
    | <-- 'update-addressbar'
    | <-- 'nav-state-changed'
    | <-- 'webview-go-back'
    | <-- 'webview-go-forward'
    | <-- 'theme-changed'
    | <-- 'download-blocked'  (affiche toast)

portraitWin (portrait.html)
  preload-view.js
    |
    | <-- 'tab-created'      ({tabId, url}) : crée webview portrait
    | <-- 'tab-switched'     (tabId)        : affiche webview portrait
    | <-- 'tab-closed'       (tabId)        : détruit webview portrait
    | <-- 'load-url'         ({tabId, url} ou string) : charge URL dans webview[tabId]
    | <-- 'apply-scroll'     : scroll sur la webview active
    | <-- 'video-cmd'        : {action:'play'|'pause'|'seek', currentTime}
    | <-- 'resize-mode'      (true|false)
    | <-- 'webview-go-back'
    | <-- 'webview-go-forward'
    | <-- 'reload-webview'
    | <-- 'theme-changed'
```

---

## Structure des fichiers

```
dualview/
|
|-- package.json              Version, dépendances, config electron-builder
|-- HOW_TO_INSTALL.md         Instructions utilisateur et contributeurs
|-- ARCHITECTURE.md           Ce fichier
|
|-- src/
|   |-- main.js               Processus principal Electron
|   |                         - Crée landscapeWin et portraitWin
|   |                         - Sécurité : blocage schémas, permissions,
|   |                           téléchargements, validation IPC
|   |                         - Bloqueur publicités (persist:dualview)
|   |                         - Handlers IPC navigation, vidéo, settings
|   |                         - État onglets : tabUrls (Map) + activeTabId
|   |                         - Handlers IPC pool : tab-switched, tab-closed,
|   |                           tab-created (relay vers portraitWin)
|   |                         - Persistance config (fs + JSON)
|   |
|   |-- preload-landscape.js  Bridge sécurisé pour landscapeWin
|   |                         - Expose : navigate, navBack/Forward, reloadViews,
|   |                           saveTabs, saveSettings, getHomepageUrl,
|   |                           getStore, getVersion, pauseSync, resumeSync,
|   |                           relaunchApp, sendScroll, sendNavigate,
|   |                           sendVideoPlay/Pause/TimeUpdate, notifyNavState
|   |                         - Nouveaux : switchTab, closeTab, createTab
|   |
|   |-- preload-view.js       Bridge sécurisé pour portraitWin
|   |                         - Écoute : load-url, apply-scroll, video-cmd,
|   |                           resize-mode, webview-go-back/forward,
|   |                           reload-webview, theme-changed
|   |                         - Nouveaux : tab-created, tab-switched, tab-closed
|   |
|   |-- landscape.html        Fenêtre paysage (Desktop 16:9)
|   |                         POOL DE WEBVIEWS (v0.2.6) :
|   |                           - Map<tabId, HTMLWebViewElement> webviewPool
|   |                           - createWebview(tabId, url) : crée + attache listeners
|   |                           - destroyWebview(tabId) : stop + remove + delete
|   |                           - showWebview(tabId) : display:flex / display:none
|   |                           - getActiveWebview() : retourne wv de l'onglet actif
|   |                           - switchTab() : show/hide sans rechargement
|   |                         BARRE DE CONTRÔLE INTÉGRÉE :
|   |                           - Onglets (ajout, fermeture, switch)
|   |                           - Toolbar : ← → ⟳ 🏠 [url] ▶ [✅] ⚙️
|   |                           - Menu ⚙️ : Redimensionner | Paramètres
|   |                           - Barre de statut (sync, adblock, version)
|   |                         PANNEAU PARAMÈTRES (onglet dédié) :
|   |                           - Général, Apparence, Langue, Confidentialité
|   |                         POLLERS :
|   |                           - pollVideoState() 150ms → webview ACTIVE uniquement
|   |                           - pollScroll()     100ms → webview ACTIVE uniquement
|   |                           - VIDEO_WATCHER_SCRIPT injecté par webview à dom-ready
|   |                           - SCROLL_INJECT injecté par webview à dom-ready
|   |
|   |-- portrait.html         Fenêtre portrait (Mobile 9:16)
|   |                         POOL DE WEBVIEWS (v0.2.6) :
|   |                           - Map<tabId, HTMLWebViewElement> webviewPool
|   |                           - Miroir exact du pool landscape
|   |                           - Piloté par IPC tab-created/switched/closed
|   |                         - useragent Mobile Chrome Pixel 7
|   |                         - resizable=false (togglable via ↔/✅)
|   |                         - VIDEO_EXECUTOR_SCRIPT injecté à dom-ready
|   |                         - Overlay mode redimensionnement
|
|-- assets/
|   |-- icon.ico              Icône application
|   |-- README.txt            Instructions icône
|
|-- installer/
    |-- build-installer.bat   Lanceur contributeurs (double-clic)
    |-- build-installer.ps1   Build electron-builder -> Setup.exe + désinstallateur
```

---

## Sécurité

```
Session persist:dualview
  |
  |-- webRequest.onBeforeRequest (toutes URLs)
  |     isBlockedUrl() :
  |       - Protocoles non autorisés (seuls http:, https:, file: permis)
  |       - Domaines publicitaires (doubleclick, googlesyndication, etc.)
  |       - Paths analytics/imasdk
  |
  |-- setPermissionRequestHandler -> callback(false) pour toute permission
  |
  |-- will-download -> item.cancel() + toast 'Téléchargement non autorisé'
  |
  IPC entrant (main.js)
  |-- sanitizeUrl()    : vérifie protocole http/https/file + URL valide
  |-- save-settings    : validation de chaque valeur (whitelist)
  |-- sync-scroll      : vérifie typeof number
  |-- notify-nav-state : vérifie typeof object
  |-- tab-switched     : vérifie typeof string
  |-- tab-closed       : vérifie typeof string
  |-- tab-created      : vérifie typeof string + sanitizeUrl sur l'URL
```

---

## Paramètres

```
Stockage : dualview-config.json > settings{}

Clé               | Valeurs                         | Effet
------------------|----------------------------------|---------------------------
restoreTabs       | true / false                     | Immédiat (prochain démarrage)
homepageMode      | knack3 / custom / empty          | Immédiat
customHomepageUrl | URL http/https validée           | Immédiat (après Valider)
newTabMode        | homepage / empty                 | Immédiat
appearance        | auto / light / dark              | Redémarrage requis
language          | fr / en                          | Redémarrage requis

Page d'accueil par défaut : https://marketplace.atlassian.com/vendors/920480808/
```

---

## Synchronisation vidéo

```
landscapeWin <webview active>
  VIDEO_WATCHER_SCRIPT injecté au dom-ready (par webview, dans attachWebviewListeners)
    resetWatcherFlags() sur did-navigate
    MutationObserver + polling 500ms -> attache listeners play/pause/seeked
    window.__dualviewVideoEvent = {type, time, platform}

  pollVideoState() 150ms → getActiveWebview() → executeJavaScript
  pollScroll()     100ms → getActiveWebview() → executeJavaScript

main.js
  video-play       -> portraitWin: video-cmd {action:'play',  currentTime}
  video-pause      -> portraitWin: video-cmd {action:'pause', currentTime}
  video-timeupdate -> portraitWin: video-cmd {action:'seek',  currentTime}

portraitWin <webview active>
  VIDEO_EXECUTOR_SCRIPT injecté au dom-ready (par webview, dans attachWebviewListeners)
    reset __dualviewExecutorReady sur did-navigate
    play/pause : sync si écart > 3s
    seek       : sync si écart > 5s
  video-cmd → getActiveWebview() → executeJavaScript(__dualviewApplyCmd)
```

---

## Persistance

```
Fichier : %AppData%\DualView\dualview-config.json

{
  "landscapeWindow": { "width": 1280, "height": 720, "x": 20, "y": 200 },
  "portraitWindow":  { "x": 1500, "y": 100 },
  "tabs": [
    { "id": "tab-1", "title": "youtube.com", "url": "https://youtube.com" },
    { "id": "tab-2", "title": "tiktok.com",  "url": "https://tiktok.com"  }
  ],
  "activeTabId": "tab-1",
  "settings": {
    "restoreTabs": true,
    "homepageMode": "knack3",
    "customHomepageUrl": "",
    "newTabMode": "homepage",
    "appearance": "auto",
    "language": "fr"
  },
  "appVersion": "0.2.6"
}
```

---

## Installation (contributeurs)

```
installer/build-installer.bat
  |
  |-- build-installer.ps1 (Admin)
        |
        |-- Vérification Node.js >= 22
        |-- npm install
        |-- npm run build (electron-builder --win --x64)
              -> dist/DualView-Setup-[version].exe
                 Inclut désinstallateur Windows natif
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
| 0.2.5 | Sécurité (blocage schémas, permissions, téléchargements, validation IPC). Paramètres (apparence, langue, page d'accueil, restauration onglets). Menu ⚙️. Boutons ⟳ 🏠. i18n FR/EN. Installeur simplifié (electron-builder NSIS). |
| 0.2.6 | **Pool de webviews** : chaque onglet conserve son état (pas de rechargement au switch d'onglet). Vidéo YouTube/TikTok non interrompue lors du changement d'onglet. IPC tab-switched / tab-closed / tab-created. Pollers scroll et vidéo ciblant la webview active. |