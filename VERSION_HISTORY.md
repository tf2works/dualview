# DualView — Historique des versions

> Ce fichier documente en détail toutes les nouveautés de chaque version de DualView.
> Pour une vue d'ensemble des fonctionnalités actuelles, voir [README.md](README.md).

---

## Installation (rappel)

### Prérequis
- Windows 11 (Build 22000+)
- Connexion internet (~30 Mo pour Node.js si absent)

### Procédure
1. Double-cliquez sur **`DualView-Setup-0.5.2.exe`**
2. Si Windows affiche "Éditeur inconnu" → **Plus d'informations** puis **Exécuter quand même**
3. Acceptez l'élévation Administrateur
4. Attendez la fin de l'installation (5 à 15 min)
5. Lancez **DualView** depuis le Menu Démarrer

---

## Fenêtres

| Fenêtre | Titre OBS | Description |
|---------|-----------|-------------|
| Paysage | `DualView - Paysage` | Barre de contrôle + vue Desktop 16:9 |
| Portrait | `DualView - Portrait` | Vue Mobile 9:16 (taille fixe) |

---

## Barre de navigation

```
← → ⟳ 🏠 [url] ▶ ★ 📷 [● Sync] ⚙️
```

| Bouton | Fonction |
|--------|----------|
| ← → | Page précédente / suivante (les deux fenêtres). Survol 500 ms → dropdown historique de l'onglet |
| ⟳ | Recharger (les deux fenêtres) |
| 🏠 | Page d'accueil |
| [url] | Barre d'adresse — sélection auto au clic, Échap annule, suggestions omnibar |
| ▶ | Charger l'URL ou lancer une recherche |
| ★ | Ajouter / retirer la page des favoris (étoile creuse = non sauvegardé, étoile dorée = favori) |
| 📷 | Capture instantanée des deux vues en PNG |
| ● Sync | Contrôle synchronisation (Pause/Reprendre/Redémarrer) |
| ⚙️ | Menu : Redimensionner / Historique / Favoris / **Rouvrir le portrait** / Paramètres |

**Raccourcis clavier** (tableau complet dans **Paramètres → Raccourcis clavier** depuis v0.5.1)

| Raccourci Windows/Linux | Raccourci macOS | Fonction |
|------------------------|-----------------|----------|
| `Ctrl+Shift+H` ou `F11` | `⌘+Shift+H` ou `F11` | Activer / désactiver le **Mode Focus** |
| `Alt+←` / `Alt+→` | `⌘+[` / `⌘+]` | Navigation Retour / Avance |
| `F5` / `Ctrl+R` | `F5` / `⌘+R` | Recharger |
| `Ctrl+T` / `Ctrl+W` | `⌘+T` / `⌘+W` | Nouvel onglet / Fermer l'onglet actif |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | `⌃+Tab` / `⌃+Shift+Tab` | Onglet suivant / précédent |
| `Ctrl+L` / `F6` | `⌘+L` / `F6` | Focus sur la barre d'adresse |

---

## Nouveautés v0.5.2

### 📤 Export / Import de configuration

Nouvelle section **Export / Import** dans les Paramètres (6e entrée dans la barre latérale, après Raccourcis clavier).

#### Export sélectif

Une checklist de **18 éléments** regroupés en **6 catégories** permet de choisir précisément ce qui sera exporté :

| Catégorie | Éléments |
|---|---|
| Comportement | Restaurer onglets, Pause auto YouTube, Mute portrait |
| Page d'accueil | Mode, URL personnalisée, Nouveaux onglets |
| Interface | Apparence, Langue |
| Moteur de recherche | ID actif, URL, Nom, Moteurs personnalisés |
| Autres | Dossier captures d'écran, Préréglage portrait, Services personnalisés |
| Données | Historique de navigation, Favoris, Dimensions fenêtre portrait |

**Limite d'export pour l'historique** — un dropdown apparaît sous la case Historique dès qu'elle est cochée :

| Option | Entrées exportées |
|---|---|
| 500 dernières *(défaut)* | Les 500 visites les plus récentes |
| 1 000 dernières | Les 1 000 visites les plus récentes |
| 5 000 dernières | Les 5 000 visites les plus récentes |
| Tout exporter | Intégralité de l'historique (jusqu'à 5 000 entrées max en mémoire) |

