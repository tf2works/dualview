# DualView - Architecture v0.8.0

## Vue d'ensemble

```
PROCESSUS PRINCIPAL (Node.js / Electron Main)
main.js
  |
  |-- auth-window.js (module)
  |     Gestion fenêtres d'authentification services connectés
  |     checkKnownServiceCookies / checkAllServicesStatus / disconnectService
  |     openAuthWindow → BrowserWindow indépendante (persist:dualview)
  |                      preload: preload-auth.js (anti-détection Electron
  |                      + clés d'accès WebAuthn désactivées, v0.6.2)
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
  |     Bouton étoile ★ favoris (toolbar) + panneau latéral favoris (v0.4.7)
  |     setMaxListeners(200) sur chaque webview du pool via did-attach-webview (v0.7.0 : 50→200)
  |     Mode Focus Ctrl+Shift+H / F11 : masque toolbar + bande de détection 8px (v0.5.0)
  |     Onglet vide : top 10 domaines visités (historique toutes sessions) (v0.5.0)
  |     Paramètres : Apparence + Langue fusionnés dans Général (v0.5.0)
  |     Menu ⚙️ : bouton "Rouvrir le portrait" si portrait fermé (v0.5.0)
  |     Onglets déplaçables Drag & Drop + typage TAB_TYPE_* (v0.5.3)
  |     tabTypes Map → activeTabType passé au menu contextuel (v0.5.4)
  |     Mode comparaison ⊞ : colonne 390px UA-mobile, Ctrl+Shift+C (v0.8.0)
  |     Injection CSS/JS par domaine : dom-ready + did-navigate (v0.8.0)
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
  |     Onglet vide : top 10 domaines (données reçues depuis landscape via IPC) (v0.5.0)
  |     Réouverture depuis landscape : pool reconstruit via dom-ready + séquence IPC (v0.5.0)
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
  |                      customServices[],
  |                      userScripts[] (v0.8.0)}
```

---

## Modèle de pool de webviews (v0.2.6, inchangé)

Chaque onglet possède deux webviews persistantes (landscape + portrait).
Switch sans rechargement, état préservé en mémoire.

---

## Navigation URL — flux unique v0.6.0

### Problème résolu
`navigate()` (landscape-tabs.js) assignait `wv.src` **directement** sur la
webview active, puis envoyait l'IPC `navigate` à `main.js`, qui relayait
`load-url` vers `landscapeWin` — où un second handler réassignait `wv.src`
sur la même webview. Deux navigations concurrentes vers la même URL :
Chromium annule la première au profit de la seconde → `ERR_ABORTED (-3)`
visible en logs sur chaque saisie d'adresse, et pic de listeners internes
`executeJavaScript`/`did-stop-loading` pouvant approcher la limite
`setMaxListeners(50)` (v0.4.7).

### Flux correct (source unique)
```
Utilisateur tape une URL / clique un résultat omnibar
  → navigate(rawInput)            [landscape-tabs.js]
      • résout l'input (resolveInput), met à jour tab.url/title, renderTabs/saveTabs
      • PAS d'assignation wv.src ici
      • window.dualview.navigate(url)
  → ipcMain 'navigate'            [main.js]
      • sanitizeUrl(url)
      • tabUrls.set(activeTabId, safe)
      • landscapeWin.send('load-url', safe)
      • si syncState === 'active' && !isAuthUrl(safe) :
          portraitWin.send('load-url', { tabId: activeTabId, url: safe })
  → window.dualview.on('load-url', …)   [landscape-tabs.js]
      • seule assignation de wv.src pour cette navigation
```

