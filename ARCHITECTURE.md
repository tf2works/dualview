# DualView - Architecture v0.4.3

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
  |     webRequest.onBeforeRequest -> bloque ads (50+ domaines) + schémas non autorisés
  |                                -> BYPASS si YouTube Shorts (/shorts/)
  |                                -> ctier=A sur googlevideo.com (flux pub YouTube)
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
  |     Injection CSS cosmétique + stub IMA (Niveaux 2 & 3 bloqueur pub)
  |     Polling pub YouTube (ad-showing/ad-interrupting) → IPC ad-state
  |     Pause auto vidéos classiques YouTube (dom-ready → retry 200ms)
  |     Dropdown historique ← → : fermeture auto 500ms après unfocus
  |
  |-- BrowserWindow: portraitWin (portrait.html)
  |     Pool de webviews mobile (miroir du pool landscape)
  |     resizable=false (setResizable(true/false) via bouton ↔/✅)
  |     Indicateur sync (badge discret en haut)
  |     Overlay login (plein écran, non ignorable, auto-dismiss)
  |     Overlay pub (semi-transparent, message + compte à rebours)
  |     Bouton remute (polling 2s, visible si video.muted=false)
  |     Pause auto vidéos classiques YouTube (dom-ready → retry 200ms)
  |     Protocole vidéo séquencé v0.4.3 : pause/seek-to/play/drift-check atomiques
  |
  |-- État synchronisation
  |     syncState : 'paused' | 'active'
  |     Démarre à 'paused', passe à 'active' après 3 s (scheduleSyncStart)
  |     Les IPC scroll/vidéo/nav sont silencieux si syncState !== 'active'
  |     Les URLs d'auth ne sont jamais envoyées à portrait (isAuthUrl guard)
  |     IPC ad-state : relayé indépendamment de syncState
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
  |     settings        {restoreTabs, autoPauseVideo,
  |                      homepageMode, customHomepageUrl,
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
  reload-views, video-play, video-pause, video-drift-check

URLs bloquées vers portrait si isAuthUrl(url) :
  navigate, sync-navigate, sync-resume-state
  → isAuthUrl() vérifie AUTH_DOMAINS (9 services) + patterns LOGIN_URL

Canal ad-state : toujours relayé (indépendant de syncState)
```

---

## Synchronisation vidéo v0.4.3

### Protocole anti-boucle (refonte complète)

**Problème résolu** : l'ancienne implémentation forçait `currentTime` dans `play()`,
déclenchant `seeked` dans landscape → renvoi `play` → boucle infinie.

**Principe** : chaque action utilisateur génère une séquence ordonnée de commandes
atomiques. `seek-to` ne s'exécute jamais sur une vidéo en lecture → pas de `seeked`.

### Flux landscape → main.js
```
pollVideoState() — setInterval 150ms dans landscape.html
  VIDEO_WATCHER_SCRIPT injecté au dom-ready de la webview paysage
    video.addEventListener('play')   → __dualviewVideoEvent = {type:'play',  time}
    video.addEventListener('pause')  → __dualviewVideoEvent = {type:'pause', time}
    video.addEventListener('seeked') → __dualviewVideoEvent = {type:'seek',  time}

  Événement 'play' détecté  → sendVideoPlay(t)   → IPC 'video-play'
  Événement 'pause' détecté → sendVideoPause(t)  → IPC 'video-pause'
  Événement 'seek' détecté  → lit l'état playing → sendVideoPlay ou sendVideoPause

  Drift guard toutes les 5s (si lecture en cours) :
    → sendVideoDriftCheck(t) → IPC 'video-drift-check'
    (remplace sendVideoTimeUpdate — ne déclenche plus de boucle)
```

### Flux main.js → portrait (séquençage)
```
IPC 'video-pause' reçu (t) :
  ① portraitWin.send('video-cmd', {action:'pause',   currentTime:t})   ← immédiat
  ② portraitWin.send('video-cmd', {action:'seek-to', currentTime:t})   ← +50ms
  → pause d'abord, alignement ensuite (vidéo déjà à l'arrêt → pas de seeked)