Autres détails de l'export :
- Chaque ligne affiche un aperçu de la valeur actuelle (comptage async pour historique et favoris)
- Boutons **Tout sélectionner** / **Tout désélectionner**
- Boîte de dialogue "Enregistrer sous" → dossier **Téléchargements** par défaut
- Nom suggéré : `dualview-backup-YYYY-MM-DD.json`
- Format JSON lisible, signé `_dualview_export: true` avec `version` et `exportedAt`

#### Import avec merge sélectif

Après sélection du fichier, une **modale de merge** s'affiche :

- Affiche les **métadonnées** du fichier (date d'export, version source)
- Liste chaque élément avec **valeur importée** (vert) et **valeur actuelle** (gris)
- Sélection individuelle par case à cocher — import partiel possible
- **Historique et favoris** : fusion sans suppression de l'existant (déduplication automatique par URL)
- **Dimensions portrait** : appliquées en live sur la fenêtre portrait ouverte
- **Apparence ou langue modifiée** : dialogue de redémarrage proposé automatiquement ; si annulé, un message rappelle de redémarrer manuellement
- Bouton **Appliquer la sélection** → merge immédiat + rechargement de l'UI des paramètres
- Validation stricte des valeurs (mêmes règles que la sauvegarde normale)

La barre latérale des Paramètres passe de 5 à **6 entrées** :
```
Général / Services / Confidentialité / OBS / Raccourcis clavier / Export·Import
```

---

## Nouveautés v0.5.1

### ⌨️ Section Raccourcis clavier dans les Paramètres

Nouvelle section **Raccourcis clavier** (entrée ⚓ dans la barre latérale des Paramètres) :

- Trois tableaux organisés par catégorie : **Navigation**, **Onglets**, **Interface**
- Chaque tableau distingue explicitement **Windows / Linux** (`Ctrl`) et **macOS** (`⌘ Cmd`)
- Les touches identiques sur les trois systèmes (`F5`, `F6`, `F11`) sont signalées
- Note sur les **boutons latéraux de souris** (bouton 4 = retour, bouton 5 = avance)
- Rendu visuel `kbd` cohérent avec les thèmes clair et sombre
- Traductions FR et EN complètes (18 nouvelles clés i18n)

La barre latérale des Paramètres passe de 4 à **5 entrées** :
```
Général / Services / Confidentialité / OBS / Raccourcis clavier
```

---

### 🐛 Correctifs topsites — onglet vide

**Clics non fonctionnels sur les icônes du top 10**
La webview active (`about:blank`) est positionnée en `position: absolute; inset: 0` — elle couvrait toute la zone de l'onglet vide et interceptait tous les événements souris avant qu'ils n'atteignent les éléments du top 10. Corrigé par l'ajout de la classe `.is-blank` sur la webview active quand elle est vide, avec `pointer-events: none` en CSS. La classe est retirée dès que `did-navigate` signale une vraie URL.

**Disparition du top 10 à l'ouverture d'un 2e onglet vide**
`maybeShowTopSites()` est une fonction `async` qui attend `renderTopSites()` (lecture de l'historique). Pendant cet `await`, un changement d'onglet pouvait intervenir et effacer `.has-topsites` sur le mauvais onglet à son retour. Corrigé par un **guard anti-race condition** : `activeTabId` est capturé avant l'`await` ; au retour, on vérifie que l'onglet actif n'a pas changé ET que la webview est toujours vide (`stillBlank`) avant de modifier les classes.

**`style.display` inline écrasait `pointer-events` défini en CSS**
Trois endroits du code manipulaient `emptyState.style.display` directement (style inline), ce qui avait une spécificité maximale et pouvait écraser les règles CSS `.has-topsites { pointer-events: all }`. Tous les accès inline ont été remplacés par `classList.toggle('hidden')` (nouvelle règle `#empty-state.hidden { display: none }`) :
- `showWebview()` dans `landscape-views.js`
- `switchTab()` (onglet paramètres) dans `landscape-tabs.js`
- Handler `load-url` dans `landscape-tabs.js`

**Fichiers modifiés** : `landscape-views.js`, `landscape-tabs.js`, `landscape-ui.js`, `landscape.css`

---

## Nouveautés v0.5.0

### 🎭 Mode Focus — masquer la toolbar

Appuyez sur **`Ctrl+Shift+H`** ou **`F11`** pour masquer la toolbar et maximiser
la zone de capture OBS. La toolbar reste accessible sans quitter le mode :

- **Survol du bord supérieur** (bande invisible de 8 px) : la toolbar réapparaît 2 secondes
- **Déplacer la souris sur la toolbar** : elle reste visible tant que la souris y est
- Un **badge discret** en bas à droite confirme l'activation (disparaît après 2 s)
- Même raccourci pour désactiver

---

### 🌐 Top 10 domaines sur onglet vide

Quand "Paramètres → Général → Nouveaux onglets" est réglé sur **"Page vide"**,
les onglets vides affichent automatiquement vos sites les plus fréquentés :

- Jusqu'à **10 domaines** classés par nombre de visites (toutes sessions confondues)
- Si moins de 10 domaines dans l'historique, affiche le maximum disponible
- Aucun doublon (normalisé par hostname, `www.` ignoré)
- Favicon de chaque site avec fallback sur l'initiale du domaine
- **Visible dans les deux fenêtres** — landscape et portrait affichent la même grille
- Clic → navigation directe dans l'onglet actif

---

### ⚙️ Paramètres simplifiés

Les sections **Apparence** et **Langue** sont désormais intégrées directement dans **Général**.
La barre latérale des paramètres passe de 6 à 4 entrées :

```
Avant : Général / Apparence / Langue / Services / Confidentialité / OBS
Après : Général / Services / Confidentialité / OBS
```

---

### 🪟 Réouverture de la fenêtre portrait

Si la fenêtre portrait est fermée accidentellement ou volontairement, rouvrez-la
sans redémarrer DualView :

1. Cliquez sur **⚙️** dans la toolbar paysage
2. Sélectionnez **"Rouvrir le portrait"** (entrée visible uniquement si portrait fermé)
3. La fenêtre portrait se rouvre à sa **dernière position et taille connue**
4. Tous les onglets ouverts dans landscape sont **automatiquement reconstruits**
   dans le portrait — aucune actualisation manuelle nécessaire

---

## Nouveautés v0.4.7

### ★ Favoris (marque-pages)

Mettez n'importe quelle page en favori d'un simple clic sur l'étoile ★ dans la barre de contrôle.

**Bouton étoile dans la toolbar**
- ☆ (inactif) → la page n'est pas en favori
- ★ dorée (actif) → la page est en favori
- Un clic toggle l'état et affiche un toast de confirmation

**Panneau latéral Favoris**
- Accessible via ⚙️ → **Favoris** (entrée sous "Historique")
- Barre de recherche fulltext sur URL et titre
- Cliquer sur une entrée navigue directement vers cette page
- Suppression individuelle uniquement (pas de "tout effacer")
- Fermeture par ✕, touche Échap, ou clic extérieur

**Persistance**
- Stockés dans `%AppData%/DualView/favorites.json`
- Maximum 500 favoris (les plus anciens sont retirés si dépassé)
- Flush immédiat à la fermeture de l'application

---

### 🔧 Refactoring open source — découpage de `main.js`
`main.js` passe de **1 323 à 815 lignes (−38%)** par extraction de 4 modules dans `src/core/` :

| Module | Contenu |
|--------|---------|
| `core/config-manager.js` | Constantes, `loadConfig` / `saveConfig`, `configGet` / `configSet` |
| `core/url-guard.js` | `sanitizeUrl`, `isLoginPage`, `isAuthUrl`, `detectServiceKeyFromUrl` |
| `core/session-security.js` | Bloqueur pub réseau, `setupSessionSecurity` |
| `core/context-menu.js` | Menu contextuel natif clic droit (`buildAndShowContextMenu`) |

`main.js` conserve uniquement l'état global, la création des fenêtres, les IPC handlers et le lifecycle Electron.

### 🐛 Corrections AUTO_PAUSE_SCRIPT

**Pause automatique YouTube landscape ne fonctionnait pas sans publicité**
Le flag `__dualviewAutoPauseDone` était posé avant même de trouver la vidéo, bloquant tous les retries si le player YouTube n'était pas encore dans le DOM au moment du `dom-ready`. La pause ne fonctionnait qu'en présence de pub (par accident). Corrigé dans `landscape-webview.js` — le flag est désormais posé uniquement quand la vidéo est effectivement trouvée.

Ajout d'un appel `injectAutoPause` immédiat au `dom-ready` (en plus des timers à 2s et 5s) pour couvrir les rechargements où le player est déjà présent (`landscape-views.js`).

**YouTube Shorts pausés à tort dans le portrait**
La détection Shorts dans le script injecté (`location.href`) pouvait être périmée lors des navigations SPA — l'URL d'une vidéo classique précédente était encore présente au moment de l'évaluation. La garde est désormais effectuée côté renderer Electron (`isYouTubeShort(wv.getURL())`) avant toute injection, ce qui est toujours fiable (`portrait-app.js`).

**Retries orphelins et MaxListenersExceededWarning**
Le timer de sécurité portrait n'était pas annulé entre navigations, accumulant des listeners `did-stop-loading`. Corrigé avec `clearTimeout` à chaque `dom-ready` / `did-navigate`, et ajout du flag `__dualviewAutoPauseAborted` pour couper les `setTimeout` en vol.

### 🎨 Fix thème portrait au démarrage
Quand l'OS est en mode sombre mais que l'utilisateur a sélectionné le thème clair dans les paramètres, la fenêtre portrait restait sombre après redémarrage. Corrigé à trois niveaux : `backgroundColor` basé sur `getTheme()` (non plus hardcodé), et `initialTheme` exposé via `contextBridge` pour une application synchrone avant le premier rendu (sans flash).

---

## Nouveautés v0.4.5

### 🖥️ Support macOS et Linux
DualView est désormais disponible sur les trois grandes plateformes :

| Plateforme | Installeur | Prérequis |
|---|---|---|
| Windows 11 | `.exe` (NSIS) | — |
| macOS 12+ | `.dmg` (x64 + arm64) | Xcode Command Line Tools |
| Linux x64 | `.AppImage` + `.deb` | FUSE (`libfuse2`) |

**Installation macOS** : télécharger le `.dmg`, glisser DualView dans `/Applications`, au premier lancement faire clic droit → Ouvrir (Gatekeeper).

**Installation Linux** :
```bash
chmod +x DualView-*.AppImage
./DualView-*.AppImage
```

### 🔧 Script OBS Lua cross-platform
`dualview-obs-hotkeys.lua` détecte automatiquement l'OS et adapte la commande curl :
- Windows → `start "" /B curl ...`
- macOS / Linux → `curl ... &`

curl est natif sur Windows 10+ et macOS. Sur Linux : `sudo apt install curl`.

---

## Nouveautés v0.4.4

### 🗂️ Refactoring open source — séparation CSS / JS
Découpage de `landscape.html` (4 441 lignes) et `portrait.html` (996 lignes) en fichiers indépendants pour faciliter la contribution :

| Fichier original | Résultat | Réduction |
|---|---|---|
| `landscape.html` | `landscape.html` + `css/landscape.css` + 7 modules JS | 4 441 → 419 lignes (−91%) |
| `portrait.html` | `portrait.html` + `css/portrait.css` + 3 modules JS | 996 → 63 lignes (−94%) |

**Modules JS landscape** : `landscape-i18n.js` · `landscape-webview.js` · `landscape-ui.js` · `landscape-views.js` · `landscape-tabs.js` · `landscape-settings.js` · `landscape-pollers.js`

**Modules JS portrait** : `portrait-i18n.js` · `portrait-app.js` · `portrait-webview.js`

### 🌐 Internationalisation portrait (option B)
La fenêtre portrait bénéficie maintenant du système i18n complet :
- Attributs `data-i18n` sur tous les textes statiques des overlays
- Indicateur sync (`● Sync active` / `⏸ Sync pausée`) traduit dynamiquement
- Compte à rebours pub traduit via `tp()`
- Mise à jour en temps réel quand la langue change dans Paramètres

### 🖥️ Support macOS / Linux

DualView tourne maintenant sur les trois plateformes :

| Plateforme | Format | Architecture |
|---|---|---|
| Windows | `.exe` (NSIS) | x64 |
| macOS | `.dmg` | x64 + arm64 (Apple Silicon) |
| Linux | `.AppImage` | x64 |

Le script Lua OBS est également cross-platform (`curl` sous Windows, macOS et Linux).

> **Icônes requises** pour les builds non-Windows : `assets/icon.icns` (macOS) et `assets/icon.png` 512×512 (Linux). Voir `assets/README.txt`.

---

### 📁 Restructuration `src/`
```
src/
├── main.js
├── core/          auth-window.js · history-manager.js · logger.js · obs-control.js
├── preload/       preload-auth.js · preload-dev.js · preload-landscape.js · preload-view.js
└── renderer/
    ├── css/       landscape.css · portrait.css
    ├── js/        10 modules (landscape + portrait)
    ├── landscape.html · portrait.html · obs-dock.html
```

---

## Nouveautés v0.4.3

### 🔁 Synchronisation vidéo — refonte anti-boucle
Correction du bug de boucle sur YouTube : la vidéo portrait ne tournait plus en boucle sur les 5 premières secondes au lancement, ni après une pause, ni après un repositionnement de la timeline.

**Cause** : l'ancienne implémentation forçait `currentTime` à chaque commande `play`, ce qui déclenchait `seeked` dans landscape, qui renvoyait un `play`, etc. — boucle infinie.

**Solution** : protocole de commandes séquencées atomiques :

| Action utilisateur | Séquence envoyée à portrait |
|---|---|
| Pause | ① `pause()` → ② `seek-to(t)` après 50 ms |
| Lecture | ① `seek-to(t)` → ② `play()` après 100 ms |
| Sync périodique (5s) | `drift-check(t)` — appliqué uniquement si portrait est à l'arrêt ET écart > 2s |

**Règle fondamentale** : portrait ne force jamais `currentTime` sur une vidéo en lecture. L'événement `seeked` ne peut donc plus être déclenché depuis portrait vers landscape.

**Autres corrections incluses** :
- Un seul `MutationObserver` par webview (flag `__dualviewObserverActive`) — plus d'accumulation à chaque navigation
- Commandes en attente (`pendingCmd`) avec TTL de 5s — les commandes obsolètes expirent
- `load-url` vérifie que l'URL change réellement avant de recharger la webview portrait
- `sync-resume-state` ré-injecte l'executor sans double observer (scénario B : garde l'état courant)

---

## Nouveautés v0.4.2

### ⏸ Pause automatique des vidéos YouTube
Quand l'utilisateur clique sur une vidéo classique YouTube, elle est automatiquement
mise en pause dans **les deux fenêtres** dès son ouverture :

- **Si une publicité est en cours** : la pub joue librement sans interférence.
  La vidéo réelle est pausée dès la fin de la pub.
- **Si pas de pub** : pause immédiate à la seconde zéro.

L'option est désactivable dans **Paramètres → Général → Pause automatique des vidéos YouTube**.

> Les **YouTube Shorts** ne sont pas concernés par cette pause automatique.

### 📢 Overlay pub dans le portrait
Pendant qu'une publicité est diffusée dans la fenêtre paysage, un overlay
semi-transparent apparaît dans la fenêtre portrait :
- Message **"Publicité en cours"**
- **Compte à rebours** affiché si YouTube expose la durée restante
- Disparaît automatiquement à la fin de la pub

### 🔇 Bouton "Remettre en mute" (portrait)
La vidéo dans la fenêtre portrait est **toujours mute par défaut**.
Si l'utilisateur active le son via le menu contextuel, un bouton rouge
**🔇 Remettre en mute** apparaît en bas à droite de la fenêtre portrait.

### 📋 Fermeture automatique du dropdown historique
Le dropdown historique des boutons ← → se ferme automatiquement
**500 ms après** que la souris a quitté la zone (boutons ou dropdown).
Déplacement entre le bouton et le dropdown : pas de fermeture intempestive.

### 🛡️ Bloqueur de publicités renforcé
Le bloqueur passe à **3 niveaux** :
- **Niveau 1 — Réseau** : 50+ domaines publicitaires bloqués (vs 8 avant).
  Blocage ciblé des flux pub YouTube (`ctier=A`) sans affecter les vidéos normales.
- **Niveau 2 — DOM** : injection CSS masquant les éléments pub résiduels (bannières,
  overlays, compteurs).
- **Niveau 3 — JS** : neutralisation du SDK IMA de Google (pub in-stream YouTube).

### 🔄 Synchronisation vidéo améliorée
- Réalignement **exact** de la timeline portrait à chaque play (sans seuil de drift).
- Pause portrait forcée à `currentTime = 0` dès la détection de la vidéo.

---

## Nouveautés v0.4.1

### ⌨️ Raccourcis clavier
- `Alt+←` / `Alt+→` : navigation Retour / Avance
- `F5` / `Ctrl+R` : recharger
- `Ctrl+T` : nouvel onglet — `Ctrl+W` : fermer l'onglet actif
- `Ctrl+Tab` : onglet suivant
- `Ctrl+L` / `F6` : focus sur la barre d'adresse

### 🖱️ Boutons souris Retour / Avance
Les boutons latéraux de la souris (boutons 3 et 4) déclenchent Retour / Avance.

### 🔗 Liens externes → onglet DualView
Tout lien `target="_blank"` ou `window.open()` s'ouvre dans un **nouvel onglet DualView**
au lieu d'une fenêtre séparée.

### 🖱️ Menu contextuel clic droit
Clic droit dans la webview paysage : lien, image, texte sélectionné, page.
Option "Enregistrer l'image sous…" : dialogue système natif (seule exception aux
téléchargements bloqués).

---

## Nouveautés v0.4.0

### 📱 Redimensionnement Portrait repensé
**⚙️ → Redimensionner** ouvre une modale avec :
- Préréglages : iPhone 15 (390×844), Pixel 8 (412×915), Galaxy S24 (360×780), iPad (768×1024)
- Option taille libre : redimensionnez manuellement la fenêtre Portrait (contour orange)
- **Valider** verrouille la taille. **Annuler** restaure la taille précédente.

Le bouton ✅ est supprimé de la toolbar — tout passe par la modale.

### 📷 Capture instantanée
Le bouton **📷** dans la toolbar capture simultanément les deux vues en PNG horodaté.

- Nommage : `dualview_YYYY-MM-DD_HH-mm-ss_paysage.png` + `_portrait.png`
- Dossier configurable dans **Paramètres → Général → Captures d'écran** (par défaut : dossier Images)
- Toast de confirmation avec le chemin de sauvegarde

### 🔍 Barre d'adresse intelligente (omnibar)
- **Clic sur la barre** : tout le texte est sélectionné automatiquement
- **Échap** : annule la saisie et restaure l'URL courante
- **Suggestions** pendant la frappe : historique de navigation, complétion de domaine, recherche
- **Navigation clavier** : ↑ ↓ pour parcourir les suggestions, Entrée pour valider
- **Détection URL vs recherche** : texte avec un TLD reconnu → URL directe ; tout le reste → recherche

### 🔎 Moteur de recherche configurable
Dans **Paramètres → Général → Moteur de recherche** :
- **DuckDuckGo** par défaut (respect de la vie privée)
- Google, Bing, Brave Search, Qwant disponibles
- Ajout de moteurs personnalisés (nom + URL template)

---

## Nouveautés v0.3.2

### 🔄 Contrôle depuis OBS
Pilotez DualView **sans quitter OBS**, de deux façons complémentaires :

- **Panneau de dock OBS** — un panneau intégré à l'interface OBS pour contrôler
  la synchronisation, l'URL et les onglets à la souris, avec affichage de l'état
  en temps réel (sync, URL, onglet actif).
- **Hotkeys OBS natives** — un script Lua ajoute de vrais raccourcis clavier OBS
  pour pause/reprise/redémarrage sync, navigation, recharge, nouvel/fermer onglet.

Le tout via un petit serveur local hébergé par DualView (sur `127.0.0.1`,
protégé par token). Aucune configuration du WebSocket d'OBS n'est nécessaire.

👉 Voir le guide détaillé : **`obs-integration/OBS_INTEGRATION.md`**

Activation et réglages : **⚙️ → Paramètres → OBS** (activer/désactiver, port,
URL du dock, token).

---

## Nouveautés v0.3.0

### Services connectés
Connexion aux services web depuis **Paramètres → Services connectés** :
- 9 services pré-configurés : Google, Microsoft, Instagram, Facebook, Twitch, TikTok, X/Twitter, Discord, Steam
- Connexion dans une fenêtre dédiée : clés d'accès Windows Hello, FIDO2, email/mot de passe fonctionnels
- URL personnalisée avec bouton "J'ai terminé" + confirmation
- Détection automatique de connexion par cookies

### Démarrage sync différé
Synchronisation activée 3 secondes après l'ouverture, le temps que les deux fenêtres soient prêtes.

### Contrôle de synchronisation
Le bouton **● Sync** dans la toolbar : ⏸ Pause / ▶ Reprendre / ↺ Redémarrer.

### Détection des pages de connexion
- **Landscape** : popup avec bouton "Se connecter" direct pour le service détecté
- **Portrait** : overlay plein écran, disparaît automatiquement à la navigation

---

## Onglets

- **+** pour ajouter un onglet
- Cliquez pour sélectionner (sans rechargement)
- **×** pour fermer (minimum 1)
- Recommandation OBS : ≤ 5 onglets (~80–150 Mo RAM par onglet)

---

## Synchronisation

### Scroll
Paysage → Portrait en pourcentage.

### Vidéo
play/pause/seek détectés dans Paysage → appliqués au Portrait via séquences atomiques.
Protocole anti-boucle v0.4.3 : seek-to avant play, seek-to après pause, drift-check conditionnel.
Seuil de correction drift : ±2s (portrait à l'arrêt seulement).
Plateformes : YouTube, TikTok, Instagram, générique.

---

## Sécurité

- Téléchargements bloqués (exception : enregistrement d'image via clic droit)
- Permissions refusées (caméra, micro, géoloc, notifications)
- Navigation limitée à `http://`, `https://`, `file://`
- Bloqueur pub 3 niveaux : réseau (50+ domaines) + CSS cosmétique + stub SDK IMA
- YouTube Shorts : exemptés du bloqueur (pas de pré-roll)

---

## Configuration OBS

### Capture des fenêtres
1. Source **Capture de fenêtre** → `DualView - Paysage` ou `DualView - Portrait`
2. Décochez "Capturer le curseur" si désiré

Les titres sont stables entre les changements d'onglets.

### Contrôle depuis OBS (dock + hotkeys)
Voir le guide complet **`obs-integration/OBS_INTEGRATION.md`**.
En bref : récupérez l'URL du dock et le token dans **⚙️ → Paramètres → OBS**,
ajoutez un dock de navigateur personnalisé dans OBS, et chargez le script Lua
`obs-integration/dualview-obs-hotkeys.lua` pour les raccourcis natifs.

---

## Persistance

| Donnée | Emplacement |
|--------|-------------|
| Position / taille | `%APPDATA%\DualView\dualview-config.json` |
| Onglets & URLs | idem |
| Paramètres & Services | idem |
| **Historique de navigation** | `%APPDATA%\DualView\history.json` |
| **Favoris** | `%APPDATA%\DualView\favorites.json` |
| Cookies sessions | `%APPDATA%\DualView\Partitions\persist_dualview\` |

---

## Désinstallation

**Paramètres Windows → Applications → DualView → Désinstaller**

Supprimez `%APPDATA%\DualView\` pour tout effacer.

---

## Pour les contributeurs

**Prérequis** : Node.js >= 22 ([nodejs.org](https://nodejs.org))

| Plateforme | Commande | Artefact |
|---|---|---|
| Windows | `installer\build-installer.bat` | `DualView-Setup-<version>.exe` |
| macOS | `./installer/build-installer.sh --mac` | `DualView-<version>.dmg` |
| Linux | `./installer/build-installer.sh --linux` | `DualView-<version>.AppImage` |

---

## Stack technique

- **Electron 42** (Chromium 130+, Node.js 22)
- **IPC sécurisé** : `contextIsolation` + preload scripts
- **Anti-détection** : `preload-auth.js` (5 couches) + `AutomationControlled` flag
- **Contrôle OBS** : serveur local HTTP+WebSocket (`obs-control.js`, 127.0.0.1 + token), dock `obs-dock.html`, script Lua hotkeys
- **Cookies** : `persist:dualview` partagé entre webviews et fenêtres auth
- **Persistance** : `fs` + JSON natif
- **Installeur** : electron-builder — NSIS (Windows), DMG (macOS), AppImage + deb (Linux) (Windows) · DMG (macOS) · AppImage (Linux)

---

## Historique des versions

| Version | Notes |
|---------|-------|
| 0.1.0 | Version initiale. Navigation, onglets, scroll sync, thèmes. |
| 0.2.0 | Sync vidéo. YouTube/TikTok/Instagram. |
| 0.2.1 | Bloqueur pub. Boutons nav ←/→. |
| 0.2.2 | Fix bloqueur pub. Fix nav back/forward. |
| 0.2.3 | Fix sync vidéo. |
| 0.2.4 | Contrôle intégré dans Paysage. Portrait taille fixe. |
| 0.2.5 | Sécurité. Paramètres. Menu ⚙️. i18n FR/EN. |
| 0.2.6 | Pool de webviews. Switch onglet sans rechargement. |
| 0.3.0 | Sync différée. Bouton sync. Services connectés. Anti-détection Electron. Détection login. YouTube Shorts. |
| 0.3.1 | Fix cookies portrait. Fix ERR_ABORTED. Fix sync vidéo YouTube. Fix pub 1re vidéo. Auth Microsoft robuste. Overlay paramètres portrait. Mode debug --dev. |
| 0.3.2 | Intégration OBS (dock + hotkeys Lua). Serveur local HTTP+WebSocket. |
| 0.4.0 | Redimensionnement Portrait via modale (préréglages + taille libre). Capture instantanée PNG (📷). Omnibar. Moteur de recherche configurable. Historique de navigation persistant. Dropdown ← →. |
| 0.4.1 | Raccourcis clavier. Boutons souris Retour/Avance. Liens externes → onglet DualView. Menu contextuel clic droit. Enregistrement image. |
| 0.4.2 | Pause automatique vidéos YouTube classiques (+ paramètre). Overlay pub dans portrait (message + compte à rebours). Bouton remute portrait. Fermeture auto dropdown historique (500 ms unfocus). Bloqueur pub renforcé 3 niveaux (50+ domaines, CSS cosmétique, stub IMA). Sync vidéo : réalignement exact au play, pause à currentTime=0. |
| 0.4.3 | Refonte sync vidéo anti-boucle : protocole séquencé atomique (pause→seek-to ; seek-to→play). Suppression du forçage currentTime sur play. drift-check conditionnel (portrait à l'arrêt seulement, seuil 2s). MutationObserver unique par webview. pendingCmd avec TTL 5s. Correction double-src sur load-url. |
| 0.4.4 | Refactoring open source : séparation CSS/JS landscape et portrait. Restructuration src/ (core/, preload/, renderer/). i18n portrait (option B). CONTRIBUTING.md, CHANGELOG.md, GitHub Actions. |
| 0.4.5 | Support macOS (.dmg x64+arm64) et Linux (.AppImage + .deb). Script OBS Lua cross-platform. Build CI 3 plateformes. |
| 0.4.6 | Refactoring `main.js` (1323 → 815 lignes) : extraction de 4 modules core/ (config-manager, url-guard, session-security, context-menu). Fix AUTO_PAUSE_SCRIPT landscape (retries bloqués sans pub). Fix Shorts portrait pausés à tort (garde renderer). Fix retries orphelins + MaxListenersExceededWarning. Fix thème portrait au démarrage (flash de fond). |
| 0.4.7 | Favoris : favorites-manager.js, bouton ★ toolbar, panneau latéral, entrée ⚙️. Fix services personnalisés (add-custom-service IPC). GitHub/GitLab dans KNOWN_SERVICES. Fix portrait : getSettings() + language-changed. Fix MaxListenersExceededWarning : setMaxListeners(50) webviews pool + authWin. |
| 0.5.0 | **Mode Focus** Ctrl+Shift+H / F11 (masque toolbar, bande 8px, badge). **Top domaines** sur onglet vide (top 10 par hostname, toutes sessions, paysage + portrait). **Fusion Apparence + Langue dans Général** (nav 4 entrées). **Réouverture portrait** depuis ⚙️ (reconstruction complète pool via dom-ready). Fix canGoBack() avant dom-ready. Fix réouverture portrait : dom-ready vs did-finish-load. |
| 0.5.1 | **Section Raccourcis clavier** dans Paramètres (5e entrée, 3 tableaux Windows/Linux/macOS, 18 clés i18n). Fix topsites : clics bloqués par webview `about:blank` (`pointer-events: none` via `.is-blank`), race condition `maybeShowTopSites` (guard `activeTabId`), `style.display` inline remplacé par `.hidden` dans `showWebview`, `switchTab` et handler `load-url`. |