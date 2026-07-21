# Changelog DualView

Toutes les modifications notables sont documentées dans ce fichier.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)
Versionnage : [Semantic Versioning](https://semver.org/lang/fr/)

---

## [1.0.0] — 2026

### Ajouté

- **Raccourcis souris étendus — ouverture de liens en arrière-plan** (`src/main.js`, `src/renderer/js/landscape-tabs.js`, `src/renderer/js/landscape-settings.js`)
  - Clic molette sur un lien → nouvel onglet sans y basculer.
  - `Ctrl` + clic sur un lien → nouvel onglet sans y basculer.
  - `Ctrl` + `Shift` + clic sur un lien → nouvel onglet avec bascule immédiate.
  - Implémentation : `setWindowOpenHandler` (`main.js`) lit le champ `disposition` fourni par Chromium et le transmet au renderer ; `addTabWithUrl()` (`landscape-tabs.js`) accepte une nouvelle option `{ background }`.
  - Le clic droit → « Ouvrir dans un nouvel onglet » (`core/context-menu.js`) garde son comportement historique (bascule immédiate), non affecté.
- **Boutons latéraux souris (retour/avance) — réécriture complète** (`src/renderer/js/landscape-webview.js`, `src/renderer/js/landscape-views.js`, `src/renderer/js/landscape-pollers.js`)
  - Diagnostic terminal a confirmé qu'aucune API Electron (`before-input-event`, `app-command`) ne reçoit jamais l'info souris dans cette architecture `<webview>` imbriquée — y compris pour un simple clic gauche — alors que ces mêmes boutons fonctionnent nativement dans Chrome/Firefox/Edge sur la même machine.
  - Solution retenue : script injecté dans le contenu de chaque page (`MOUSE_NAV_INJECT`), qui capte l'événement DOM standard `mousedown` (`button===3` = arrière, `button===4` = avant) — garanti, indépendant des particularités d'Electron. Le résultat est lu par un polling léger (`pollMouseNav`, 100 ms, `landscape-pollers.js`) qui réutilise `window.dualview.navBack()`/`navForward()`, exactement le même chemin que les boutons `←`/`→` de la toolbar (aucun nouveau protocole de synchronisation).
  - `app-command` reste présent dans `main.js` en repli silencieux et sans effet de bord (peut fonctionner sur certaines configurations hors `<webview>`), sans garantie ni log.
- **Zoom `Ctrl` + molette** (`src/renderer/js/landscape-webview.js`, `src/renderer/js/landscape-views.js`, `src/renderer/js/landscape-pollers.js`)
  - Le geste natif Chromium n'étant pas garanti à l'intérieur d'une `<webview>`, un script injecté (`ZOOM_WHEEL_INJECT`) capte l'événement `wheel` avec `ctrlKey` directement dans la page (`preventDefault` uniquement dans ce cas — le scroll normal n'est jamais affecté) ; le delta accumulé est lu par polling (`pollZoomWheel`, 150 ms) et appliqué via `adjustZoom()`, la fonction déjà utilisée par les raccourcis clavier `Ctrl+`/`Ctrl-`.

### Corrigé

- **Favoris — ajout silencieusement refusé sans message d'erreur** (`src/core/favorites-manager.js`, `src/renderer/js/landscape-settings.js`, `src/renderer/js/landscape-i18n.js`)
  - Bug : cliquer sur ★ pour ajouter la page courante aux favoris affichait toujours l'étoile pleine et le toast « Page ajoutée aux favoris », **même quand l'ajout échouait réellement** — notamment pour les URLs de domaines considérés comme des pages de connexion (`AUTH_DOMAINS_FAV` dans `favorites-manager.js` : Google, Microsoft, Facebook, Instagram, TikTok, Twitter/X, Discord, Steam, Twitch). Ces favoris n'apparaissaient donc jamais dans le panneau ⚙️ → Favoris.
  - Cause : `favoriteBtn` (click handler, `landscape-settings.js`) n'exploitait pas la valeur booléenne retournée par `window.dualview.favoritesAdd()` / `FavoritesManager.add()`.
  - Correctif (1/2) : le clic sur ★ vérifie désormais le retour de `favoritesAdd()` ; en cas de refus, l'étoile reste inactive et un nouveau toast d'avertissement (`favoriteBlocked`) informe l'utilisateur, plutôt que de laisser croire à un ajout réussi.
  - Correctif (2/2) : `AUTH_DOMAINS_FAV` (`favorites-manager.js`) a été restreinte aux hôtes **purement** dédiés à l'authentification (`accounts.google.com`, `login.microsoftonline.com`, `login.live.com`, `account.live.com`, `login.steampowered.com`, `passport.twitch.tv`). Les plateformes de contenu (`twitter.com`/`x.com`, `discord.com`, `www.instagram.com`, `www.tiktok.com`, `www.facebook.com`, `store.steampowered.com`) ne sont plus bloquées en bloc : seules leurs pages de connexion le restent, via la détection de chemin existante (`/login`, `/signin`, `/oauth`, `/auth`). Il est donc de nouveau possible de favoriser une page de profil/chaîne/produit sur ces sites.
  - Effet de bord attendu : une URL de connexion sur ces plateformes dont le chemin ne matcherait pas exactement le motif `/login|/signin|/sign-in|/oauth|/auth` (ex. flow de connexion à chemin inhabituel) ne serait plus bloquée par le domaine seul. Compromis jugé acceptable pour restaurer l'usage principal (favoris de chaînes/profils) — à surveiller si un nouveau cas de fuite d'URL de login apparaît.

### Retiré

- **`Alt` + molette = Retour/Avance** — tentative abandonnée. Reposait sur `before-input-event` (type `mouseWheel`), confirmé non fonctionnel par diagnostic (voir ci-dessus). Pourrait être réintroduit via le même principe d'injection DOM que `MOUSE_NAV_INJECT`/`ZOOM_WHEEL_INJECT` si le besoin se confirme.

## [0.9.3] — 2026

### Corrigé

- **Sync vidéo — seek non synchronisé pendant la lecture (flèches, j/l, touches 0-9 YouTube)** (`src/main.js`, `src/preload/preload-landscape.js`, `src/renderer/js/landscape-pollers.js`)
  - Bug : en navigation normale **et** en mode vidéo seule, avancer/reculer la vidéo au clavier (flèches ←/→ sur YouTube, et plus généralement tout raccourci ou scrub qui ne met pas la vidéo en pause) pendant la lecture ne se répercutait pas dans la fenêtre Portrait.
  - Cause : ce type de seek déclenche un `seeked` isolé (sans `pause` autour). Le protocole existant routait ça vers le chemin PLAY (`seek-to` puis `play`), mais à ce moment le Portrait est déjà en lecture — la garde anti-boucle de `portrait-webview.js` ignore alors le `seek-to`, exactement comme pour le bug corrigé en v0.9.2 côté mode vidéo seule, mais ici au niveau du protocole générique (donc valable pour n'importe quel site/lecteur).
  - Correctif : nouveau 3e chemin de protocole `video-seek-while-playing` : `pause()` → `seek-to(t)` [+50ms] → `play()` [+150ms]. La branche `seek` de `landscape-pollers.js` route désormais vers ce chemin quand la vidéo landscape est déjà en lecture, au lieu du chemin PLAY.
  - Effet de bord attendu : micro-pause (~150-200ms) visible côté Portrait à chaque seek en lecture — même compromis déjà accepté pour le chemin PAUSE existant.
  - Aucune modification de `portrait-webview.js` : le nouveau chemin réutilise les actions `video-cmd` existantes (`pause`, `seek-to`, `play`).

## [0.9.2] — 2026

### Corrigé

- **Mode vidéo seule — timeline non synchronisée pendant la lecture** (`src/renderer/js/landscape-webview.js` — `focusVideoSeek`)
  - Bug : un seek fait via la barre custom du mode vidéo seule ne se répercutait sur la fenêtre Portrait que si la vidéo était en pause. Pendant la lecture, le seek était silencieusement ignoré côté Portrait.
  - Cause : `focusVideoSeek()` modifiait `currentTime` sans jamais mettre la vidéo en pause, contrairement aux lecteurs natifs (YouTube, etc.) qui pausent automatiquement pendant un scrub. Cela déclenchait un `seeked` isolé (sans `pause`/`play` autour), que le protocole de synchronisation existant (`video-cmd{seek-to}`) ignore par construction lorsque la vidéo Portrait est déjà en lecture (garde anti-boucle).
  - Correctif : `focusVideoSeek()` met désormais la vidéo en pause avant le seek (si elle jouait), puis relance la lecture ~120ms après — reproduisant la séquence `pause → seek → play` déjà gérée correctement par le protocole de synchro existant. Aucune modification du protocole partagé (`main.js`, `preload-landscape.js`, `landscape-pollers.js`, `portrait-webview.js`).
  - Effet de bord attendu : micro-pause (~120ms) visible dans les deux fenêtres au moment du seek en lecture, identique au comportement déjà observé avec un scrub YouTube classique.

## [0.9.1] — 2026

### Ajouté

- **Recherche dans les paramètres** (`landscape.html`, `landscape.css`, `landscape-i18n.js`, nouveau module `landscape-settings-search.js`)
  - Champ de recherche unique, affiché en permanence en tête de `.s-content`, visible depuis n'importe quelle section du panneau Paramètres
  - Recherche **globale** : index construit à partir des libellés statiques des 7 sections (`.s-heading`, `.s-label`, `.s-check-label`, `.s-info-title`, `.sc-card-title`, `.sc-action` + description associée), à partir du texte déjà affiché à l'écran (donc déjà traduit — pas de dictionnaire de recherche séparé)
  - Matching par mots-clés, insensible à la casse/aux accents, avec **tolérance aux fautes de frappe** (distance de Levenshtein par mot, seuil selon la longueur du mot)
  - Sélection d'un résultat → redirection vers la bonne section (réutilise le listener `.s-nav` existant, donc redéclenche `loadServicesStatus`/`loadObsInfo`/`buildExportChecklist`/`renderUserScriptsList` si nécessaire) + surlignage temporaire (`.ssr-highlight-pulse`) de la ligne trouvée
  - Navigation clavier `↑`/`↓`/`Entrée`/`Échap`, cohérente avec l'omnibar de la barre d'adresse
  - Portée actuelle limitée aux libellés statiques ; les entrées générées dynamiquement (tuiles Services connectés, checklist Export/Import, règles Scripts & Styles) ne sont pas encore indexées

## [0.9.0] — 2026

### Ajouté

- **Mode vidéo seule** (`landscape-video-focus.js`, `landscape-webview.js`, `landscape-views.js`, `landscape-settings.js`, `context-menu.js`, `portrait-app.js`, `portrait-webview.js`, `main.js`, `preload-landscape.js`, `preload-view.js`, `landscape.html`, `portrait.html`, `landscape.css`, `portrait.css`, `landscape-i18n.js`, `portrait-i18n.js`)
  - Isole la vidéo de l'onglet actif (YouTube, TikTok, Instagram, ou tout site avec un `<video>` détectable) dans les deux fenêtres — plus rien d'autre à l'écran
  - Activation **uniquement depuis la fenêtre Paysage** : clic droit sur une vidéo → *"Vidéo seule"*, ou raccourci `Ctrl+Shift+V`
  - Séquencement à l'activation : fenêtre Paysage d'abord, fenêtre Portrait ensuite (+400 ms)
  - Technique de ré-parentage du `<video>` dans un conteneur plein écran (`FOCUS_VIDEO_ACTIVATE_SCRIPT`/`_DEACTIVATE_SCRIPT`/`_STATE_SCRIPT`) plutôt que masquage CSS du reste du DOM — préserve les listeners `play`/`pause`/`seeked` déjà posés par `VIDEO_WATCHER_SCRIPT`, donc la synchronisation vidéo existante (v0.4.3) continue de fonctionner sans nouveau canal dédié à la lecture
  - Barre de contrôle custom (lecture/pause, timeline, quitter) affichée dans les deux fenêtres, auto-hide après 1 s d'inactivité souris
  - Sortie (`Échap` ou bouton "Quitter") synchronisée entre les deux fenêtres, déclenchable depuis n'importe laquelle des deux (`video-focus-enter`/`video-focus-exit` IPC)
  - Contrôle depuis la barre Portrait relayé au Paysage (`video-focus-control`/`video-focus-control-cmd`) — le Paysage reste seul maître de la lecture
  - Garde `window.__dualviewVideoFocusActive` (contexte de la page visitée) empêchant `AUTO_PAUSE_SCRIPT` de mettre la vidéo en pause pendant l'activation du mode
  - Sortie automatique et silencieuse sur navigation complète (`did-navigate`) — le conteneur plein écran ne survit pas à un changement de page
  - Raccourcis de changement d'onglet/navigation (`Alt+←/→`, `F5`, `Ctrl+T/W`, `Ctrl+Shift+T`, `Ctrl+Tab`) désactivés tant que le mode est actif (barre d'onglets masquée)
  - Mode comparaison désactivé automatiquement à l'activation (incompatible avec "vidéo seule")

### Corrigé

- **Menu contextuel "Vidéo seule" invisible sur YouTube** : YouTube (et probablement d'autres lecteurs custom) annule l'événement natif `contextmenu` pour afficher son propre menu — ce qui empêchait l'événement `context-menu` d'Electron (et donc `context-menu.js`) de se déclencher. Ajout de `VIDEO_CONTEXT_INTERCEPT_SCRIPT` (`landscape-webview.js`, injecté à `dom-ready`) : écouteur `contextmenu` en phase de capture sur `document`, qui intercepte le clic AVANT le site et déclenche un vrai menu natif Electron (`show-video-context-menu` IPC → `main.js`) à la position exacte du clic.
- **Raccourci `Ctrl+Shift+V` inopérant** : un `<webview>` étant un `WebContents` séparé, les événements clavier ne remontent jamais au `document` de la fenêtre hôte tant que le focus est dans la webview (cas normal dès qu'on interagit avec la vidéo) — le raccourci posé en DOM `keydown` (`landscape-settings.js`) ne se déclenchait donc quasiment jamais en pratique. Ajout d'un second point d'interception via `before-input-event` sur le `WebContents` de chaque webview (`main.js`, posé dans `did-attach-webview`), qui reçoit l'événement quel que soit l'endroit où se trouve le focus clavier. Même correctif appliqué à `Échap` (sortie du mode), y compris côté Portrait.

### Corrigé (2ᵉ itération — retours de test réel)

- **Vidéo non centrée / non pleine largeur en fenêtre Paysage** : le CSS du site visité (YouTube notamment) fixe souvent le `<video>` en `position:absolute` et/ou une largeur maximale figée via ses propres classes (ex. `.html5-main-video`), parfois en `!important`. Une fois le `<video>` ré-parenté hors de son wrapper d'origine, ces règles restaient actives (elles ciblent la classe, pas la position dans le DOM) et empêchaient la vidéo de remplir le conteneur plein écran — d'où la vidéo collée à gauche avec une bande noire au lieu d'être centrée en pleine largeur (constaté uniquement en Paysage ; le Portrait, plus étroit, masquait le symptôme). Fix (`landscape-webview.js`, `portrait-webview.js`) : retrait de `class`/`id` du `<video>` isolé (pour ne plus matcher les sélecteurs CSS du site) + chaque propriété de style forcée en `!important` (`position:absolute;inset:0;width/height:100%;max-width/max-height:none;transform:none`). `class`/`id` restaurés à la sortie du mode.
- **Retour en arrière sur l'interception du clic droit** : après retour d'expérience, l'interception du `contextmenu` natif de YouTube (ajoutée en 1ʳᵉ itération pour contourner le `preventDefault()` du site) faisait disparaître tout le menu contextuel natif de YouTube au profit d'une unique entrée "Vidéo seule" — perte de fonctionnalités jugée trop pénalisante. `VIDEO_CONTEXT_INTERCEPT_SCRIPT`, la sonde associée dans `landscape-video-focus.js` et le canal IPC `show-video-context-menu` sont retirés : le clic droit affiche à nouveau le menu natif complet du site. L'entrée "Vidéo seule" dans `context-menu.js` (`mediaType==='video'`) reste disponible pour les sites qui n'annulent pas `contextmenu` (TikTok/Instagram/générique, à confirmer). Le raccourci `Ctrl+Shift+V` (fiable quel que soit le focus depuis la 1ʳᵉ itération) devient le point d'entrée principal recommandé.

### Retiré

- **Indicateur vidéo "Lecture (youtube)"/"Pause (youtube)"** (badge en bas à droite de la fenêtre Paysage) : retiré à la demande de l'utilisateur. `showIndicator()`/`hideIndicator()` (`landscape-ui.js`) passées en no-op — le markup HTML (`#video-indicator`, `landscape.html`) et son CSS restent en place mais totalement inertes (déjà masqués par défaut, jamais activés).

### Corrigé (3ᵉ itération — retours de test réel)

- **Vidéo toujours pas centrée/maximisée malgré le correctif précédent** : le correctif `!important` de la 2ᵉ itération ne s'appliquait qu'**une seule fois**, à l'activation. Or beaucoup de lecteurs (YouTube en tête) ont leur propre boucle JS qui **réapplique périodiquement** un style inline sur le `<video>` (recalcul à chaque changement de qualité/redimensionnement interne), écrasant notre style peu après. Fix (`landscape-webview.js`, `portrait-webview.js`) : un `MutationObserver` sur les attributs `style`/`class` du `<video>` isolé réapplique désormais notre style en continu dès que le site y retouche, avec en plus `min-width:0`/`min-height:0`/`object-position:center center` explicites.
- **Barre de contrôle n'apparaissant pas de façon fiable au survol (Paysage)** : même famille de bug que le raccourci clavier — un `<webview>` étant un `WebContents` séparé, un `mousemove` posé sur le `document` de la fenêtre hôte ne se déclenche jamais pour un mouvement de souris au-dessus du contenu de la webview elle-même (qui occupe la quasi-totalité de la fenêtre en mode vidéo seule). Fix : le mouvement de souris est désormais détecté **côté page** (`window.__dualviewFocusLastMove`, mis à jour par un écouteur injecté) et sondé par le renderer (poll existant, resserré à 200 ms) pour déclencher l'apparition + réinitialiser le minuteur d'auto-hide (1 s), quel que soit l'endroit de la fenêtre survolé. Même correctif appliqué côté Portrait par cohérence.

### Connu / limites

- Le ré-parentage du `<video>` n'a pas été validé manuellement sur toutes les plateformes cibles (YouTube/TikTok/Instagram en React/Polymer) : un site qui re-render son arbre autour de la vidéo déplacée peut la recréer et interrompre la lecture. Un `MutationObserver` de secours tente de raccrocher un nouveau `<video>` trouvé (paysage uniquement) mais ce comportement doit être vérifié avant diffusion large.
- Les boutons souris Retour/Avance (`mouse-nav`) ne sont pas bloqués pendant le mode vidéo seule.
- Sur YouTube (et probablement d'autres lecteurs custom), le clic droit sur la vidéo affiche le menu natif du site, sans entrée "Vidéo seule" — utiliser `Ctrl+Shift+V` dans ce cas (voir "Retour en arrière" ci-dessus).

---

## [0.7.1] — 2026

### Ajouté

- **Indicateur de chargement** (`landscape-views.js`, `landscape.html`, `landscape.css`)
  - Barre de progression linéaire **3 px** en haut de la zone webview (`#load-progress-bar`)
  - Progression simulée par asymptote jusqu'à 88 % ; saut à 100 % à `did-stop-loading`
  - Theme-aware : couleur `--accent` (bleu clair/foncé selon le thème)
  - Fade-out automatique 0.5 s à la fin — aucune action utilisateur requise
  - Actif uniquement sur la webview de l'onglet courant (onglets en arrière-plan ignorés)

- **Recherche dans la page — Ctrl+F** (`landscape-views.js`, `landscape.html`, `landscape.css`, `landscape-settings.js`, `landscape-i18n.js`)
  - Barre de recherche inline positionnée en haut à droite de la zone webview (`#find-bar`)
  - Compteur **"X de Y"** mis à jour en temps réel via l'événement `found-in-page`
  - Navigation : boutons ↑↓ ou `Enter` (suivant) / `Shift+Enter` (précédent)
  - Fermeture : bouton ✕ ou `Escape` — sélection effacée (`stopFindInPage('clearSelection')`)
  - Raccourci clavier `Ctrl+F` / `⌘+F` enregistré dans la section **Raccourcis clavier** (Paramètres)
  - Désactivé sur l'onglet Paramètres (onglet `__settings__`)

- **Zoom de page — Ctrl+/Ctrl−/Ctrl+0** (`landscape-views.js`, `landscape-settings.js`, `landscape-i18n.js`)
  - Ajustement du zoom par paliers de 5 % (`Math.round(factor * 20) / 20`)
  - Plage : 25 % → 500 %
  - Persistance **par domaine** via `localStorage` (clé `dv_zoom_<hostname>`)
  - Restauration automatique à chaque `did-navigate` et `did-navigate-in-page`
  - Toast temporaire (1,5 s) indiquant le niveau actuel (ex. `"Zoom : 110%"`) ou `"Zoom réinitialisé (100%)"` pour `Ctrl+0`
  - Raccourcis documentés dans Paramètres → Raccourcis clavier

- **Affichage PDF natif — documentation** (`README.md`, `CHANGELOG.md`)
  - Infrastructure déjà en place depuis v0.7.0 : attribut `plugins="true"` sur toutes les webviews
  - PDF affichés directement via le lecteur Chromium intégré, sans téléchargement

- **Téléchargements configurables** (`session-security.js`, `main.js`, `config-manager.js`, `preload-landscape.js`, `landscape.html`, `landscape.css`, `landscape-settings.js`, `landscape-i18n.js`)
  - Nouveau setting `allowDownloads` (défaut : `false` — comportement sécurisé inchangé)
  - Nouveau setting `downloadDir` (défaut : `''` = dossier Téléchargements de l'OS)
  - `session-security.js` : handler `will-download` étendu — quand activé, sauvegarde automatique dans `downloadDir` avec gestion des collisions de nom et tracking IPC
  - `main.js` : liste en mémoire `_downloads` (max 100 entrées) + 5 handlers IPC :
    - `get-downloads`, `clear-downloads`, `open-download-folder`, `open-download-file`, `choose-download-dir`
  - **Panneau téléchargements** (`#downloads-panel`) dans le menu ⚙️ :
    - Liste des téléchargements de la session avec état (✅ terminé / ❌ interrompu / ⬇️ en cours)
    - Barre de progression live pour les téléchargements en cours
    - Boutons 📂 (ouvrir fichier) et 📁 (ouvrir dossier) par entrée
    - Bouton "Effacer la liste" (vide la liste en mémoire)
  - **Paramètres → Confidentialité** remplacé : le bloc statique "Téléchargements : Bloqué" devient une case à cocher interactive + sélection du dossier de destination
  - Toast de notification à la fin de chaque téléchargement (succès ou échec)
  - i18n FR/EN complète (28 nouvelles clés)

### Modifié

- **`session-security.js`** : signature de `setupSessionSecurity()` étendue avec 4 callbacks optionnels (`getAllowDownloads`, `getDownloadDir`, `onDownloadStarted`, `onDownloadUpdated`, `onDownloadDone`) — rétro-compatible (aucun appel existant cassé)
- **`config-manager.js`** : ajout de `allowDownloads: false` et `downloadDir: ''` dans `SETTINGS_DEFAULTS`
- **`main.js`** : `save-settings` valide désormais `allowDownloads` (boolean) et `downloadDir` (string)
- **`preload-landscape.js`** : 5 nouvelles méthodes IPC exposées + canaux `download-started`, `download-updated`, `download-done` dans la whitelist
- **`landscape.html`** : entrée **Téléchargements** ajoutée au menu ⚙️ ; section Confidentialité mise à jour

---

## [0.7.0] — 2026

### Ajouté

- **Vérification de mise à jour** (`main.js`, `config-manager.js`, `preload-landscape.js`, `landscape.html`, `landscape-settings.js`, `landscape-i18n.js`)
  - Bouton **"Vérifier les mises à jour"** dans **Paramètres → Général** (option minimale — pas d'electron-updater, zéro dépendance npm supplémentaire)
  - `fetchLatestReleaseTag()` : requête anonyme vers l'API GitHub Releases (`net.request`, timeout 8 s, limite 512 Ko) — même mécanisme que la récupération des favicons
  - `isNewerVersion()` : comparaison sémantique `x.y.z`
  - Handler IPC `check-for-update` + `open-external-url` (shell.openExternal, restreint à `http:`/`https:`)
  - Constante `GITHUB_REPO` dans `config-manager.js` (à renseigner avant publication — placeholder `'CHANGEME/dualview'`)
  - Affichage inline : version actuelle, état (à jour / mise à jour disponible / erreur réseau), bouton lien direct vers la release
  - i18n FR/EN complète (8 nouvelles clés : `updateLabel`, `updateDesc`, `updateCurrentVersion`, `updateCheckBtn`, `updateChecking`, `updateUpToDate`, `updateAvailable`, `updateDownloadBtn`, `updateError`)

- **Récupération après crash webview** (`landscape-views.js`, `portrait-app.js`, `landscape.html`, `portrait.html`, `landscape.css`, `portrait.css`, `landscape-i18n.js`, `portrait-i18n.js`)
  - Handler `render-process-gone` sur chaque webview dans les deux fenêtres
    - Filtre `clean-exit` : fermeture normale via `destroyWebview()` ignorée (pas un crash)
    - Toast discret à l'utilisateur (`tabCrashedToast`)
  - Handler `unresponsive` : toast `tabUnresponsiveToast` si la page bloque le thread (la webview n'est pas détruite)
  - Page de récupération inline `#crash-recovery` (paysage) / `#crash-overlay` (portrait) :
    - Titre, sous-titre, bouton **"🔄 Recharger maintenant"**
    - Auto-reload après **10 secondes** d'inactivité
    - Bouton manuel pour recharger immédiatement
  - `recoverCrashedTab()` : détruit l'élément `<webview>` mort et en recrée un propre sur la même URL
    - `skipIpc:true` dans la récupération — pas de cycle `tab-closed`/`tab-created` vers la fenêtre portrait (dont la webview n'a pas planté)
  - `crashedTabs` (Set) : état par onglet — navigation vers un onglet planté ré-affiche la page de récupération
  - `portraitTabUrls` (Map, portrait) : URL la plus récente connue par onglet — mise à jour sur `load-url`, `did-navigate`, `did-navigate-in-page` — permet la reconstruction fidèle même si l'utilisateur avait navigué après le chargement initial
  - i18n FR/EN (3 nouvelles clés : `tabCrashedTitle`, `tabCrashedDesc`, `tabCrashedReload`/`crashTitle`, `crashSub`, `crashReload`)

- **Lecteur PDF natif Chromium** (`landscape-views.js`, `portrait-app.js`)
  - Attribut `plugins="true"` ajouté à chaque `<webview>` créée dans les deux fenêtres
  - Active le lecteur PDF intégré à Chromium : navigation vers un `.pdf` affiche le document au lieu de déclencher `will-download` → toast "téléchargement bloqué"

### Corrigé

- **GitHub et GitLab invisibles dans Paramètres → Services connectés** (`landscape-settings.js`)
  - `SERVICE_ICONS` et `SERVICE_LABELS` ne contenaient pas `github`/`gitlab`, malgré leur présence dans `KNOWN_SERVICES` (`auth-window.js`) depuis v0.4.7
  - Conséquence : aucune tuile affichée pour ces deux services — impossible de s'y connecter depuis le panneau Services
  - Ajout de `github: '🐙'` / `gitlab: '🦊'` dans les deux tables (11 services désormais)

- **`detectServiceKeyFromUrl()` non à jour pour GitHub/GitLab** (`url-guard.js`)
  - Ajout des cas `github.com` → `'github'` et `gitlab.com` → `'gitlab'`
  - Corrige le bouton "Se connecter (GitHub/GitLab)" absent du popup de détection de page de connexion

- **`MaxListenersExceededWarning` (51 listeners `did-stop-loading`)** (`main.js`)
  - `setMaxListeners(50)` trop bas sur `landscapeWin.webContents`, `portraitWin.webContents` et chaque `wvContents` : Electron attache ses propres listeners internes par webview attachée
  - Porté à **200** sur les trois objets

- **`ERR_ABORTED (-3)` sur `GUEST_VIEW_MANAGER_CALL`** (`main.js`)
  - Rejection non capturée pendant la restauration simultanée d'onglets au démarrage
  - `process.on('unhandledRejection')` filtre silencieusement les rejections `code === 'ERR_ABORTED'` (benign) tout en continuant à logger les vraies erreurs

- **Bouton résiduel `#dev-btn`** (`landscape.html`, `landscape.css`)
  - Markup `<button id="dev-btn">🔧 DEV</button>` (mode `--dev` supprimé en v0.5.4) retiré de `landscape.html`
  - Règles CSS `#dev-btn` et `body.dev-mode #dev-btn` supprimées de `landscape.css`

- **`landscape-app.js` orphelin** (`landscape-webview.js`)
  - Commentaire d'en-tête de `landscape-webview.js` référençait `landscape-app.js` (fichier pré-refactoring v0.4.4, jamais livré dans la structure `src/`), corrigé en `landscape-views.js`

### Modifié

- **Section Raccourcis clavier — redesign visuel** (`landscape.html`, `landscape.css`)
  - Remplacement des trois tableaux HTML bruts par trois **cartes** (Navigation / Onglets / Interface)
  - Badges plateformes 🪟 Win/Linux et 🍎 macOS dans l'intro
  - Touches `<kbd>` stylées : fond, bordure basse `1.5px`, police monospace, ombre légère
  - Séparateurs `+` / `ou` distincts visuellement du texte des touches
  - Bloc souris avec icône, adapté aux thèmes clair et sombre via variables CSS

- `src/core/config-manager.js` — constante `GITHUB_REPO` ajoutée et exportée
- `src/core/url-guard.js` — `detectServiceKeyFromUrl()` : github.com et gitlab.com
- `src/main.js` — `shell` importé depuis Electron ; `fetchLatestReleaseTag()`, `isNewerVersion()`, handlers `check-for-update` / `open-external-url` ; `process.on('unhandledRejection')` ; `setMaxListeners(200)` ; note de version v0.7.0
- `src/preload/preload-landscape.js` — `checkForUpdate()`, `openExternalUrl()` ajoutés
- `src/renderer/landscape.html` — `#crash-recovery` overlay ; bouton mise à jour (`#s-update-check-btn`, `#s-update-current`) ; raccourcis refactorisés en cartes ; `#dev-btn` supprimé
- `src/renderer/portrait.html` — `#crash-overlay` ajouté
- `src/renderer/css/landscape.css` — `#crash-recovery`, cartes `.sc-*` raccourcis, `#dev-btn` supprimé
- `src/renderer/css/portrait.css` — `#crash-overlay`
- `src/renderer/js/landscape-views.js` — `plugins="true"` ; module crash (render-process-gone, unresponsive, showCrashRecovery, recoverCrashedTab, crashedTabs, crashRecoveryOverlay) ; `createWebview`/`destroyWebview` acceptent `opts.skipIpc`
- `src/renderer/js/portrait-app.js` — `plugins="true"` ; `portraitTabUrls` ; module crash portrait (crashedTabs, crashOverlay, recoverCrashedTab) ; `did-navigate`/`did-navigate-in-page` mettent à jour `portraitTabUrls`
- `src/renderer/js/landscape-settings.js` — `SERVICE_ICONS`/`SERVICE_LABELS` + github/gitlab ; `loadUpdateInfo()` ; listener bouton `#s-update-check-btn`
- `src/renderer/js/landscape-i18n.js` — 9 nouvelles clés FR/EN (crash webview + mise à jour)
- `src/renderer/js/portrait-i18n.js` — 3 nouvelles clés FR/EN (crash overlay)
- `src/renderer/js/landscape-webview.js` — commentaire d'en-tête corrigé (landscape-app.js → landscape-views.js)
- `CONTRIBUTING.md` — mode `--dev` retiré ; arborescence `preload-dev.js` supprimée
- `package.json` — version 0.6.2 → 0.7.0

---

## [0.6.2] — 2026

### Sécurité

- **Clés d'accès (WebAuthn) désactivées dans la fenêtre d'authentification des services connectés** : Windows Hello, Touch ID et les clés de sécurité FIDO2 ne sont plus proposés lors de la connexion à un service (connu ou personnalisé) — email/mot de passe reste le seul mode supporté. La fenêtre d'authentification (`auth-window.js`) est une `BrowserWindow` Electron complète et bénéficiait jusqu'ici, sans configuration explicite, du support WebAuthn natif de Chromium. `preload-auth.js` masque désormais `window.PublicKeyCredential` (empêche les services de proposer le bouton clé d'accès) et intercepte `navigator.credentials.create()` / `.get()` pour rejeter spécifiquement toute requête contenant l'option `publicKey`, comme en l'absence d'authentificateur — les usages mot de passe/fédérés de la même API ne sont pas affectés (`preload-auth.js`)

### Corrigé

- **Documentation** : suppression d'un bloc de contenu dupliqué dans `README.md` (sections Captures d'écran → Services connectés répétées deux fois à la suite d'une édition antérieure)

---

## [0.6.1] — 2026

### Corrigé

- **Glisser un onglet hors d'un groupe sans effet** : seuls les drops effectués directement sur un autre onglet ou sur le label d'un groupe étaient pris en compte. Déposer un onglet dans un espace vide de la barre (après le dernier onglet, avant le bouton "+", ou dans un interstice) n'avait aucun effet — l'onglet restait dans son groupe. Ajout d'une zone de drop de repli sur le conteneur `#tab-bar` lui-même : tout drop hors d'un élément cible retire désormais l'onglet de son groupe et le déplace en fin de liste (`landscape-tabs.js` : `_onTabBarDragOver`, `_onTabBarDrop`)

- **Onglets épinglés non restaurés entre sessions** : comportement volontaire en v0.6.0, désormais traité comme un défaut — les épinglés sont persistés au même titre que les groupes. `groupsSavePayload()` inclut maintenant `pinnedTabs` ; `get-store`/`save-tabs` (`main.js`) et la restauration au démarrage (`landscape-pollers.js`) suivent (`landscape-groups.js`, `main.js`, `landscape-pollers.js`)

- **Un groupe disparaît et se trouve remplacé par un nouveau groupe** : `groupAddTab(tabId, groupId)` affectait un onglet à un nouveau groupe sans le retirer proprement de son groupe précédent. Si ce dernier tombait à 1 membre ou moins, il restait orphelin ("zombie") en mémoire et dans la config persistée — invisible (aucun label affiché) mais jamais supprimé, donnant l'impression qu'il avait été "remplacé" par le nouveau groupe. `groupAddTab` retire désormais proprement l'onglet de son ancien groupe (réutilise `groupRemoveTab`, qui supprime le groupe abandonné s'il tombe sous 2 membres) avant de l'affecter au nouveau — corrige à la fois le menu contextuel "Ajouter à un groupe" et le drag & drop inter-groupes, qui passent tous deux par cette même fonction (`landscape-groups.js`)

- **Erreurs favicon bruyantes dans la console DevTools** (`favicon.ico`, `icon.ico`, `logo.ico`, etc.) : Chromium logge automatiquement tout échec de chargement d'une ressource assignée à `<img src>`, quel que soit le gestionnaire `onerror` posé en JS côté page — impossible à supprimer depuis le renderer. La récupération HTTP des favicons est désormais entièrement déportée vers le process principal (`net.request`, timeout 5 s, limite de taille 2 Mo, validation du type de contenu, garde anti-SSRF basique sur les hôtes privés/locaux). Le renderer n'assigne plus jamais une URL distante non vérifiée à `<img src>` : uniquement une `data:` URL déjà validée par le main process, ou le SVG de repli local. Plus aucune requête favicon n'apparaît donc dans la console de la fenêtre paysage (`main.js` : `fetchFaviconAsDataUrl`, handler IPC `fetch-favicon` ; `preload-landscape.js` : `fetchFavicon` ; `landscape-tabs.js` : section favicon réécrite — `_guessFaviconUrl`, `_resolveFavicon`, `_faviconPending`)

### Modifié

- `landscape-groups.js` — `groupAddTab` nettoie l'ancien groupe avant réaffectation ; `groupsSavePayload` inclut désormais `pinnedTabs` ; `groupsLoad` plafonne la liste restaurée à `PINNED_MAX`
- `landscape-tabs.js` — section favicon réécrite (fetch via le main process) ; nouvelle zone de drop de repli sur `#tab-bar`
- `main.js` — nouveau handler IPC `fetch-favicon` ; `get-store`/`save-tabs` exposent et persistent `pinnedTabs`
- `preload-landscape.js` — nouveau canal exposé `fetchFavicon`
- `landscape-pollers.js` — restauration de `pinnedTabs` au démarrage, transmise à `groupsLoad`

---

## [0.6.0] — 2026

### Ajouté

- **Rouvrir l'onglet fermé** (`landscape-tabs.js`)
  - Historique illimité en mémoire (réinitialisé à la fermeture de l'application)
  - Accessible via clic droit sur n'importe quel onglet → "Rouvrir l'onglet fermé"
  - Raccourci clavier `Ctrl+Shift+T` (standard navigateur)
  - Item grisé si aucun onglet n'a été fermé depuis le démarrage

- **Groupes d'onglets** (`landscape-groups.js`, `landscape-tabs.js`, `main.js`)
  - Création de groupes nommés avec couleur automatique (palette 10 couleurs, attribution séquentielle)
  - Minimum 2 onglets par groupe ; le groupe est supprimé si moins de 2 membres restent
  - Label cliquable affiché à gauche du premier onglet du groupe (expand/collapse)
  - Renommage du groupe via clic droit sur le label → dialog HTML natif (max 60 caractères)
  - Noms génériques auto-incrémentés non dupliqués ("Groupe 1", "Groupe 2", …)
  - Drag & Drop : entrer dans un groupe (drop sur un onglet membre ou sur le label)
  - Drag & Drop : sortir d'un groupe (drop hors du groupe → suppression si < 2 membres)
  - Drag inter-groupes : drop sur onglet d'un autre groupe → rejoindre ce groupe
  - Persistance entre sessions (`tabGroups` et `tabGroupOf` dans la config)
  - Groupe collapsed : seul le label est affiché, les onglets sont masqués

- **Onglets épinglés** (`landscape-groups.js`, `landscape-tabs.js`, `main.js`)
  - Groupe virtuel spécial affiché à gauche, séparé par un diviseur vertical
  - Maximum 5 onglets épinglés simultanément
  - Onglets épinglés affichés en mode icon-only (favicon uniquement, sans titre)
  - Épingle/désépingle via clic droit sur l'onglet
  - Les épinglés ne peuvent pas être drag-and-droppés hors de la zone épinglés
  - Les épinglés ne peuvent pas être ajoutés à un groupe normal
  - **Non restaurés** entre sessions (réinitialisés à chaque démarrage)

- **Favicons sur tous les onglets** (`landscape-tabs.js`, `assets/favicon-default.svg`)
  - Favicon 16×16 chargée depuis `<origin>/favicon.ico`
  - Fallback vers `assets/favicon-default.svg` (icône globe générique vectorielle) en cas d'échec
  - Cache par onglet ; invalidé lors d'un changement d'URL
  - Favicon absente sur l'onglet Paramètres (icône ⚙ dans le titre)

- **Menu contextuel natif OS sur les onglets** (`main.js`, `preload-landscape.js`, `landscape-tabs.js`)
  - Déclenché par clic droit sur n'importe quel onglet
  - Entrées : Rouvrir l'onglet fermé · Épingler/Désépingler · Ajouter à un groupe (sous-menu) · Retirer du groupe · Fermer l'onglet
  - Sous-menu "Ajouter à un groupe" : groupes existants + "Nouveau groupe…"
  - Menu contextuel sur le label de groupe : Renommer · Supprimer
  - Cohérent avec le menu contextuel webview existant (même pattern IPC main↔renderer)

### Modifié

- `landscape-tabs.js` — refactorisé pour intégrer groupes, épinglés, favicons, historique fermés
- `landscape-settings.js` — ajout raccourci `Ctrl+Shift+T` + dialog renommage groupe
- `landscape-pollers.js` — restauration des groupes depuis le store au démarrage
- `main.js` — `save-tabs` persiste `groups`/`tabGroupOf` ; `get-store` les retourne
- `preload-landscape.js` — nouveaux canaux IPC exposés

### Nouveau fichier

- `src/renderer/js/landscape-groups.js` — module autonome gérant groupes et épinglés
- `assets/favicon-default.svg` — favicon fallback vectorielle

### Corrigé

- **Chemin du favicon de repli erroné** : `FAVICON_FALLBACK` pointait vers `src/assets/favicon-default.svg` (un niveau au-dessus de `renderer/`) au lieu de `assets/favicon-default.svg` à la racine du projet (deux niveaux au-dessus) → `ERR_FILE_NOT_FOUND` en boucle. Chemin corrigé en `../../assets/favicon-default.svg` ; garde anti-boucle ajoutée sur l'`<img>` pour éviter qu'un fallback lui-même introuvable ne redéclenche indéfiniment l'event `error` (`landscape-tabs.js`)
- **Dialogue de renommage de groupe inopérant** : le markup `#group-rename-overlay` était placé après les balises `<script>` dans `landscape.html` ; `document.getElementById()` retournait `null` au moment de l'initialisation, désactivant silencieusement tout le dialogue (clic sans effet, clavier sans effet). Markup déplacé avant les scripts ; logique réécrite pour interroger le DOM à la demande plutôt qu'en cache à l'IIFE, robuste à un futur changement d'ordre (`landscape.html`, `landscape-settings.js`). Suppression au passage d'un appel mort à `window.dualview.emit` (méthode inexistante dans le preload)
- **Favicon limité à `/favicon.ico` deviné** : remplacé par une extraction réelle des balises `<link rel="icon"|"shortcut icon"|"apple-touch-icon"|"apple-touch-icon-precomposed"|"mask-icon">` de la page, via un script injecté dans la webview au `dom-ready`. Repli en cascade conservé : balises de la page → `<origin>/favicon.ico` deviné → SVG générique (`landscape-tabs.js` : `extractFaviconFromWebview`, `_FAVICON_EXTRACT_SCRIPT` ; `landscape-views.js` : appel ajouté dans `attachWebviewListeners`)
- **`ERR_ABORTED (-3)` à chaque navigation** (`github.com`, `myinstants.com`, observé dans les logs) : `navigate()` assignait `wv.src` directement **et** déclenchait l'IPC `navigate`, qui revient via `main.js` → canal `load-url` → réassignation de `wv.src` une seconde fois sur la même webview. La seconde navigation annulait systématiquement la première (comportement Chromium standard sur navigation concurrente), généralement sans impact visible mais bruyant en logs et source du pic `MaxListenersExceededWarning` (51 listeners `did-stop-loading`, juste au-dessus du seuil `setMaxListeners(50)` fixé en v0.4.7). Assignation directe retirée de `navigate()` ; le round-trip IPC (`navigate` → `main.js` → `load-url`) reste l'unique déclencheur de la navigation, cohérent avec le mécanisme déjà utilisé pour la synchronisation portrait (`landscape-tabs.js`)

---

## [0.5.4] — 2026

### Ajouté

- **Menu contextuel — Retour / Avance** (`context-menu.js`, `landscape-settings.js`)
  - Visible uniquement sur les onglets `TAB_TYPE_WEB`
  - Items grisés (`enabled: false`) quand la navigation n'est pas disponible
  - Guard `try/catch` autour de `canGoBack()` / `canGoForward()` (erreur possible avant `dom-ready`)
  - Réutilise les canaux IPC `navBack` / `navForward` existants via les boutons toolbar désactivés

- **Menu contextuel — Imprimer** (`context-menu.js`)
  - Visible uniquement sur les onglets `TAB_TYPE_WEB`
  - `wvContents.print({ silent: false, printBackground: true })` — dialog d'impression OS native

- **Menu contextuel — Afficher le code source** (`context-menu.js`, `landscape-settings.js`, `landscape-tabs.js`)
  - Visible uniquement sur les onglets `TAB_TYPE_WEB`
  - Extraction via `wvContents.executeJavaScript('document.documentElement.outerHTML')` (DOM courant)
  - Ouverture dans un nouvel onglet `TAB_TYPE_WEB` avec titre `"Source — example.com"`
  - Rendu monoespace sur fond sombre (`#1e1e1e`) avec coloration syntaxique minimale
  - Évite le schéma `view-source:` bloqué par `url-guard.js`
  - `addTabWithUrl(url, title)` : paramètre `title` optionnel ajouté (rétro-compatible)

- **Menu contextuel — Inspecter l'élément** (`context-menu.js`)
  - Disponible sur **tous les onglets** en production (guard `logger.IS_DEV` retiré)
  - `Ctrl+Maj+I` reste le raccourci natif Electron pour les DevTools de la fenêtre

- **Typage des onglets dans `main.js`** (`main.js`)
  - `tabTypes: Map<tabId, TAB_TYPE>` — mémorisé depuis `save-tabs` IPC
  - Passé comme `activeTabType` à `buildAndShowContextMenu` pour conditionner les options

### Modifié

- **Suppression du mode `--dev`** (`logger.js`, `main.js`, `preload-landscape.js`, `landscape-pollers.js`, `package.json`)
  - `logger.js` v0.5.4 : le logger écrit **toujours** dans `dualview.log` (userData), plus de condition `--dev`
  - `IS_DEV`, `setupIpc()`, `setupDevTools()`, `openAuthDevTools()` supprimés de `logger.js`
  - `main.js` : retrait de `logger.IS_DEV`, `logger.setupIpc()`, `logger.setupDevTools()`, des deux blocs `registerPreloadScript('preload-dev.js')`, des arguments `--dev-source=landscape/portrait`, des IPC `get-is-dev` et `toggle-dev-tools`
  - `preload-landscape.js` : retrait de `getIsDev()` et `toggleDevTools()` de l'API exposée
  - `landscape-pollers.js` : retrait du bloc `getIsDev().then(...)` — bouton `dev-btn`, raccourcis `F12`/`Ctrl+F12` et classe CSS `dev-mode` supprimés
  - `package.json` : script `start-dev` supprimé
  - `preload-dev.js` : **fichier supprimé** (plus jamais chargé)
  - Les DevTools restent accessibles via `Ctrl+Maj+I` (raccourci natif Electron)

### Supprimé

- `src/preload/preload-dev.js` — plus nécessaire après suppression du mode `--dev`

### Corrigé

- **`webContents.canGoBack/Forward` dépréciée** (`context-menu.js`)
  - Migration vers `wvContents.navigationHistory.canGoBack/Forward()` (Electron 42+)
  - Supprime les warnings de dépréciation dans la console au démarrage

- **Impression incomplète et aperçu non supporté** (`context-menu.js`)
  - `wvContents.print()` remplacé par `wvContents.printToPDF()` + fichier temporaire + `shell.openExternal()`
  - Le lecteur PDF natif de l'OS s'ouvre avec la page complète (pas seulement la partie visible)
  - L'utilisateur peut sauvegarder le PDF via "Enregistrer sous" du lecteur PDF système
  - Nettoyage automatique du fichier temp après 30 secondes

- **Logs parasites `Render frame was disposed`** (`package.json`)
  - Suppression de `@cliqz/adblocker-electron` — dépendance installée mais jamais utilisée dans le code
  - Electron 42 chargeait automatiquement son preload dans chaque frame, y compris celles détruites pendant la navigation, générant des dizaines d'erreurs `Render frame was disposed` dans la console à chaque session

---

## [0.5.3] — 2026

### Ajouté

- **Onglets déplaçables — Drag & Drop** (`landscape-tabs.js`, `landscape.css`)
  - Tous les onglets (web, paramètres, vide) sont déplaçables par glisser-déposer
  - Ligne indicatrice verticale (couleur accent) entre les onglets pour indiquer la position de dépôt, style Chrome
  - Opacité réduite (0.4) sur l'onglet en cours de glissement
  - Curseur `grab` au survol, `grabbing` pendant le drag
  - L'ordre est persisté automatiquement via `saveTabs()` après chaque déplacement
  - Compatible Firefox (appel `dataTransfer.setData` ajouté)

- **Typage des onglets** (`landscape-tabs.js`)
  - Nouvelles constantes `TAB_TYPE_WEB`, `TAB_TYPE_SETTINGS`, `TAB_TYPE_BLANK`
  - Fonction `getTabType(tab)` : détermine le type avec déduction rétro-compatible pour les sessions sauvegardées avant v0.5.3 (pas de migration nécessaire)
  - `isSettingsTab()` et `isWebTab()` basés sur `getTabType()` — plus robustes que la comparaison d'ID
  - Tous les nouveaux onglets créés (`addTab`, `addTabWithUrl`, `openSettingsTab`) incluent le champ `type`

- **Menu contextuel — 6 nouvelles options** (`context-menu.js`)
  - **Lien** : *Ouvrir dans le navigateur système* (`shell.openExternal`) — coexiste avec "Ouvrir dans un nouvel onglet"
  - **Image** : *Copier l'image* (`wvContents.copyImageAt`) — copie dans le presse-papiers OS
  - **Image** : *Ouvrir l'image dans un nouvel onglet* — réutilise l'action `open-link-new-tab` existante
  - **Lien mailto** : *Copier l'adresse email* — extrait l'adresse du schéma `mailto:` et la copie
  - **Champ éditable** : *Annuler* / *Rétablir* (`wvContents.undo()` / `wvContents.redo()`) — affichés uniquement quand le champ est vide de sélection
  - **Champ éditable** : *Sélectionner tout* (`wvContents.selectAll()`) — affiché uniquement quand le champ est vide de sélection
  - `shell` ajouté aux imports Electron dans `context-menu.js`

---

## [0.5.2] — 2026

### Ajouté

- **Export / Import de configuration** (`main.js`, `preload-landscape.js`, `landscape.html`, `landscape-settings.js`, `landscape-i18n.js`, `landscape.css`)
  - Nouvelle entrée **📤 Export / Import** dans la barre latérale des Paramètres (6e entrée, après Raccourcis clavier)
  - **Export sélectif** : checklist de 18 éléments regroupés en 6 catégories
    - *Comportement* : Restaurer onglets, Pause auto YouTube, Mute portrait
    - *Page d'accueil* : Mode, URL personnalisée, Nouveaux onglets
    - *Interface* : Apparence, Langue
    - *Moteur de recherche* : ID actif, URL, Nom, Moteurs personnalisés
    - *Autres* : Dossier captures, Préréglage portrait, Services personnalisés
    - *Données* : Historique de navigation, Favoris, Dimensions fenêtre portrait
  - **Limite d'export pour l'historique** : dropdown visible uniquement quand la case Historique est cochée — 4 options : 500 dernières (défaut), 1 000, 5 000, Tout
  - Chaque ligne affiche un aperçu de la valeur actuelle (comptage async pour historique et favoris)
  - Boutons "Tout sélectionner" / "Tout désélectionner"
  - Boîte de dialogue "Enregistrer sous" → dossier **Téléchargements** par défaut
  - Nom suggéré : `dualview-backup-YYYY-MM-DD.json`
  - Format JSON structuré avec signature `_dualview_export: true`, champ `version` et `exportedAt`
  - **Import avec merge sélectif** : modale affichant côte à côte la valeur importée et la valeur actuelle
    - Sélection individuelle par case à cocher — import partiel possible
    - Métadonnées du fichier (date d'export, version source)
    - Fusion historique et favoris sans suppression de l'existant (déduplication automatique)
    - Dimensions portrait appliquées en live sur la fenêtre portrait
    - Si `appearance` ou `language` changent : dialogue de redémarrage proposé automatiquement
    - Rechargement automatique de l'UI des paramètres après import
  - Validation stricte des valeurs à l'import (mêmes règles que `save-settings`)
  - 3 nouveaux handlers IPC : `export-config`, `import-config-read`, `import-config-apply`
  - 45 nouvelles clés i18n FR/EN

---

## [0.5.1] — 2026

### Ajouté

- **Section Raccourcis clavier dans les Paramètres** (`landscape.html`, `landscape-i18n.js`, `landscape.css`)
  - Nouvelle entrée **⚓ Raccourcis clavier** dans la barre latérale — la nav passe de 4 à 5 entrées
  - Trois tableaux par catégorie : **Navigation**, **Onglets**, **Interface**
  - Distinction explicite **Windows / Linux** (`Ctrl`) vs **macOS** (`⌘ Cmd`) en deux colonnes
  - Touches identiques sur les 3 systèmes (`F5`, `F6`, `F11`) signalées explicitement
  - Note sur les boutons latéraux de souris (bouton 4 = retour, bouton 5 = avance)
  - Rendu `kbd` (badge clavier) cohérent thèmes clair et sombre
  - 18 nouvelles clés i18n FR/EN

### Corrigé

- **Clics non fonctionnels sur les icônes du top 10** (`landscape-views.js`, `landscape.css`)
  La webview active (`about:blank`) est en `position: absolute; inset: 0` — elle couvrait
  la totalité de la zone et interceptait tous les événements souris. Corrigé par la classe
  `.is-blank` (ajoutée dans `showWebview()`, retirée dans `did-navigate`) avec la règle
  `.wv-landscape.active.is-blank { pointer-events: none }` en CSS.

- **Disparition du top 10 à l'ouverture d'un 2e onglet vide** (`landscape-ui.js`)
  `maybeShowTopSites()` est `async` : un changement d'onglet rapide pendant l'`await
  renderTopSites()` effaçait `.has-topsites` sur le mauvais onglet. Corrigé par un guard
  anti-race-condition : `activeTabId` capturé avant l'`await`, vérification de cohérence
  au retour (onglet actif + webview toujours vide `stillBlank`).

- **`style.display` inline écrasait `pointer-events` défini en CSS** (`landscape-views.js`, `landscape-tabs.js`, `landscape.css`)
  Trois sites manipulaient `emptyState.style.display` directement, bloquant la cascade CSS.
  Remplacés par `classList.toggle('hidden')` + règle `#empty-state.hidden { display: none }` :
  - `showWebview()` dans `landscape-views.js`
  - `switchTab()` (onglet paramètres) dans `landscape-tabs.js`
  - Handler `load-url` dans `landscape-tabs.js`

### Modifié

- `src/renderer/landscape.html` : entrée `shortcuts` dans la sidebar + section `#section-shortcuts`
- `src/renderer/js/landscape-i18n.js` : 18 nouvelles clés i18n FR/EN (v0.5.1)
- `src/renderer/js/landscape-views.js` : `showWebview()` — `.is-blank` + `.hidden` ; `did-navigate` — retrait `.is-blank`
- `src/renderer/js/landscape-tabs.js` : `switchTab()` + handler `load-url` — `.hidden` à la place de `style.display`
- `src/renderer/js/landscape-ui.js` : `maybeShowTopSites()` — guard anti-race-condition
- `src/renderer/css/landscape.css` : `.wv-landscape.active.is-blank`, `#empty-state.hidden`, styles `kbd` + `.shortcuts-table`

---

## [0.5.0] — 2026

### Ajouté

- **Mode Focus (F)** — masque toolbar + tab-bar pour maximiser la zone de capture OBS
  - Raccourci `Ctrl+Shift+H` ou `F11` pour activer / désactiver
  - Bande de détection (8 px en haut de fenêtre) : la toolbar réapparaît 2 s au survol
  - Le toolbar se maintient visible tant que la souris reste dessus
  - Badge discret en bas à droite confirmant l'état (disparaît après 2 s)
  - Toast de confirmation à l'activation/désactivation
  - i18n FR/EN (3 nouvelles clés)

- **Top 10 domaines sur onglet vide** — quand "Nouveaux onglets" est réglé sur "Page vide"
  - Affiche jusqu'à 10 domaines les plus visités (historique toutes sessions confondues)
  - Dédoublonnage automatique par hostname (`www.` normalisé)
  - Si moins de 10 domaines visités, affiche le maximum disponible
  - Favicon via Google S2 avec fallback initiale si indisponible
  - Visible dans la fenêtre paysage et dans la fenêtre portrait (données relayées via IPC)
  - Clic → navigation dans l'onglet actif (comportement navigateur standard)

- **Fusion Apparence + Langue dans Général** — navigation paramètres simplifiée
  - Les sections "Apparence" et "Langue" sont intégrées directement dans "Général"
  - Barre latérale réduite à 4 entrées : Général / Services connectés / Confidentialité / OBS

- **Réouverture fenêtre portrait** — bouton dans le menu ⚙️
  - Entrée "Rouvrir le portrait" visible uniquement si la fenêtre portrait est fermée
  - Si portrait ouvert : bouton absent (non nécessaire)
  - À la réouverture : tous les onglets existants sont reconstruits dans le portrait,
    l'onglet actif est affiché et chargé automatiquement, la synchronisation reprend

### Corrigé

- **`canGoBack()` appelé avant `dom-ready`** (`landscape-tabs.js`) — lors de la création
  d'un onglet vide, `canGoBack()` levait une erreur Electron avant que la webview soit
  prête. La garde `try/catch` absorbe l'erreur et laisse `dom-ready` mettre à jour
  les boutons de navigation. Corrige aussi la non-visibilité de l'onglet créé.

- **Réouverture portrait : onglets non affichés sans actualisation manuelle** (`main.js`) —
  l'ancien handler `reopen-portrait` utilisait `did-finish-load` (trop tôt : scripts
  pas encore exécutés) et n'envoyait que l'onglet actif. Remplacé par `dom-ready`
  avec reconstruction séquentielle complète du pool : `tab-created` pour chaque onglet,
  `tab-switched` vers l'actif, `load-url` avec l'URL courante.

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