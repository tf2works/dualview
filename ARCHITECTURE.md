# DualView - Architecture v0.2.2

## Vue d'ensemble

```
PROCESSUS PRINCIPAL (Node.js / Electron Main)
main.js
  |
  |-- session.fromPartition('persist:dualview')
  |     webRequest.onBeforeRequest -> bloque AD_BLOCK_PATTERNS
  |
  |-- BrowserWindow: controlWin  (control.html)
  |-- BrowserWindow: landscapeWin (landscape.html)
  |-- BrowserWindow: portraitWin  (portrait.html)
  |
  |-- Store: dualview-config.json (%AppData%/DualView/)
  |     landscapeWindow {width,height,x,y}
  |     portraitWindow  {width,height,x,y}
  |     controlWindow   {width,height,x,y}
  |     tabs[]          {id,title,url}
  |     activeTabId
```

---

## Flux IPC complet

```
controlWin (control.html)
  preload-control.js
    |
    | navigate(url)          --> main: 'navigate'
    | navBack()              --> main: 'nav-back'
    | navForward()           --> main: 'nav-forward'
    | pauseSync()            --> main: 'sync-pause'
    | resumeSync()           --> main: 'sync-resume'
    | saveTabs(data)         --> main: 'save-tabs'
    |
    | <-- 'update-addressbar'   (depuis sync-navigate)
    | <-- 'nav-state-changed'   (depuis notify-nav-state)
    | <-- 'theme-changed'       (depuis nativeTheme)

landscapeWin (landscape.html)
  preload-view.js
    |
    | sendNavigate(url)      --> main: 'sync-navigate'
    |                            --> portraitWin: 'load-url'
    |                            --> controlWin:  'update-addressbar'
    |
    | notifyNavState(state)  --> main: 'notify-nav-state'
    |                            --> controlWin: 'nav-state-changed'
    |
    | sendScroll(pct)        --> main: 'sync-scroll'
    |                            --> portraitWin: 'apply-scroll'
    |
    | sendVideoPlay(t)       --> main: 'video-play'
    | sendVideoPause(t)      --> main: 'video-pause'      --> portraitWin: 'video-cmd'
    | sendVideoTimeUpdate(t) --> main: 'video-timeupdate'
    |
    | <-- 'load-url'            (depuis navigate / sync-resume)
    | <-- 'webview-go-back'     (depuis nav-back)
    | <-- 'webview-go-forward'  (depuis nav-forward)
    | <-- 'theme-changed'

portraitWin (portrait.html)
  preload-view.js
    |
    | <-- 'load-url'
    | <-- 'apply-scroll'
    | <-- 'video-cmd'           {action:'play'|'pause'|'seek', currentTime}
    | <-- 'resize-mode'         (true|false)
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
|-- install.bat               Lanceur Windows (appelle install.ps1)
|-- install.ps1               Build script : verifie Node, npm install, electron-builder
|-- HOW_TO_INSTALL.md         Instructions utilisateur
|-- ARCHITECTURE.md           Ce fichier
|
|-- src/
|   |-- main.js               Processus principal Electron
|   |                         - Cree les 3 BrowserWindows
|   |                         - Configure session + bloqueur pub
|   |                         - Tous les handlers IPC
|   |                         - Persistance config (fs + JSON)
|   |
|   |-- preload-control.js    Bridge securise pour controlWin
|   |                         - contextBridge vers control.html
|   |                         - Expose : navigate, navBack/Forward,
|   |                           pauseSync, resumeSync, saveTabs, getStore
|   |
|   |-- preload-view.js       Bridge securise pour landscapeWin et portraitWin
|   |                         - contextBridge vers landscape/portrait.html
|   |                         - Expose : sendScroll, sendNavigate,
|   |                           sendVideoPlay/Pause/TimeUpdate, notifyNavState
|   |
|   |-- control.html          UI fenetre de controle
|   |                         - Barre d'onglets (ajout, fermeture, switch)
|   |                         - Boutons nav < >
|   |                         - Barre d'adresse + bouton Charger
|   |                         - Bouton redimensionnement (double-fleche)
|   |                         - Barre de statut (sync, version, adblock)
|   |
|   |-- landscape.html        Fenetre paysage (Desktop 16:9)
|   |                         - <webview partition="persist:dualview"
|   |                             useragent=Desktop Chrome>
|   |                         - VIDEO_WATCHER_SCRIPT (injecte dans webview)
|   |                           Detecte play/pause/seeked sur <video>
|   |                           Compatible YouTube/TikTok/Instagram/generique
|   |                         - Polling scroll (100ms) -> sendScroll
|   |                         - Polling video state (150ms) -> sendVideoPlay/Pause
|   |                         - sendNavState() apres chaque navigation
|   |
|   |-- portrait.html         Fenetre portrait (Mobile 9:16)
|   |                         - <webview partition="persist:dualview"
|   |                             useragent=Mobile Chrome Pixel7>
|   |                         - VIDEO_EXECUTOR_SCRIPT (injecte dans webview)
|   |                           Applique les commandes play/pause/seek
|   |                           Correction drift si ecart > 3s (play/pause)
|   |                           Correction drift si ecart > 5s (seek periodique)
|   |                         - Overlay visuel mode redimensionnement
|   |
|   |-- (futur) preload-landscape.js  Si besoin de preload specifique paysage
|   |-- (futur) preload-portrait.js   Si besoin de preload specifique portrait
|
|-- assets/
    |-- icon.ico              Icone application (a fournir par l'utilisateur)
    |-- README.txt            Instructions icone
```

