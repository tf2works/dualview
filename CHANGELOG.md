# Changelog DualView

Toutes les modifications notables sont documentées dans ce fichier.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)
Versionnage : [Semantic Versioning](https://semver.org/lang/fr/)

---

## [0.4.7] — 2026

### Ajouté
- **Favoris (marque-pages)** : mise en favori de n'importe quelle page en un clic
  - Bouton étoile ★ dans la barre de contrôle (entre ▶ et 📷)
    - ☆ inactif = page non sauvegardée ; ★ dorée = page en favori
    - Clic = toggle avec toast de confirmation
    - Mise à jour automatique sur navigation, changement d'onglet, démarrage
  - Panneau latéral **Favoris** (même UX que l'historique)
    - Accessible via ⚙️ → **Favoris** (entrée ajoutée sous "Historique")
    - Barre de recherche fulltext (URL + titre)
    - Suppression individuelle uniquement — pas de bouton "tout effacer"
    - Clic sur une entrée → navigation + fermeture du panneau
    - Fermeture par ✕, Échap ou clic extérieur
  - Persistance dans `%AppData%/DualView/favorites.json`
    - Max 500 entrées — FIFO sur les plus anciennes
    - Sauvegarde différée 2s (batch) + flush immédiat à la fermeture
  - `src/core/favorites-manager.js` : nouveau module
  - i18n FR/EN complète (6 nouvelles clés)

- **GitHub et GitLab** ajoutés dans la grille "Services connectés"
  - `KNOWN_SERVICES` dans `auth-window.js` étendu (GitHub, GitLab)
  - `SERVICE_ICONS` et `SERVICE_LABELS` dans `landscape-settings.js` mis à jour

- **IPC `add-custom-service`** : enregistre un service personnalisé immédiatement dans `settings.customServices` dès la validation du formulaire, indépendamment du résultat de la connexion

- **IPC `get-settings`** : expose les settings au renderer portrait (`portrait-app.js`)

### Corrigé
- **Services personnalisés non affichés** : l'entrée n'était créée dans la config que si l'utilisateur confirmait explicitement la popup "J'ai terminé". Fermer la fenêtre d'auth ou annuler la confirmation supprimait le service. Résolu par `add-custom-service` qui persiste l'entrée en amont ; `open-auth-window` met à jour uniquement `connected:true/false`
- **Services personnalisés devenus services officiels** (ex: GitHub ajouté manuellement avant v0.4.7) : filtre `isNowKnownService(url)` dans `loadServicesStatus()` masque les doublons dans la liste custom sans modifier les données stockées
- **`TypeError: window.dualview.getSettings is not a function`** (console portrait) : `getSettings` n'était pas exposé dans `preload-view.js`
- **Canal `language-changed` non reçu par portrait** : canal absent de la liste blanche de `preload-view.js` et jamais émis par `main.js` lors du changement de langue. Les deux lacunes corrigées
- **`MaxListenersExceededWarning` sur webviews** : `setMaxListeners(50)` ajouté dans `did-attach-webview` pour chaque webview du pool landscape (cause principale) et sur `authWin.webContents` dans `auth-window.js`

### Modifié
- `src/core/favorites-manager.js` : nouveau module (symétrique à `history-manager.js`)
- `src/core/auth-window.js` : `setMaxListeners(50)` sur `authWin.webContents` ; GitHub et GitLab dans `KNOWN_SERVICES`
- `src/main.js` : `FavoritesManager` importé + instancié ; 5 IPC `favorites-*` ; `favorites.saveNow()` à `window-all-closed` ; `add-custom-service` ; `get-settings` ; broadcast `language-changed` vers portrait ; `setMaxListeners(50)` sur webviews via `did-attach-webview` ; `open-auth-window` refactorisé (ne crée plus l'entrée)
- `src/preload/preload-landscape.js` : `addCustomService()` + 5 API `favorites*`
- `src/preload/preload-view.js` : `getSettings()` + canal `'language-changed'`
- `src/renderer/landscape.html` : bouton `#favorite-btn`, panneau `#favorites-panel`, entrée `#menu-favorites` dans ⚙️, section `#svc-custom-section` (services perso séparés du formulaire)
- `src/renderer/css/landscape.css` : styles `#favorite-btn` (☆/★), `#favorites-panel`, `.fav-*`
- `src/renderer/js/landscape-i18n.js` : 6 nouvelles clés FR/EN (`favorites`, `favoritesEmpty`, `favoritesEmptyHint`, `favoriteAdded`, `favoriteRemoved`, `servicesAddCustomLabel`) ; `servicesCustom` mis au pluriel
- `src/renderer/js/landscape-ui.js` : handler `#menu-favorites`
- `src/renderer/js/landscape-settings.js` : panneau favoris complet (`openFavoritesPanel`, `closeFavoritesPanel`, `renderFavoritesList`, `updateFavoriteBtn`, `refreshFavoriteBtnForUrl`, toggle étoile) ; `addCustomService()` appelé avant `connectService()` ; `SERVICE_ICONS/LABELS` + GitHub/GitLab ; `isNowKnownService()` filtre anti-doublons ; `#svc-custom-section` visible si ≥ 1 service perso
- `src/renderer/js/landscape-views.js` : `refreshFavoriteBtnForUrl()` après `did-navigate`
- `src/renderer/js/landscape-tabs.js` : `refreshFavoriteBtnForUrl()` après `switchTab` et `update-addressbar` ; `updateFavoriteBtn(false)` sur onglet paramètres
- `src/renderer/js/landscape-pollers.js` : `refreshFavoriteBtnForUrl()` à l'initialisation

---

## [0.4.6] — 2026

### Corrigé
- **`AUTO_PAUSE_SCRIPT` landscape ne pausait pas sans pub** : le flag `__dualviewAutoPauseDone` était posé avant même de trouver la vidéo, bloquant tous les retries si le player YouTube n'était pas encore dans le DOM (`landscape-webview.js`)
- **`AUTO_PAUSE_SCRIPT` landscape pas déclenché immédiatement** : ajout d'un appel `injectAutoPause` au `dom-ready` (en plus des timers à 2s et 5s existants) — couvre les rechargements où le player est déjà présent (`landscape-views.js`)
- **`AUTO_PAUSE_SCRIPT` pausait les YouTube Shorts dans portrait** : la détection Shorts déplacée côté renderer Electron (`isYouTubeShort(url)` sur `wv.getURL()` / `e.url`) — toujours fiable vs `location.href` dans le script injecté qui peut être périmé lors des navigations SPA (`portrait-app.js`)
- **Retries `AUTO_PAUSE_SCRIPT` portrait orphelins** : ajout du flag `__dualviewAutoPauseAborted` dans `resetPageFlags()` pour couper les `setTimeout` en vol lors d'une navigation rapide (`portrait-app.js`, `portrait-webview.js`)
- **`MaxListenersExceededWarning`** : timer de sécurité portrait stocké et annulé (`clearTimeout`) à chaque nouveau `dom-ready` ou `did-navigate` pour éviter l'accumulation de listeners `did-stop-loading` (`portrait-app.js`)
- **Thème portrait au démarrage** : `backgroundColor` portrait hardcodé `#ffffff` remplacé par `getTheme()` ; `initialTheme` exposé via `contextBridge` (synchrone) pour éviter le flash de fond quand l'OS est sombre mais le thème sauvegardé est clair (`main.js`, `preload-landscape.js`, `preload-view.js`, `landscape-ui.js`, `portrait-app.js`)

### Modifié
- `src/renderer/js/landscape-webview.js` : `AUTO_PAUSE_SCRIPT` — flag `__dualviewAutoPauseDone` posé uniquement quand la vidéo est trouvée ; guard Shorts ajouté dans `injectAutoPause`
- `src/renderer/js/landscape-views.js` : `injectAutoPause` appelée immédiatement en `dom-ready`
- `src/renderer/js/portrait-app.js` : helper `isYouTubeShort(url)` ; guard côté renderer avant injection `AUTO_PAUSE_SCRIPT` dans les 3 événements (`dom-ready`, `did-navigate-in-page`, `did-navigate`) ; timer de sécurité annulable ; `resetPageFlags` étendu avec `__dualviewAutoPauseAborted` ; thème initial synchrone
- `src/renderer/js/portrait-webview.js` : `AUTO_PAUSE_SCRIPT` simplifié — détection Shorts réduite à un filet URL minimal (garde primaire déplacée dans `portrait-app.js`) ; support `__dualviewAutoPauseAborted`
- `src/preload/preload-landscape.js` : `initialTheme` exposé via `contextBridge`
- `src/preload/preload-view.js` : `initialTheme` exposé via `contextBridge`
- `src/renderer/js/landscape-ui.js` : application synchrone de `initialTheme` avant tout rendu
- `src/main.js` : `backgroundColor` des deux fenêtres basé sur `getTheme()` ; `--initial-theme` passé via `additionalArguments`

---

## [0.4.5] — 2026

### Ajouté
- **Support macOS** : build `.dmg` (x64 + arm64), icône `.icns`, lifecycle `activate` + `window-all-closed` macOS-compatible
- **Support Linux** : build `.AppImage` + `.deb` (x64), icône `.png`
- `installer/build-installer.sh` : script shell cross-platform (macOS DMG + Linux AppImage/deb)
- `assets/README.txt` : instructions de génération de `icon.icns` (macOS) et `icon.png` (Linux)
- `package.json` : scripts `build:win` / `build:mac` / `build:linux` + cibles electron-builder macOS et Linux
- `.github/workflows/build.yml` : 3 jobs de build parallèles (windows/macos/linux) + job release agrégateur

### Modifié
- `src/main.js` : fonction `getAppIcon()` cross-platform (`.ico` / `.icns` / `.png` selon OS) ; `sec-ch-ua-platform` dynamique (`Windows` / `macOS` / `Linux`) ; `window-all-closed` conditionnel sur macOS
- `src/core/auth-window.js` : fonction `getDesktopUA()` — User-Agent adapté à l'OS réel (Windows NT / Macintosh / X11 Linux) ; icône cross-platform
- `obs-integration/dualview-obs-hotkeys.lua` : détection OS via `package.config` ; commande curl cross-platform (`start /B` Windows, `&` macOS/Linux)
- `CONTRIBUTING.md` : prérequis et section build mis à jour pour les 3 plateformes
- `OBS_INTEGRATION.md` : note curl cross-platform ajoutée

---

## [0.4.4] — 2026

### Ajouté
- Support **macOS** : build `.dmg` (x64 + arm64), cible `electron-builder` configurée
- Support **Linux** : build `.AppImage` (x64), cible `electron-builder` configurée
- `CONTRIBUTING.md` : guide complet pour les contributeurs (prérequis, structure, nommage branches, PR, points de vigilance)
- `CHANGELOG.md` : ce fichier, au format Keep a Changelog
- `.github/workflows/build.yml` : GitHub Actions — build automatique sur chaque tag `v*` et publication GitHub Release
- `src/renderer/css/landscape.css` : styles landscape externalisés (1 799 lignes)
- `src/renderer/css/portrait.css` : styles portrait externalisés (363 lignes)
- `src/renderer/js/landscape-i18n.js` : traductions FR/EN landscape + `t()` + `applyTranslations()`
- `src/renderer/js/landscape-webview.js` : scripts injectés dans les webviews landscape
- `src/renderer/js/landscape-ui.js` : état global, sync, thème, toast, nav, redimensionnement
- `src/renderer/js/landscape-views.js` : pool de webviews + popup login
- `src/renderer/js/landscape-tabs.js` : onglets, URL, omnibar, screenshot
- `src/renderer/js/landscape-settings.js` : paramètres, services, historique, raccourcis clavier
- `src/renderer/js/landscape-pollers.js` : polling pub/vidéo/scroll + initialisation
- `src/renderer/js/portrait-i18n.js` : traductions FR/EN portrait + `tp()` + `applyPortraitTranslations()`
- `src/renderer/js/portrait-app.js` : logique portrait (pool webviews, IPC handlers, remute, init)
- `src/renderer/js/portrait-webview.js` : scripts injectés dans les webviews portrait (`VIDEO_EXECUTOR_SCRIPT`, `AUTO_PAUSE_SCRIPT`)
- i18n portrait (option B) : attributs `data-i18n` sur tous les textes statiques des overlays portrait
- Indicateur sync portrait traduit dynamiquement (`● Sync active` / `⏸ Sync pausée`) via `tp()`
- Compte à rebours pub portrait traduit dynamiquement selon la langue active
- Écoute IPC `language-changed` dans portrait : mise à jour en temps réel sans redémarrage

### Modifié
- `src/main.js` : `sec-ch-ua-platform` adapté dynamiquement selon `process.platform` (`Windows` / `macOS` / `Linux`)
- `src/core/logger.js` : commentaire mis à jour avec les chemins userData cross-platform
- `obs-integration/dualview-obs-hotkeys.lua` : `send_command()` cross-platform — `start /B` (Windows), `nohup &` (macOS/Linux)
- `package.json` : ajout des scripts `build:win`, `build:mac`, `build:linux` et des sections `mac`/`linux` dans la config electron-builder
- `.github/workflows/build.yml` : 3 jobs parallèles (Windows, macOS, Linux) + job `release` agrégeant les 3 artefacts
- `landscape.html` : 4 441 → 419 lignes (−91%) — HTML squelette uniquement, `<link>` CSS + 7 `<script src>`
- `portrait.html` : 996 → 63 lignes (−94%) — HTML squelette avec `data-i18n` + 3 `<script src>`
- `src/main.js` : chemins mis à jour vers `core/`, `preload/`, `renderer/`
- `src/core/auth-window.js` : chemin preload-auth → `../preload/`, chemin assets → `../../assets/`

### Structure
- Réorganisation de `src/` en sous-dossiers : `core/` (logique Node.js), `preload/` (ponts IPC), `renderer/` (UI)
- `renderer/css/` et `renderer/js/` pour les ressources externalisées

---

## [0.4.3] — 2026

### Corrigé
- **Boucle vidéo YouTube** : la vidéo portrait ne tourne plus en boucle sur les premières secondes au lancement, après une pause, ou après repositionnement de la timeline
- Double `MutationObserver` par webview : remplacé par un observer unique (flag `__dualviewObserverActive`)
- `load-url` : vérification que l'URL change réellement avant de réassigner `src`
- Commandes en attente expirées : `pendingCmd` avec TTL 5 s — les commandes obsolètes n'affectent plus la mauvaise vidéo

### Modifié
- Protocole de sync vidéo refactorisé en commandes atomiques séquencées :
  - Pause : ① `pause()` → ② `seek-to(t)` après 50 ms
  - Lecture : ① `seek-to(t)` → ② `play()` après 100 ms
  - `play()` ne force plus `currentTime` → plus de boucle `seeked → play`
- `drift-check` conditionnel : correction périodique uniquement si portrait est à l'arrêt ET écart > 2 s
- `video-timeupdate` remplacé par `video-drift-check` (polling 5 s, envoyé seulement si lecture en cours)
- `sync-resume-state` : ré-injection de l'executor sans rechargement (scénario B)

---

## [0.4.2] — 2026

### Ajouté
- **Pause automatique YouTube** : vidéos classiques pausées au chargement dans les deux fenêtres (option désactivable dans Paramètres → Général)
- **Overlay pub portrait** : message "Publicité en cours" + compte à rebours pendant les pubs YouTube
- **Bouton remute** : bouton rouge en bas à droite de portrait si la vidéo a été démutée accidentellement (polling 2 s)
- **Paramètre `autoMutePortrait`** : force `video.muted = true` dans portrait, configurable dans Paramètres → Général

### Modifié
- Bloqueur de publicités renforcé à 3 niveaux : réseau (50+ domaines), CSS cosmétique, stub SDK IMA
- Sync vidéo : réalignement exact de la timeline portrait à chaque play
- Dropdown historique ← → : fermeture automatique 500 ms après que la souris quitte la zone

---

## [0.4.1] — 2026

### Ajouté
- **Raccourcis clavier** : `Alt+←/→` (nav), `F5`/`Ctrl+R` (recharge), `Ctrl+T/W` (onglets), `Ctrl+Tab`, `Ctrl+L`/`F6` (barre d'adresse)
- **Boutons souris** Retour/Avance (boutons latéraux 3 et 4)
- **Liens `target="_blank"`** → nouvel onglet DualView (au lieu d'une fenêtre système)
- **Menu contextuel** clic droit : lien, image, texte, page. Option "Enregistrer l'image sous…" (seule exception aux téléchargements bloqués)

---

## [0.4.0] — 2026

### Ajouté
- **Redimensionnement Portrait repensé** : modale ⚙️ → Redimensionner avec préréglages (iPhone 15, Pixel 8, Galaxy S24, iPad) + taille libre (contour orange). Le bouton ✅ de toolbar est supprimé.
- **Capture instantanée** 📷 : PNG horodaté des deux vues simultanément, dossier configurable dans Paramètres → Général
- **Omnibar** : sélection auto au clic, Échap annule, suggestions (historique, domaine, recherche), navigation clavier ↑↓
- **Moteur de recherche configurable** : DuckDuckGo par défaut ; Google, Bing, Brave, Qwant prédéfinis ; moteurs personnalisés (nom + URL template)
- **Historique de navigation persistant** : panneau latéral groupé par date, recherche fulltext, suppression individuelle/globale. Max 5 000 entrées (`history.json`)
- **Dropdown ← →** : historique de navigation de l'onglet actif au survol, fermeture auto

---

## [0.3.2] — 2026

### Ajouté
- **Intégration OBS** : serveur local HTTP+WebSocket (`127.0.0.1`, protégé par token)
- **Dock OBS** : panneau de navigateur personnalisé avec contrôle sync, URL, onglets en temps réel
- **Script Lua hotkeys** : vrais raccourcis natifs OBS (pause/reprise/redémarrage sync, navigation, onglets)
- `obs-integration/OBS_INTEGRATION.md` : guide complet de configuration

---

## [0.3.1] — 2026

### Corrigé
- Fix cookies portrait (partition partagée)
- Fix `ERR_ABORTED` sur webviews après handler `onBeforeSendHeaders` en double
- Fix sync vidéo YouTube (timing)
- Fix pub sur la première vidéo chargée
- Auth Microsoft plus robuste

### Ajouté
- Overlay paramètres dans portrait (page grisée pendant la configuration)
- Mode debug `--dev` : bouton 🔧 DevTools webview + F12 DevTools renderer

---

## [0.3.0] — 2026

### Ajouté
- **Services connectés** : 9 services pré-configurés (Google, Microsoft, Instagram, Facebook, Twitch, TikTok, X/Twitter, Discord, Steam) + URL personnalisée
- **Fenêtre d'authentification dédiée** : anti-détection Electron 5 couches (preload-auth.js), compatibilité Windows Hello / FIDO2
- **Démarrage sync différé** : synchronisation activée 3 s après ouverture
- **Bouton ● Sync** : Pause / Reprendre / Redémarrer dans la toolbar
- **Détection pages de connexion** : popup landscape + overlay portrait
- YouTube Shorts : exemptés du bloqueur de publicités

---

## [0.2.6] — 2026

### Ajouté
- **Pool de webviews** : switch d'onglet sans rechargement, état préservé en mémoire

---

## [0.2.5] — 2026

### Ajouté
- Sécurité : permissions bloquées (caméra, micro, géoloc, notifications)
- Panneau Paramètres : apparence, langue (FR/EN), page d'accueil
- Menu ⚙️ dans la toolbar
- i18n FR/EN (landscape)

---

## [0.2.4] — 2026

### Modifié
- Contrôle intégré dans la fenêtre Paysage (plus de fenêtre séparée)
- Portrait taille fixe (non redimensionnable par défaut)

---

## [0.2.3] — 2026

### Corrigé
- Fix sync vidéo

---

## [0.2.2] — 2026

### Corrigé
- Fix bloqueur de publicités
- Fix navigation back/forward

---

## [0.2.1] — 2026

### Ajouté
- Bloqueur de publicités (liste de domaines)
- Boutons de navigation ← →

---

## [0.2.0] — 2026

### Ajouté
- Synchronisation vidéo (play/pause/seek)
- Support YouTube, TikTok, Instagram

---

## [0.1.0] — 2026

### Ajouté
- Version initiale
- Navigation synchronisée paysage/portrait
- Onglets multiples
- Synchronisation scroll (pourcentage)
- Thèmes clair/sombre