Le même canal `load-url` sert donc à la fois la fenêtre landscape (retour
d'IPC) et la synchronisation vers le portrait — une seule navigation est
déclenchée par saisie, quelle que soit la fenêtre.

### Règle de prévention
Ne jamais assigner `wv.src` à la fois de façon synchrone dans le handler
qui initie la navigation et dans le handler IPC qui la reçoit en retour.
Un seul point d'assignation par navigation logique.

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
  → isAuthUrl() vérifie AUTH_DOMAINS (11 services depuis v0.4.7) + patterns LOGIN_URL

Canal ad-state : toujours relayé (indépendant de syncState)
```

---

## Réouverture fenêtre portrait v0.5.0

### Problème résolu
Quand le portrait est fermé puis rouvert via "Rouvrir le portrait", l'ancien
code utilisait `did-finish-load` pour envoyer les données : à ce moment,
`portrait-app.js` n'avait pas encore exécuté ses `window.dualview.on(...)`.
Les IPC tombaient dans le vide. De plus, seul l'onglet actif était envoyé.

### Séquence correcte (dom-ready)
```
Utilisateur clique "Rouvrir le portrait" (⚙️)
  → ipcRenderer.invoke('reopen-portrait')
  → main.js : createPortraitWindow()
  → portraitWin.webContents.once('dom-ready')
      ↓  (portrait-app.js entièrement exécuté, listeners IPC actifs)
      ① landscapeWin.send('portrait-status', true)
      ② Pour chaque tabId dans tabUrls (sauf activeTabId) :
           portraitWin.send('tab-created', { tabId, url })
      ③ portraitWin.send('tab-created', { tabId: activeTabId, url: '' })
      ④ portraitWin.send('tab-switched', activeTabId)
      ⑤ portraitWin.send('load-url', { tabId: activeTabId, url })

Résultat : portrait reconstruit avec tous les onglets,
           onglet actif visible et chargé sans actualisation manuelle.
```

### IPC de relais landscape → portrait (v0.5.0)
```
Canal 'send-to-portrait' (ipcMain.on)
  Whitelist : ['show-topsites']
  → portraitWin.webContents.send(channel, data)

Utilisé par : landscape-ui.js → sendToPortrait('show-topsites', top10)
  → portrait-app.js reçoit 'show-topsites' et rend la grille top domaines
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

### Pause automatique YouTube (mise à jour v0.4.6)
```
Vidéos classiques uniquement — Shorts exclus à deux niveaux de garde.

Garde primaire (renderer Electron) — landscape-views.js / portrait-app.js
  isYouTubeShort(url) sur wv.getURL() ou e.url
  → toujours fiable : URL résolue par Electron après navigation
  → AUTO_PAUSE_SCRIPT non injecté si Short détecté

Garde secondaire (script injecté) — landscape-webview.js / portrait-webview.js
  url.includes('/shorts/') dans AUTO_PAUSE_SCRIPT
  → filet de sécurité uniquement

landscape (landscape-views.js + landscape-webview.js)
  AUTO_PAUSE_SCRIPT injecté :
    - immédiatement au dom-ready (player déjà présent sur rechargement)
    - à 2s (player YouTube chargé en JS après dom-ready)
    - à 5s (filet pour connexions lentes)
    - après did-navigate (navigation complète) à 1.5s
    - après did-navigate-in-page (SPA) à 1.2s
  Flag __dualviewAutoPauseDone posé UNIQUEMENT quand la vidéo est trouvée
    → les retries (setTimeout 300ms × 20) fonctionnent si le player est absent

portrait (portrait-app.js + portrait-webview.js)
  AUTO_PAUSE_SCRIPT injecté au dom-ready + did-navigate-in-page + did-navigate
    → seulement si !isYouTubeShort(url) côté renderer
    → retry toutes les 200ms pendant 10s max (50 tentatives)
    → video.muted = true ; currentTime = 0 sauf si executor déjà actif
  Flag __dualviewAutoPauseAborted posé par resetPageFlags() à chaque navigation
    → coupe tous les setTimeout en vol (évite l'application sur la mauvaise page)
  Timer de sécurité 3s stocké et annulé (clearTimeout) à chaque dom-ready / did-navigate
    → évite l'accumulation de listeners did-stop-loading (MaxListenersExceededWarning)
```

---

## Favicons d'onglets v0.6.0 (fetch déporté au main process en v0.6.1)

### Pourquoi le fetch HTTP a été déplacé dans le main process (v0.6.1)
Chromium logge automatiquement dans la console DevTools tout échec de
chargement d'une ressource déclarée en markup (`<img src>`), quel que soit
le gestionnaire `onerror` posé en JS — ce comportement ne peut pas être
désactivé depuis le renderer. Pour qu'un favicon.ico/icon.ico introuvable ne
pollue plus la console de la fenêtre paysage, la requête HTTP elle-même doit
avoir lieu ailleurs que dans cette fenêtre : elle est donc effectuée dans le
process principal (dont la console n'est jamais visible depuis les DevTools
du renderer), via `net.request`. Le renderer n'assigne plus jamais une URL
distante non vérifiée à `<img src>`.

### Cascade de repli
```
1. Extraction réelle (priorité)
   wv.addEventListener('dom-ready', () => extractFaviconFromWebview(wv, tabId))
     → wv.executeJavaScript(_FAVICON_EXTRACT_SCRIPT)
     → cherche dans l'ordre :
         link[rel="icon"], link[rel="shortcut icon"], link[rel~="icon"],
         link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"],
         link[rel="mask-icon"]
     → résolution automatique en URL absolue via el.href (DOM)
     → candidat transmis à _resolveFavicon(tabId, candidat)

2. Repli deviné (si aucune balise trouvée / page sans accès JS, ex. file://)
   _guessFaviconUrl(tab) → <origin>/favicon.ico (candidat textuel uniquement,
   jamais assigné directement à <img src>)

3. Vérification + récupération côté main process (v0.6.1)
   _resolveFavicon(tabId, candidat)
     → window.dualview.fetchFavicon(candidat)   [IPC invoke 'fetch-favicon']
     → main.js : fetchFaviconAsDataUrl(url)
         · whitelist protocole http(s) uniquement
         · garde anti-SSRF : rejette les hôtes privés/locaux
           (loopback, 10/8, 172.16/12, 192.168/16, 169.254/16 incl.
           métadonnées cloud, ::1, fe80:, fc00::/7)
         · timeout 5 s (request.abort())
         · limite de taille 2 Mo (abort si dépassée)
         · valide chaque redirection (même garde anti-SSRF) avant de la suivre
         · valide le Content-Type de la réponse (image/* ou absent/octet-stream
           accepté ; le reste — ex. page d'erreur HTML servie en 200 — rejeté)
         · succès (2xx) → résout en data: URL (base64) ; tout échec → résout
           en null, SANS jamais appeler console.error (échec silencieux,
           routine pour un favicon manquant)
     → résultat mis en cache (_faviconCache) ; renderTabs() si data: URL obtenue

4. Repli final (si la résolution échoue ou n'est pas encore terminée)
   <img src> = assets/favicon-default.svg directement (jamais de tentative
   réseau visible par le renderer)
   _onFaviconError(img, tabId) reste une garde anti-boucle défensive, mais
   ne devrait quasiment plus jamais se déclencher : seules des data: URL
   déjà validées par le main process sont assignées (hors repli SVG).
```

### Invalidation du cache
```
_faviconCache.delete(tabId) ET _faviconPending.delete(tabId) appelés :
  • à la fermeture de l'onglet (closeTab)
  • sur changement d'URL (window.dualview.on('update-addressbar', …))
→ force une nouvelle résolution (via _resolveFavicon) au prochain dom-ready
  ou au prochain renderTabs() si aucune icône n'est encore en cache
```

### Nouveau canal IPC
```
preload-landscape.js : fetchFavicon(url) → ipcRenderer.invoke('fetch-favicon', url)
main.js               : ipcMain.handle('fetch-favicon', ...) → fetchFaviconAsDataUrl(url)
                         renvoie une data: URL (succès) ou null (échec)
```

### Chemin du fallback SVG
`landscape.html` est dans `src/renderer/` ; `favicon-default.svg` est dans
`assets/` à la racine du projet → chemin relatif `../../assets/favicon-default.svg`
(deux niveaux, pas un seul).

---

## Détection des publicités YouTube v0.4.2

> **Note v0.7.0** : la documentation décrivait auparavant un bloqueur "3 niveaux" (réseau 50+ domaines + ctier=A, CSS cosmétique, stub IMA). Le code réel n'implémente que la **détection** (AD_POLL_SCRIPT), utilisée pour l'overlay portrait + compte à rebours. Les niveaux 2 et 3 n'ont jamais été livrés. La documentation a été corrigée pour refléter la réalité.

### Mécanisme de détection

```
landscape-pollers.js : pollAdState() toutes les 150ms
  → AD_POLL_SCRIPT exécuté dans la webview active
  → Détecte player.classList.contains('ad-showing' | 'ad-interrupting')
  → Extrait la durée restante (.ytp-ad-duration-remaining, etc.)
  → window.dualview.sendAdState({ isAd, remaining })
  → main.js → canal 'ad-state' → portrait-app.js → overlay #ad-overlay
```

### Overlay portrait

- Affiché : `ad-overlay.show` dès `isAd === true`
- Compte à rebours mis à jour toutes les 150ms si `remaining` est fourni
- Masqué automatiquement dès `isAd === false`

### Blocage réseau (partiel)

`session-security.js` bloque une liste restreinte de domaines tiers via `ses.webRequest.onBeforeRequest`. Ce n'est pas un bloqueur de pub complet — c'est une protection minimale contre les traqueurs les plus courants.
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

## Services connectés v0.3.0 (mis à jour v0.4.7)

### Architecture
```
auth-window.js
  |
  |-- KNOWN_SERVICES : 11 services (Google, Microsoft, Instagram, Facebook,
  |                    Twitch, TikTok, X/Twitter, Discord, Steam,
  |                    GitHub, GitLab)  ← GitHub et GitLab ajoutés v0.4.7
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
  |     → setMaxListeners(200) sur authWin.webContents (v0.4.7, porté à 200 en v0.7.0)
  |     Services connus :
  |       → Détection fin auth : stratégie A (cookies) + C (URL hors marqueurs)
  |       → Fermeture automatique dès auth confirmée
  |     URL personnalisée :
  |       → idem + bouton "J'ai terminé" injecté dans la page
  |       → Stratégie A (cookies génériques) → dialog confirmation
  |       → Confirmation via IPC auth-custom-confirmed

### IPC services personnalisés (v0.4.7)
  add-custom-service ({ label, url })
    → Enregistre immédiatement { id, label, url, connected:false } dans
      settings.customServices AVANT toute tentative de connexion
    → Garantit la persistance même si la fenêtre d'auth est fermée

  open-auth-window ({ serviceKey, customUrl, customLabel })
    → Tente la connexion ; met à jour connected:true/false sur l'entrée
      existante (ne crée plus l'entrée — délégué à add-custom-service)

  delete-custom-service ({ serviceId })
    → Supprime l'entrée par id

  get-settings ()
    → Retourne configGet('settings') (utilisé par portrait-app.js)
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

### Clés d'accès désactivées — WebAuthn (preload-auth.js, v0.6.2)
```
Avant v0.6.2 : authWin étant une BrowserWindow Electron complète (pas une
webview restreinte), elle bénéficiait sans configuration explicite du
support WebAuthn natif de Chromium → Windows Hello, Touch ID et clés FIDO2
fonctionnaient dans la fenêtre de connexion à un service.

Depuis v0.6.2 : désactivé volontairement, toutes plateformes, pour tous
les services (connus et personnalisés) — ajouté en fin de script injecté
(Couche 2, après les 5 signaux anti-détection) :

  6a. window.PublicKeyCredential → undefined (Object.defineProperty get)
      → les services qui testent cette interface avant d'afficher un
        bouton "clé d'accès" ne l'affichent plus du tout.

  6b. navigator.credentials.create() / .get() interceptés :
      → si options.publicKey est présent → Promise.reject(NotAllowedError)
      → sinon → délégué à l'implémentation d'origine (bind() conservé)
      → ne casse pas les usages mot de passe/fédérés de la même API.

Seul email/mot de passe reste disponible dans authWin. Implémentation
strictement scoped à preload-auth.js (authWin) — n'affecte ni les
webviews landscape/portrait, ni le reste de l'application.
```

---

## Structure des fichiers

```
dualview/
|-- package.json              v0.8.0 — +@playwright/test, +playwright, script test
|-- ARCHITECTURE.md           Ce fichier (v0.8.0)
|-- CHANGELOG.md              Historique des versions (Keep a Changelog)
|-- CONTRIBUTING.md           Guide de contribution (prérequis, branches, PR)
|-- HOW_TO_INSTALL.md
|-- README.md                 Guide général et liste des fonctionnalités (v0.8.0)
|-- VERSION_HISTORY.md        Détails des mises à jour par version (v0.8.0)
|-- TODO.md                   Backlog (97% complété — P3+P4 ✅)
|-- assets/
|   |-- icon.ico
|   |-- README.txt
|
|-- installer/
|   |-- build-installer.bat   Build Windows (NSIS)
|   |-- build-installer.ps1   Script PowerShell sous-jacent
|   |-- build-installer.sh    Build macOS (DMG) et Linux (AppImage + deb)
|
|-- tests/                    Tests de régression Playwright (P3-I — v0.8.0)
|   |-- playwright.config.js  Config : Electron, 1 worker, timeout 30s, JUnit
|   |-- dualview.spec.js      5 smoke tests (démarrage, onglets, params, sync, nav)
|
|-- obs-integration/
|   |-- dualview-obs-hotkeys.lua  Script Lua OBS v0.4.4 (cross-platform : Windows/macOS/Linux)
|   |-- OBS_INTEGRATION.md
|
|-- .github/
|   |-- workflows/
|       |-- build.yml         CI/CD : build Windows + GitHub Release sur tag v*
|
|-- src/
    |-- main.js               Processus principal v0.7.0
    |   |                     + tabTypes Map → activeTabType pour menu contextuel [v0.5.4]
    |   |                     + retrait IS_DEV, preload-dev, --dev-source, toggle-dev-tools [v0.5.4]
    |   |                     + IPC reopen-portrait (dom-ready, reconstruction pool) [v0.5.0]
    |   |                     + IPC send-to-portrait (relais canal whitelist) [v0.5.0]
    |   |                     + Événement closed portraitWin → portrait-status:false [v0.5.0]
    |   |                     + FavoritesManager + 5 IPC favorites-*
    |   |                     + IPC add-custom-service (enregistrement immédiat)
    |   |                     + IPC get-settings (portrait-app.js)
    |   |                     + broadcast language-changed vers portrait
    |   |                     + setMaxListeners(200) sur webviews pool (did-attach-webview) [v0.7.0 : 50→200]
    |   |                     + process.on('unhandledRejection') filtre ERR_ABORTED benign [v0.7.0]
    |   |                     + fetchLatestReleaseTag() + isNewerVersion() [v0.7.0]
    |   |                     + IPC check-for-update + open-external-url [v0.7.0]
    |   |                     + shell importé depuis Electron [v0.7.0]
    |   |
    |-- core/                 Modules Node.js / Electron Main
    |   |-- auth-window.js    Fenêtres d'authentification (services connectés)
    |   |                     + setMaxListeners(200) sur authWin.webContents (v0.7.0 : 50→200)
    |   |                     + KNOWN_SERVICES étendu : GitHub, GitLab (v0.4.7)
    |   |-- config-manager.js  Config persistante (dualview-config.json)
    |   |                       + GITHUB_REPO exporté [v0.7.0]
    |   |-- favorites-manager.js Favoris persistants (favorites.json) [v0.4.7]
    |   |                         add / isFavorite / getAll / search / deleteUrl / saveNow
    |   |-- history-manager.js Historique persistant (history.json)
    |   |-- logger.js         Logger toujours actif → dualview.log (v0.5.4 : plus de --dev)
    |   |-- obs-control.js    Serveur HTTP + WebSocket OBS (v0.3.2)
    |   |-- session-security.js Bloqueur pub réseau + permissions
    |   |-- url-guard.js      sanitizeUrl, isAuthUrl, isLoginPage, detectServiceKey
    |   |                     + github.com et gitlab.com dans detectServiceKeyFromUrl [v0.7.0]
    |   |-- context-menu.js   Menu contextuel clic droit natif
    |   |                     + shell.openExternal (lien système) [v0.5.3]
    |   |                     + copyImageAt, ouvrir image onglet, mailto [v0.5.3]
    |   |                     + selectAll, undo, redo (champ éditable) [v0.5.3]
    |   |                     + retour/avance grisés (TAB_TYPE_WEB) [v0.5.4]
    |   |                     + imprimer (TAB_TYPE_WEB) [v0.5.4]
    |   |                     + code source via executeJavaScript (TAB_TYPE_WEB) [v0.5.4]
    |   |                     + inspecter élément (tous onglets, sans IS_DEV) [v0.5.4]
    |   |                     + activeTabType reçu depuis main.js [v0.5.4]
    |
    |-- preload/              Scripts de pont IPC (main world → renderer)
    |   |-- preload-auth.js   Anti-détection Electron (authWin)
    |   |-- preload-landscape.js  API IPC renderer landscape v0.7.0
    |   |                         + retrait getIsDev() et toggleDevTools() [v0.5.4]
    |   |                         + reopenPortrait() [v0.5.0]
    |   |                         + sendToPortrait(channel, data) [v0.5.0]
    |   |                         + addCustomService() [v0.4.7]
    |   |                         + favoritesAdd/Remove/Is/GetAll/Search [v0.4.7]
    |   |                         + checkForUpdate() + openExternalUrl() [v0.7.0]
    |   |-- preload-view.js   API IPC renderer portrait v0.5.0
    |                         + navigate(url) [v0.5.0]
    |                         + canal 'show-topsites' [v0.5.0]
    |                         + getSettings() [v0.4.7]
    |                         + canal 'language-changed' [v0.4.7]
    |
    |-- renderer/             Fichiers chargés par BrowserWindow (UI)
        |-- landscape.html    Fenêtre paysage v0.8.0
        |   |                 + #focus-trigger + #focus-badge (Mode Focus) [v0.5.0]
        |   |                 + #topsites-grid dans #empty-state [v0.5.0]
        |   |                 + #menu-reopen-portrait dans ⚙️ [v0.5.0]
        |   |                 + Apparence + Langue fusionnés dans section-general [v0.5.0]
        |   |                 + Bouton #favorite-btn ★ dans toolbar [v0.4.7]
        |   |                 + Panneau #favorites-panel latéral [v0.4.7]
        |   |                 + #crash-recovery (overlay récupération crash) [v0.7.0]
        |   |                 + Bloc mise à jour (#s-update-check-btn) [v0.7.0]
        |   |                 + Raccourcis redessinés en cartes .sc-card [v0.7.0]
        |   |                 + #dev-btn supprimé (résidu mode --dev retiré en v0.5.4) [v0.7.0]
        |   |                 + #compare-btn ⊞ toolbar + #compare-col + #compare-wv [v0.8.0]
        |   |                 + nav item "Scripts & Styles" + #section-userscripts [v0.8.0]
        |   |                 + <script src="js/landscape-injection.js"> [v0.8.0]
        |   |
        |-- portrait.html     Fenêtre portrait v0.7.0
        |   |                 + #topsites-grid dans #empty-state [v0.5.0]
        |   |                 + #crash-overlay (overlay récupération crash) [v0.7.0]
        |   |
        |-- obs-dock.html     Page dock OBS
        |
        |-- css/
        |   |-- landscape.css Styles fenêtre paysage v0.8.0
        |   |                 + .tab-dragging, .tab-drop-indicator (Drag & Drop) [v0.5.3]
        |   |                 + Mode Focus (.focus-mode, #focus-trigger, #focus-badge) [v0.5.0]
        |   |                 + Top domaines (.has-topsites, #topsites-grid, .topsite-*) [v0.5.0]
        |   |                 + #favorite-btn (états ☆/★), #favorites-panel, .fav-* [v0.4.7]
        |   |                 + #crash-recovery [v0.7.0]
        |   |                 + cartes raccourcis clavier (.sc-card, .sc-row, kbd) [v0.7.0]
        |   |                 + #dev-btn et body.dev-mode #dev-btn supprimés [v0.7.0]
        |   |                 + #compare-col, #compare-wv, body.compare-mode [v0.8.0]
        |   |                 + .us-item, .us-badge-css/js, .us-toggle, .us-textarea [v0.8.0]
        |   |-- portrait.css  Styles fenêtre portrait v0.7.0
        |                     + Top domaines (.has-topsites, #topsites-grid, .topsite-*) [v0.5.0]
        |                     + #crash-overlay [v0.7.0]
        |
        |-- js/
            |-- landscape-i18n.js    Traductions FR/EN v0.8.0
            |                        + focusModeOn/Off/Badge, topSitesTitle, reopenPortrait [v0.5.0]
            |                        + clés favorites/favoriteAdded/etc. [v0.4.7]
            |                        + crash webview (tabCrashedToast/Title/Desc/Reload) [v0.7.0]
            |                        + mise à jour (updateLabel, updateCheckBtn, etc.) [v0.7.0]
            |                        + injection CSS/JS (usDesc, usSaved, etc.) [v0.8.0]
            |                        + comparaison (compareMode, compareLabelDesktop/Mobile) [v0.8.0]
            |-- landscape-webview.js Scripts injectés dans les webviews
            |                        (référence landscape-app.js dans les commentaires corrigée
            |                         → landscape-views.js — landscape-app.js n'a jamais existé
            |                           dans la structure src/ actuelle) [v0.7.0]
            |-- landscape-ui.js      État global, sync, thème, toast, nav, menu ⚙️, resize v0.5.0
            |                        + setFocusMode() + logique survol Mode Focus [v0.5.0]
            |                        + renderTopSites() + maybeShowTopSites() [v0.5.0]
            |                        + updateReopenPortraitBtn() [v0.5.0]
            |                        + handler #menu-reopen-portrait [v0.5.0]
            |                        + handler #menu-favorites [v0.4.7]
            |-- landscape-injection.js Injection CSS/JS par domaine (P4-J — v0.8.0)
            |                          applyUserScripts(wv, url) — matching exact + wildcard
            |                          renderUserScriptsList() — rendu CRUD dans Paramètres
            |                          _injOpenForm(id) / _injCloseForm() — formulaire édition
            |                          Persistance : currentSettings.userScripts[]
            |-- landscape-views.js   Pool de webviews + mode comparaison v0.8.0
            |                        + appel maybeShowTopSites() dans showWebview() [v0.5.0]
            |                        + Guard try/catch canGoBack() avant dom-ready [v0.5.0]
            |                        + refreshFavoriteBtnForUrl après did-navigate [v0.4.7]
            |                        + plugins="true" sur chaque <webview> [v0.7.0]
            |                        + opts.skipIpc dans createWebview/destroyWebview [v0.7.0]
            |                        + render-process-gone / unresponsive [v0.7.0]
            |                        + crashedTabs (Set), crashRecoveryOverlay, crashRecoveryTimer [v0.7.0]
            |                        + showCrashRecovery() + recoverCrashedTab() [v0.7.0]
            |                        + showWebview() vérifie crashedTabs avant affichage normal [v0.7.0]
            |                        + destroyWebview() nettoie crashedTabs + overlay [v0.7.0]
            |                        + applyUserScripts() appelé dom-ready + did-navigate [v0.8.0]
            |                        + toggleCompareMode() + _compareSync(url) [v0.8.0]
            |                        + raccourci Ctrl+Shift+C (compare mode) [v0.8.0]
            |-- landscape-tabs.js    Onglets, navigation URL, omnibar, screenshot
            |                        + TAB_TYPE_WEB/SETTINGS/BLANK + getTabType() [v0.5.3]
            |                        + Drag & Drop avec ligne indicatrice (Option A) [v0.5.3]
            |                        + addTabWithUrl(url, title?) — title optionnel [v0.5.4]
            |                        + refreshFavoriteBtnForUrl après switchTab/update-addressbar [v0.4.7]
            |-- landscape-settings.js Paramètres v0.8.0
            |                         + Raccourcis Ctrl+Shift+H / F11 (Mode Focus) [v0.5.0]
            |                         + Apparence + Langue retirées de la nav latérale [v0.5.0]
            |                         + panneau favoris complet [v0.4.7]
            |                         + SERVICE_ICONS/LABELS incluent github/gitlab [v0.7.0]
            |                         + loadUpdateInfo() + listener #s-update-check-btn [v0.7.0]
            |                         + renderUserScriptsList() appelé section userscripts [v0.8.0]
            |-- landscape-pollers.js Polling pub/vidéo/scroll + initialisation
            |                        + pollScroll() sync compare-wv via getCompareWebview() [v0.8.0]
            |                        + retrait getIsDev / toggleDevTools / dev-btn / F12 [v0.5.4]
            |                        + refreshFavoriteBtnForUrl à l'init [v0.4.7]
            |-- portrait-i18n.js     Traductions FR/EN portrait v0.7.0
            |                        + topSitesTitle [v0.5.0]
            |                        + crash overlay (crashTitle, crashSub, crashReload) [v0.7.0]
            |-- portrait-app.js      Logique portrait v0.7.0
            |                        + handler 'show-topsites' → grille top domaines [v0.5.0]
            |                        + plugins="true" sur chaque <webview> [v0.7.0]
            |                        + portraitTabUrls (Map) — dernière URL par onglet [v0.7.0]
            |                        + crashedTabs (Set), crashOverlay, crashRecoveryTimer [v0.7.0]
            |                        + showCrashOverlay() + recoverCrashedTab() [v0.7.0]
            |                        + render-process-gone dans attachWebviewListeners [v0.7.0]
            |                        + did-navigate/did-navigate-in-page → portraitTabUrls [v0.7.0]
            |                        + showWebview() vérifie crashedTabs [v0.7.0]
            |-- portrait-webview.js  Scripts injectés portrait
```

### Principe de séparation (open source maintenability)

| Dossier | Rôle | Process Electron |
|---------|------|-----------------|
| `src/core/` | Logique métier Node.js, accès filesystem, IPC handlers | Main |
| `src/preload/` | Pont contextIsolation entre main et renderer | Preload (isolé) |
| `src/renderer/` | HTML + CSS + JS UI, jamais d'accès Node.js direct | Renderer |
| `src/renderer/css/` | Feuilles de style externalisées des fenêtres | Renderer |
| `src/renderer/js/`  | Scripts applicatifs externalisés (landscape + portrait) | Renderer |

---

### Fichiers de données utilisateur (runtime, non versionnés)

```
%AppData%/DualView/
|-- dualview-config.json      Configuration (fenêtres, onglets, paramètres)
|                             settings.autoPauseVideo (v0.4.2)
|                             settings.customServices [{id,label,url,connected}]
|                             settings.userScripts [{id,label,domain,css,js,enabled}] (v0.8.0)
|-- history.json              Historique de navigation (v0.4.0)
|                             [{url, title, visitedAt, tabId}, ...]
|                             Max 5000 entrées, géré par history-manager.js
|-- favorites.json            Favoris / marque-pages (v0.4.7)
|                             [{url, title, addedAt}, ...]
|                             Max 500 entrées, géré par favorites-manager.js
|                             Sauvegarde différée 2s + flush à window-all-closed
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

## Paramètres v0.5.0

```
Clé               | Valeurs                         | Effet
------------------|----------------------------------|---------------------------
restoreTabs       | true / false                     | Prochain démarrage
autoPauseVideo    | true / false (défaut: true)      | Immédiat (pause auto YouTube)
autoMutePortrait  | true / false (défaut: true)      | Immédiat (mute portrait)
homepageMode      | knack3 / custom / empty          | Immédiat
customHomepageUrl | URL http/https validée           | Immédiat
newTabMode        | homepage / empty                 | Immédiat (+ top domaines si empty)
appearance        | auto / light / dark              | Redémarrage requis (fusionné dans Général v0.5.0)
language          | fr / en                          | Redémarrage requis (portrait: immédiat v0.4.7) (fusionné dans Général v0.5.0)
customServices    | [{id,label,url,connected}]       | Persisté via add-custom-service (v0.4.7)
searchEngineId    | string                           | Immédiat
searchEngineUrl   | URL http/https                   | Immédiat
screenshotDir     | chemin système ou ''             | Immédiat
portraitPreset    | iphone15 / pixel8 / galaxys24 / ipad | Via modale redimensionnement
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
| 0.4.5 | Refactoring open source de main.js (1323 → 815 lignes, −38%). Extraction de 4 modules dans core/ : config-manager.js, url-guard.js, session-security.js, context-menu.js. |
| 0.4.6 | Fix AUTO_PAUSE_SCRIPT landscape (flag posé avant de trouver la vidéo → retries bloqués). Fix AUTO_PAUSE_SCRIPT Shorts portrait (garde primaire déplacée côté renderer Electron, isYouTubeShort). Fix retries orphelins portrait (__dualviewAutoPauseAborted). Fix MaxListenersExceededWarning (timer de sécurité annulable). Fix thème portrait au démarrage (initialTheme via contextBridge, backgroundColor dynamique). |
| 0.4.7 | **Favoris** : favorites-manager.js (core), favorites.json, bouton ★ toolbar, panneau latéral, entrée ⚙️. **Fix services personnalisés** : add-custom-service IPC (enregistrement immédiat), open-auth-window ne crée plus l'entrée. **GitHub/GitLab** ajoutés dans KNOWN_SERVICES et SERVICE_LABELS. Filtre isNowKnownService() anti-doublons. **Fix portrait** : getSettings() + canal language-changed dans preload-view.js. **Fix MaxListenersExceededWarning** : setMaxListeners(50) sur webviews pool (did-attach-webview) + authWin.webContents. |
| 0.5.0 | **Mode Focus** (F) : Ctrl+Shift+H / F11, masque toolbar, bande de détection 8px, badge discret, survol maintenu. **Top domaines** : onglet vide affiche le top 10 domaines les plus visités (historique toutes sessions, dédoublonné par hostname, max disponible) dans landscape et portrait (données relayées via IPC show-topsites). **Fusion paramètres** : Apparence + Langue déplacés dans Général, nav latérale réduite à 4 entrées. **Réouverture portrait** : bouton "Rouvrir le portrait" dans ⚙️ (visible si portrait fermé), reconstruction complète du pool via dom-ready (tous onglets + onglet actif + URL). **Fix canGoBack avant dom-ready** : guard try/catch dans switchTab (landscape-tabs.js). |
| 0.6.1 | **Fix** drag & drop : dépôt dans un espace vide de la barre d'onglets retire désormais l'onglet de son groupe (zone de repli sur `#tab-bar`). **Fix** onglets épinglés persistés entre sessions (`pinnedTabs` dans `get-store`/`save-tabs`). **Fix** groupe orphelin ("zombie") lors du déplacement d'un onglet vers un nouveau groupe (`groupAddTab` nettoie l'ancien groupe). **Fix** erreurs favicon en console DevTools : fetch HTTP déporté dans le main process (`net.request`, nouveau canal IPC `fetch-favicon`), le renderer n'assigne plus que des data: URL déjà vérifiées. |
| 0.6.2 | **Sécurité** : clés d'accès (WebAuthn) désactivées dans la fenêtre d'authentification des services connectés, toutes plateformes — Windows Hello, Touch ID et clés FIDO2 ne sont plus proposés, email/mot de passe uniquement. `window.PublicKeyCredential` masqué + `navigator.credentials.create()`/`.get()` interceptés pour rejeter les requêtes `publicKey` (`preload-auth.js`). |
| 0.7.0 | **Crash recovery** : `render-process-gone` + `unresponsive` sur toutes les webviews (landscape + portrait) ; overlay inline `#crash-recovery`/`#crash-overlay` ; auto-reload 10 s ; `recoverCrashedTab()` avec `skipIpc:true`. **Lecteur PDF** : `plugins="true"` sur toutes les `<webview>`. **Vérification mise à jour** : `fetchLatestReleaseTag()` + `isNewerVersion()` + IPC `check-for-update`/`open-external-url` + bouton Paramètres → Général. **Correctifs** : `SERVICE_ICONS/LABELS` github/gitlab (tuiles invisibles depuis v0.4.7) ; `detectServiceKeyFromUrl()` github/gitlab ; `setMaxListeners(50→200)` landscape/portrait/webviews ; `process.on('unhandledRejection')` filtre `ERR_ABORTED` ; `#dev-btn` résiduel supprimé. **Documentation** : bloqueur pub corrigé en "détection pub" (3 niveaux jamais implémentés) ; `landscape-webview.js` référence `landscape-app.js` corrigée. **Raccourcis clavier** redessinés (cartes `.sc-card`, `<kbd>` stylés). |
| 0.7.1 | **Navigateur P5** : indicateur de chargement (barre 3px theme-aware), recherche dans la page (Ctrl+F, `findInPage`, compteur X/Y), zoom par domaine (Ctrl+/−/0, persistance localStorage), téléchargements configurables (setting allowDownloads/downloadDir/downloadAskPath, mini-gestionnaire ⬇️), PDF natif documenté. |
| 0.8.0 | **Tests node:test P3-I** : 5 smoke tests (`tests/dualview.spec.js`) + job CI `test` dans `build.yml`. **Injection CSS/JS P4-J** : nouveau module `landscape-injection.js` — `applyUserScripts(wv, url)` sur chaque `dom-ready` et `did-navigate` ; matching domaine exact ou wildcard `*.exemple.com` ; CRUD complet dans Paramètres → Scripts & Styles ; persistance dans `settings.userScripts[]`. **Mode comparaison P4-K** : bouton ⊞ toolbar + `Ctrl+Shift+C` ; colonne 390px UA iPhone 15 ; `_compareSync(url)` sur navigation + changement d'onglet ; `getCompareWebview()` + scroll synchronisé dans `pollScroll()` (même % appliqué à la hauteur scrollable mobile). |

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