IPC 'video-play' reçu (t) :
  ① portraitWin.send('video-cmd', {action:'seek-to', currentTime:t})   ← immédiat
  ② portraitWin.send('video-cmd', {action:'play',    currentTime:t})   ← +100ms
  → position fixée avant lecture (vidéo à l'arrêt → pas de seeked)

IPC 'video-drift-check' reçu (t) :
  portraitWin.send('video-cmd', {action:'drift-check', currentTime:t})
  → portrait corrige seulement si vidéo.paused ET |drift| > DRIFT_THRESHOLD (2s)
```

### VIDEO_EXECUTOR_SCRIPT dans portrait.html
```
window.__dualviewApplyCmd(cmd) — règles anti-boucle :

  'pause'       → video.pause()
                  (pas de currentTime → pas de seeked émis)

  'seek-to'     → video.currentTime = t  SEULEMENT si video.paused
                  (vidéo en lecture → ignoré → pas de seeked émis)

  'play'        → video.play()
                  (pas de currentTime → pas de seeked émis)

  'drift-check' → si video.paused ET |video.currentTime - t| > 2s :
                      video.currentTime = t
                  (conditionnel doublement → jamais de seeked intempestif)

Garanties supplémentaires :
  __dualviewObserverActive : un seul MutationObserver par webview (pas de doublon)
  pendingCmd + TTL 5s      : commandes obsolètes ignorées après navigation
  resetPageFlags()         : remet __dualviewExecutorReady=false à chaque navigation
                             → executor réinjecté proprement sans double-observer
```

### Pause automatique YouTube (inchangée depuis v0.4.2)
```
Vidéos classiques uniquement (Shorts exclus explicitement)

landscape.html
  AUTO_PAUSE_SCRIPT injecté à 2s et 5s après dom-ready, et après did-navigate
    → si pub : poll 500ms jusqu'à fin pub → pause
    → sinon  : pause immédiate à currentTime=0
  Flag __dualviewAutoPauseDone : remis à false à chaque navigation

portrait.html
  AUTO_PAUSE_SCRIPT injecté immédiatement au dom-ready (+ filet 3s)
    → même logique, retry toutes les 200ms pendant 10s max (50 tentatives)
    → video.muted = true + video.currentTime = 0 + video.pause()
```

---

## Bloqueur de publicités v0.4.2

### Architecture 3 niveaux
```
Niveau 1 — Réseau (main.js, session.webRequest.onBeforeRequest)
  isBlockedUrl(url, initiatorUrl)
    → isYouTubeShort(initiatorUrl) → bypass si Shorts
    → googlevideo.com : bloquer si ctier=A (flux pub), laisser passer sinon
    → AD_BLOCK_DOMAINS (50+ domaines : DoubleClick, googlesyndication,
      adservice.google.*, imasdk.googleapis.com, adnxs, criteo, taboola...)
    → AD_BLOCK_PATHS (analytics, pagead, IMA SDK paths)

Niveau 2 — DOM (landscape.html, injecté via did-attach-webview)
  YOUTUBE_COSMETIC_CSS → insertCSS dans les webviews YouTube
    Sélecteurs : ytd-promoted-*, ytd-ad-slot-renderer,
    .ytp-ad-overlay-container, .ytp-ad-skip-button*, #player-ads...

Niveau 3 — JS (landscape.html, injecté via dom-ready webview)
  YOUTUBE_IMA_STUB_SCRIPT → executeJavaScript
    Object.defineProperty(window, 'google', ...) → stub complet google.ima
    Neutralise AdsLoader, AdsManager, AdsRequest, AdDisplayContainer
    Résistant à la ré-écriture par YouTube (setter intercepté)
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

---

## Structure des fichiers

```
dualview/
|-- package.json              v0.4.3
|-- ARCHITECTURE.md           Ce fichier
|-- HOW_TO_INSTALL.md
|-- README.md
|-- TODO.md
|-- assets/
|   |-- icon.ico
|   |-- README.txt
|
|-- installer/
|   |-- build-installer.bat
|   |-- build-installer.ps1
|
|-- obs-integration/
|   |-- dualview-obs-hotkeys.lua
|   |-- OBS_INTEGRATION.md
|
|-- src/
    |-- main.js               Processus principal v0.4.3
    |   |                     + IPC vidéo séquencé : video-pause/video-play/video-drift-check
    |   |                     + Suppression video-timeupdate (remplacé par video-drift-check)
    |   |                     + Séquençage pause : ①pause ②seek-to +50ms
    |   |                     + Séquençage play  : ①seek-to ②play +100ms
    |   |
    |-- obs-control.js        Serveur HTTP + WebSocket OBS (v0.3.2)
    |-- obs-dock.html         Page dock OBS
    |-- auth-window.js        Fenêtres d'authentification
    |-- history-manager.js    Historique persistant (history.json)
    |-- logger.js             Système de debug --dev
    |-- preload-auth.js       Anti-détection Electron (authWin)
    |-- preload-dev.js        DevTools en mode --dev
    |-- preload-landscape.js  API IPC renderer landscape v0.4.3
    |   |                     + sendVideoDriftCheck() remplace sendVideoTimeUpdate()
    |-- preload-view.js       API IPC renderer portrait v0.4.3
    |   |                     + canal 'video-cmd' : nouvelles actions (seek-to, drift-check)
    |
    |-- landscape.html        Fenêtre paysage v0.4.3
    |   |                     + pollVideoState() : sendVideoDriftCheck remplace sendVideoTimeUpdate
    |   |                     + drift-check envoyé seulement si lecture en cours
    |   |
    |-- portrait.html         Fenêtre portrait v0.4.3 (refonte complète du script)
        |                     + VIDEO_EXECUTOR_SCRIPT : 4 commandes atomiques
        |                     |   pause / seek-to (si paused) / play / drift-check
        |                     + resetPageFlags() : réinitialise les 3 flags à chaque navigation
        |                     + __dualviewObserverActive : MutationObserver unique
        |                     + pendingCmd avec TTL 5s
        |                     + load-url : vérifie getURL() avant d'assigner src
        |                     + sync-resume-state : scénario B (pas de rechargement)
```

---

### Fichiers de données utilisateur (runtime, non versionnés)

```
%AppData%/DualView/
|-- dualview-config.json      Configuration (fenêtres, onglets, paramètres)
|                             settings.autoPauseVideo (v0.4.2)
|-- history.json              Historique de navigation (v0.4.0)
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
      → googlevideo.com + ctier=A → flux pub YouTube bloqué
      → sinon : protocoles + 50+ domaines pub + paths analytics/IMA

  RÈGLE : ne jamais installer un second onBeforeSendHeaders dans
  auth-window.js ou ailleurs — cela écrase le handler de main.js
  et provoque ERR_ABORTED sur toutes les webviews portrait.
```

---

## Paramètres v0.4.3 (inchangés depuis v0.4.2)

```
Clé               | Valeurs                         | Effet
------------------|----------------------------------|---------------------------
restoreTabs       | true / false                     | Prochain démarrage
autoPauseVideo    | true / false (défaut: true)      | Immédiat (pause auto YouTube)
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
| 0.3.1 | Fix portrait partition persist:dualview. Fix ERR_ABORTED. Fix sync vidéo. Fix injection scripts SPA. Fix session pre-init. Fix ordre fenêtres. Fix déconnexion Microsoft. Auth Microsoft : confirmation obligatoire. Système de debug --dev. |
| 0.3.2 | Intégration OBS (Méthode 1 + 3). Serveur de contrôle local (obs-control.js). Dock OBS (obs-dock.html). Script Lua hotkeys (dualview-obs-hotkeys.lua). Paramètres → OBS. |
| 0.4.0 | Redimensionnement Portrait via modale (préréglages + taille libre). Capture PNG (📷). Omnibar (suggestions + Échap + sélection auto). Détection URL vs recherche. Moteur de recherche configurable. Historique de navigation persistant. Dropdown ← →. |
| 0.4.1 | Raccourcis clavier (Alt+←/→, F5/Ctrl+R, Ctrl+T/W/Tab, Ctrl+L/F6). Boutons souris retour/avance. Liens externes → onglet DualView. Menu contextuel clic droit. Enregistrement image via clic droit. |
| 0.4.2 | Bloqueur pub 3 niveaux (réseau 50+ domaines + ctier=A, CSS cosmétique, stub IMA complet). IPC ad-state (pub YouTube → overlay portrait avec compte à rebours). Pause auto vidéos classiques YouTube dans les deux fenêtres (retry 200ms, currentTime=0, gestion pub). Paramètre autoPauseVideo (Settings → Général). Bouton remute portrait (polling muted). Sync vidéo : réalignement exact au play sans seuil de drift. Dropdown historique : fermeture auto 500ms après unfocus (timer partagé boutons + dropdown). |
| 0.4.3 | Refonte sync vidéo — protocole séquencé anti-boucle. Nouvelles commandes atomiques : pause / seek-to / play / drift-check. IPC video-drift-check remplace video-timeupdate. seek-to conditionnel (uniquement si paused). MutationObserver unique par webview (__dualviewObserverActive). pendingCmd avec TTL 5s. resetPageFlags() séparée de injectExecutor(). load-url : vérification getURL() avant assignation src. |

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