---

## Sessions Electron

```
defaultSession
  -> BrowserWindows (control, landscape, portrait)
  -> NON utilisee pour les webviews

session.fromPartition('persist:dualview')
  -> Les deux <webview> (landscape et portrait)
  -> Cookies partages entre paysage et portrait
  -> webRequest.onBeforeRequest -> AD_BLOCK_PATTERNS (bloqueur pub)
  -> Persistance sur disque (persist:)
```

---

## Bloqueur de publicites

```
Patterns interceptes (session persist:dualview) :
  *.doubleclick.net
  googleads.g.doubleclick.net
  pubads.g.doubleclick.net
  securepubads.g.doubleclick.net
  pagead2.googlesyndication.com
  ads.youtube.com
  *.googlesyndication.com
  *.adservice.google.com / .google.fr
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
    |
    | MutationObserver + polling 500ms
    | -> trouve <video> (selecteur selon plateforme)
    | -> attache listeners play/pause/seeked
    |
    | window.__dualviewVideoEvent = {type, time, platform}
    |
  Polling 150ms (landscape.html)
    -> lit __dualviewVideoEvent
    -> sendVideoPlay(t) / sendVideoPause(t) / sendVideoTimeUpdate(t)
    |
  Polling 5000ms (sync periodique)
    -> lit __dualviewVideoState.currentTime
    -> sendVideoTimeUpdate si playing

main.js
  video-play   -> portraitWin: video-cmd {action:'play',  currentTime}
  video-pause  -> portraitWin: video-cmd {action:'pause', currentTime}
  video-timeupdate -> portraitWin: video-cmd {action:'seek', currentTime}

portraitWin <webview>
  VIDEO_EXECUTOR_SCRIPT injecte au dom-ready et a reception video-cmd
    -> findBestVideo(selecteurs plateforme)
    -> play/pause: sync currentTime si ecart > 3s
    -> seek: sync currentTime si ecart > 5s
    -> MutationObserver pour commandes en attente (video pas encore chargee)
```

---

## Persistance

```
Fichier : %AppData%\DualView\dualview-config.json

{
  "landscapeWindow": { "width": 1280, "height": 720, "x": 20,  "y": 200 },
  "portraitWindow":  { "width": 390,  "height": 844, "x": 1500,"y": 100 },
  "controlWindow":   { "width": 960,  "height": 160, "x": 400, "y": 20  },
  "tabs": [
    { "id": "tab-1", "title": "youtube.com", "url": "https://youtube.com" }
  ],
  "activeTabId": "tab-1",
  "appVersion": "0.2.2"
}

Sauvegarde : a chaque move/resize de fenetre, a chaque navigation,
             a chaque modification d'onglets.
```

---

## Historique des versions

| Version | Changements |
|---------|-------------|
| 0.1.0   | Version initiale. Navigation, onglets, scroll sync, themes, persistance. |
| 0.2.0   | Sync video play/pause/currentTime. Detecteur YouTube/TikTok/Instagram. |
| 0.2.1   | Bloqueur pub (session.defaultSession - bug: ne couvrait pas les webviews). Nav back/forward (bug: lisait BrowserWindow parent). |
| 0.2.2   | Fix bloqueur pub via persist:dualview partition. Fix nav via webview.canGoBack() dans renderer. Bouton resize renomme en double-fleche. |
