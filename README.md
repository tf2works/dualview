# DualView v0.7.1

Affichage simultané d'une page web en vue **Desktop (16:9)** et **Mobile (9:16)**
avec synchronisation en temps réel — optimisé pour la capture OBS,
et **pilotable directement depuis OBS** (dock + raccourcis clavier).

---

## Table des matières

- [Installation](#installation)
- [Fenêtres](#fenêtres)
- [Navigation](#navigation)
- [Raccourcis clavier](#raccourcis-clavier)
- [Boutons souris](#boutons-souris)
- [Onglets](#onglets)
- [Synchronisation](#synchronisation)
- [Mode Focus](#mode-focus)
- [Favoris](#favoris)
- [Historique de navigation](#historique-de-navigation)
- [Captures d'écran](#captures-décran)
- [Page de démarrage — Top domaines](#page-de-démarrage--top-domaines)
- [Redimensionnement Portrait](#redimensionnement-portrait)
- [Réouverture de la fenêtre Portrait](#réouverture-de-la-fenêtre-portrait)
- [Services connectés](#services-connectés)
- [Intégration OBS](#intégration-obs)
- [Détection des publicités YouTube](#détection-des-publicités-youtube)
- [Lecteur PDF natif](#lecteur-pdf-natif)
- [Récupération après crash webview](#récupération-après-crash-webview)
- [Vérification de mise à jour](#vérification-de-mise-à-jour)
- [Paramètres](#paramètres)
- [Sécurité](#sécurité)
- [Persistance des données](#persistance-des-données)
- [Stack technique](#stack-technique)
- [Pour les contributeurs](#pour-les-contributeurs)
- [Désinstallation](#désinstallation)
- [Historique des versions](#historique-des-versions)

---

## Installation

### Prérequis

| Plateforme | Prérequis |
|---|---|
| Windows 11 (Build 22000+) | — |
| macOS 12+ | Xcode Command Line Tools |
| Linux x64 | FUSE (`libfuse2`) |

### Windows

1. Double-cliquez sur **`DualView-Setup-0.7.1.exe`**
2. Si Windows affiche "Éditeur inconnu" → **Plus d'informations** puis **Exécuter quand même**
3. Acceptez l'élévation Administrateur
4. Attendez la fin de l'installation (5 à 15 min)
5. Lancez **DualView** depuis le Menu Démarrer

### macOS

Téléchargez le `.dmg`, glissez DualView dans `/Applications`, puis au premier lancement : clic droit → **Ouvrir** (Gatekeeper).

### Linux

```bash
chmod +x DualView-*.AppImage
./DualView-*.AppImage
```

👉 Voir le guide complet : **[HOW_TO_INSTALL.md](HOW_TO_INSTALL.md)**

---

## Fenêtres

| Fenêtre | Titre OBS | Description |
|---------|-----------|-------------|
| Paysage | `DualView - Paysage` | Barre de contrôle + vue Desktop 16:9 |
| Portrait | `DualView - Portrait` | Vue Mobile 9:16 (taille fixe) |

Les titres de fenêtre sont stables entre les changements d'onglets, ce qui garantit une capture OBS fiable.

---

## Navigation

### Barre de contrôle (fenêtre Paysage)

```
← → ⟳ 🏠 [url] ▶ ★ 📷 [● Sync] ⚙️
```

| Bouton | Fonction |
|--------|----------|
| `←` `→` | Page précédente / suivante (**les deux fenêtres**). Survol 500 ms → dropdown historique de l'onglet |
| `⟳` | Recharger les deux fenêtres |
| `🏠` | Page d'accueil |
| `[url]` | Barre d'adresse — sélection auto au clic, `Échap` annule, suggestions omnibar |
| `▶` | Charger l'URL ou lancer une recherche |
| `★` | Ajouter / retirer la page des favoris |
| `📷` | Capture instantanée des deux vues en PNG |
| `● Sync` | Contrôle synchronisation — ⏸ Pause / ▶ Reprendre / ↺ Redémarrer |
| `⚙️` | Menu : Redimensionner / Historique / Favoris / Rouvrir le portrait / Paramètres |

### Navigation persistante entre sessions *(v0.7.1)*

Les boutons `←` et `→` restent fonctionnels **après un redémarrage de l'application**. Chaque onglet conserve sa pile de navigation (jusqu'à 50 entrées) dans la configuration locale. À la réouverture, les pages précédemment visitées sont accessibles via `←` sans avoir à les retrouver manuellement dans l'historique.

- **Pendant une session** : navigation native Chromium (cache de page, état de formulaire préservé)
- **Après redémarrage** : mode simulé — rechargement de la page précédente depuis l'URL sauvegardée
- **Retour au mode natif** : automatique dès la première navigation organique (barre d'adresse ou clic sur un lien)
- **Dropdown** : le survol de `←` / `→` pendant 500 ms affiche la pile de navigation, y compris les entrées restaurées

### Barre d'adresse intelligente (omnibar)

- **Clic** : tout le texte est sélectionné automatiquement
- **Échap** : annule la saisie et restaure l'URL courante
- **Suggestions** pendant la frappe : historique de navigation, complétion de domaine, recherche
- **Navigation clavier** : `↑` `↓` pour parcourir les suggestions, `Entrée` pour valider
- **Détection URL vs recherche** : texte avec un TLD reconnu → URL directe ; tout le reste → recherche

### Raccourcis clavier

Les raccourcis utilisent `Ctrl` sur Windows/Linux et `⌘ Cmd` sur macOS. Les touches `F5`, `F6`, `F11` sont identiques sur les trois systèmes.

**Navigation**

| Action | Windows / Linux | macOS |
|--------|----------------|-------|
| Retour | `Alt+←` | `⌘+[` |
| Avance | `Alt+→` | `⌘+]` |
| Recharger | `F5` ou `Ctrl+R` | `F5` ou `⌘+R` |
| Barre d'adresse | `Ctrl+L` ou `F6` | `⌘+L` ou `F6` |

**Onglets**

| Action | Windows / Linux | macOS |
|--------|----------------|-------|
| Nouvel onglet | `Ctrl+T` | `⌘+T` |
| Fermer l'onglet actif | `Ctrl+W` | `⌘+W` |
| Rouvrir l'onglet fermé | `Ctrl+Shift+T` | `⌘+Shift+T` |
| Onglet suivant | `Ctrl+Tab` | `⌃+Tab` |
| Onglet précédent | `Ctrl+Shift+Tab` | `⌃+Shift+Tab` |

**Interface**

| Action | Windows / Linux | macOS |
|--------|----------------|-------|
| Mode Focus (masquer toolbar) | `Ctrl+Shift+H` ou `F11` | `⌘+Shift+H` ou `F11` |
| Fermer menus / dropdowns | `Échap` | `Échap` |

> Le tableau complet est également consultable dans **Paramètres → Raccourcis clavier**.

### Boutons souris

Les boutons latéraux de la souris (bouton 4 = retour, bouton 5 = avance) sont pris en charge sur Windows, macOS et Linux.

### Liens externes

Tout lien `target="_blank"` ou `window.open()` s'ouvre dans un **nouvel onglet DualView** au lieu d'une fenêtre séparée.

### Menu contextuel (clic droit)

Clic droit dans la webview paysage : lien, image, texte sélectionné, page.
L'option **"Enregistrer l'image sous…"** ouvre un dialogue système natif (seule exception aux téléchargements bloqués).

---

## Onglets

- **`+`** pour ajouter un onglet
- Cliquez pour sélectionner (sans rechargement — pool de webviews)
- **`×`** pour fermer (minimum 1 onglet)
- `Ctrl+T` / `Ctrl+W` pour ouvrir / fermer via clavier
- Chaque onglet affiche le favicon réel du site, avec repli automatique sur une icône générique si indisponible

> **Recommandation OBS** : ≤ 5 onglets (~80–150 Mo RAM par onglet)

### Rouvrir l'onglet fermé

`Ctrl+Shift+T`, ou clic droit sur n'importe quel onglet → *Rouvrir l'onglet fermé*. Historique illimité en mémoire pendant la session.

### Groupes d'onglets

Organisez vos onglets par glisser-déposer, comme dans Chrome ou Edge.

- Clic droit sur un onglet → *Ajouter à un groupe* → groupe existant ou *Nouveau groupe…*
- Chaque groupe reçoit une couleur automatique et un nom générique non dupliqué, personnalisable via clic droit sur le label (60 caractères max)
- Clic sur le label pour réduire / déplier le groupe
- Glisser-déposer un onglet hors du groupe pour le retirer ; un groupe disparaît automatiquement s'il lui reste moins de 2 membres
- Les groupes sont conservés entre les sessions

### Onglets épinglés

Clic droit sur un onglet → *Épingler l'onglet*. Affichés en icône seule à l'extrême gauche de la barre, jusqu'à 5 onglets épinglés simultanément. Non déplaçables, non ajoutables à un groupe ; **conservés entre les sessions** (depuis v0.6.1).

---

## Synchronisation

La synchronisation maintient portrait et paysage sur la même URL et le même état vidéo.

- **Démarrage automatique** à l'ouverture (état : `● Actif`)
- **Pause / Reprendre** : bouton `●` ou menu déroulant
- **Redémarrer** : recharge le portrait sur l'URL du paysage et réinitialise l'état vidéo
- **Suivi de scroll** : le scroll paysage se propage vers portrait (proportionnel à la hauteur de page)
- **Sync vidéo** : play, pause et seek déclenchés dans paysage se reproduisent dans portrait avec compensation de latence
- Plateformes supportées : YouTube (classique + Shorts), TikTok, Instagram

---

## Mode Focus

`Ctrl+Shift+H` ou `F11` masque la toolbar et la barre d'onglets pour maximiser la zone de capture OBS. Un badge de confirmation s'affiche 2 secondes.

- **Réaffichage temporaire** : survolez la bande de 8 px en haut de l'écran → la toolbar apparaît 2 secondes
- **Réaffichage permanent** : refaire `Ctrl+Shift+H` / `F11`

---

## Favoris

Bouton `★` dans la toolbar pour ajouter / retirer la page courante. Panneau latéral via **⚙️ → Favoris** :

- Champ de recherche
- Clic sur un favori → navigation immédiate
- `✕` par entrée pour supprimer

Les favoris sont persistés dans `%APPDATA%\DualView\favorites.json`.

---

## Historique de navigation

Panneau latéral via **⚙️ → Historique** :

- Regroupé par période (Aujourd'hui, Hier, Cette semaine, par mois)
- Champ de recherche (fulltext sur URL + titre)
- Clic sur une entrée → navigation
- `✕` par entrée pour supprimer une URL
- **Effacer tout** pour vider l'historique

Max 5 000 entrées (FIFO). Persisté dans `%APPDATA%\DualView\history.json`.

---

## Captures d'écran

Bouton `📷` dans la toolbar → capture PNG instantanée des deux fenêtres (paysage + portrait).

- Dossier configurable dans **Paramètres → Général → Dossier de captures**
- Nom automatique : `dualview-<YYYY-MM-DD>-<HHmmss>-<paysage|portrait>.png`
- Toast de confirmation avec le chemin du dossier

---

## Page de démarrage — Top domaines

Sur un onglet vide (mode *Nouvel onglet vide* activé dans les Paramètres), une grille des 10 domaines les plus visités s'affiche, calculée depuis l'historique de navigation.

---

## Redimensionnement Portrait

Bouton **⚙️ → Redimensionner** → modale avec :

- **Préréglages** : iPhone SE / 15, Galaxy S24, iPad Mini, Pixel 8
- **Taille libre** : redimensionnez directement la fenêtre Portrait avec la souris

Le préréglage sélectionné est mémorisé pour les sessions suivantes.

---

## Réouverture de la fenêtre Portrait

Si la fenêtre Portrait est fermée accidentellement, **⚙️ → Rouvrir le portrait** la reconstruit complètement (même URL, même état de sync).

---

## Services connectés

**⚙️ → Paramètres → Services** — 11 services pré-configurés + URL personnalisée :

Google · Microsoft · Instagram · Facebook · Twitch · TikTok · Twitter/X · Discord · Steam · GitHub · GitLab

Chaque service ouvre une fenêtre de connexion isolée (partition dédiée, anti-détection Electron renforcé) qui partage les cookies avec les webviews DualView.

---

## Intégration OBS

DualView intègre un **serveur local HTTP + WebSocket** (`127.0.0.1`, token d'auth) permettant de piloter l'application depuis OBS Studio via un script Lua (`obs-integration/dualview-obs-hotkeys.lua`).

Actions disponibles depuis OBS :

- Navigation ← / → / ↺ / 🏠
- Chargement d'une URL
- Gestion des onglets (nouvel onglet / fermer)

### Configuration

Activation et réglages dans **⚙️ → Paramètres → OBS** (activer/désactiver, port, URL du dock, token).

Le tout fonctionne via un serveur local hébergé par DualView (`127.0.0.1`, protégé par token). Aucune configuration du WebSocket d'OBS n'est nécessaire.

👉 Voir le guide détaillé : **[obs-integration/OBS_INTEGRATION.md](obs-integration/OBS_INTEGRATION.md)**

### Capture OBS des fenêtres

1. Source **Capture de fenêtre** → `DualView - Paysage` ou `DualView - Portrait`
2. Décochez "Capturer le curseur" si désiré

---

## Détection des publicités YouTube

DualView **détecte** les publicités YouTube en cours dans la fenêtre Paysage et informe la fenêtre Portrait via un overlay.

> ℹ️ DualView n'est **pas** un bloqueur de publicités — les pubs continuent de se diffuser normalement dans les webviews. Le système sert uniquement à signaler leur présence, ce qui est particulièrement utile pour les streamers.

### Overlay pub Portrait

Pendant qu'une publicité est diffusée dans la fenêtre Paysage, un overlay semi-transparent apparaît dans le Portrait :
- Message **"Publicité en cours"**
- **Compte à rebours** si YouTube expose la durée restante
- Disparaît automatiquement à la fin de la pub

---

## Lecteur PDF natif

Navigation vers un fichier `.pdf` → le document s'affiche dans le **lecteur PDF intégré à Chromium**, dans les deux fenêtres (paysage et portrait). Aucune configuration requise.

---

## Récupération après crash webview

Si une page provoque le crash du processus de rendu d'un onglet (JavaScript lourd, fuite mémoire…), DualView affiche une **page de récupération** à la place de l'onglet figé :

- Reconstruction automatique après **10 secondes**
- Bouton **"🔄 Recharger maintenant"** pour ne pas attendre
- Toast de notification visible même si l'onglet n'est pas actif
- Fonctionne dans les deux fenêtres indépendamment

---

## Vérification de mise à jour

**Paramètres → Général → Vérifier les mises à jour** interroge l'API GitHub Releases et affiche si une nouvelle version est disponible, avec un lien direct vers la page de téléchargement. Aucun téléchargement automatique — l'installation reste manuelle.

---

## Paramètres

Accessible via **⚙️ → Paramètres** — 6 sections :

| Section | Contenu |
|---------|---------|
| **Général** | Page d'accueil, nouveaux onglets, pause auto YouTube, moteur de recherche, dossier captures, apparence (thème), langue, **vérification de mise à jour** *(v0.7.0)* |
| **Services** | Services connectés (11 pré-configurés + URL personnalisée) |
| **Confidentialité** | Gestion des données locales |
| **OBS** | Activation serveur local, port, URL du dock, token |
| **Raccourcis clavier** | Tableau complet des raccourcis — Windows/Linux vs macOS |
| **Export / Import** | Sauvegarde et restauration de la configuration (voir ci-dessous) |

### Export / Import de configuration

Sauvegardez ou restaurez votre configuration depuis **Paramètres → Export / Import**.

**Export sélectif** — 18 éléments répartis en 6 catégories :

| Catégorie | Éléments |
|---|---|
| Comportement | Restaurer onglets, Pause auto YouTube, Mute portrait |
| Page d'accueil | Mode, URL personnalisée, Nouveaux onglets |
| Interface | Apparence, Langue |
| Moteur de recherche | ID actif, URL, Nom, Moteurs personnalisés |
| Autres | Dossier captures, Préréglage portrait, Services personnalisés |
| Données | Historique de navigation, Favoris, Dimensions fenêtre portrait |

Pour l'historique, 4 options de limite : **500** (défaut) · **1 000** · **5 000** · **Tout**.

**Import avec merge sélectif** — après ouverture du fichier, une modale compare les valeurs importées et actuelles. Chaque élément est sélectionnable individuellement. Historique et favoris sont **fusionnés** sans supprimer l'existant. Si l'apparence ou la langue changent, un redémarrage est proposé automatiquement.

### Moteur de recherche configurable

- **DuckDuckGo** par défaut (respect de la vie privée)
- Disponibles : Google, Bing, Brave Search, Qwant
- Ajout de moteurs **personnalisés** (nom + URL template)

### Thèmes

- Clair / Sombre / Système (suit le thème de l'OS)
- Appliqué aux deux fenêtres simultanément, sans flash au démarrage

### Langue

- Français / Anglais
- Changement en temps réel (sans redémarrage)

---

## Sécurité

| Mesure | Détail |
|--------|--------|
| Téléchargements bloqués | Exception : enregistrement d'image via clic droit |
| Permissions refusées | Caméra, micro, géolocalisation, notifications |
| Navigation limitée | `http://`, `https://`, `file://` uniquement |
| Anti-détection Electron | `preload-auth.js` (5 couches) + flag `AutomationControlled` |
| IPC sécurisé | `contextIsolation` + preload scripts |
| Serveur OBS local | Lié à `127.0.0.1` + token d'authentification |

> **Note sur les logs console** : des messages `ERR_NETWORK_ACCESS_DENIED` ou `ERR_ABORTED` peuvent apparaître dans la console de développement. Ils sont attendus : le premier signale le bloqueur de trackers en action (ex. Optimizely) ; le second provient de YouTube qui normalise ses URLs mobile/desktop en interne, ou du handler `will-download` qui annule les téléchargements non autorisés. Aucun impact fonctionnel.

---

## Persistance des données

| Donnée | Emplacement |
|--------|-------------|
| Position / taille des fenêtres | `%APPDATA%\DualView\dualview-config.json` |
| Onglets, URLs & piles de navigation | idem *(v0.7.1)* |
| Groupes d'onglets | idem |
| Paramètres & Services | idem |
| Historique de navigation | `%APPDATA%\DualView\history.json` |
| Favoris | `%APPDATA%\DualView\favorites.json` |
| Cookies & sessions | `%APPDATA%\DualView\Partitions\persist_dualview\` |

---

## Stack technique

- **Electron 42** (Chromium 130+, Node.js 22)
- **IPC sécurisé** : `contextIsolation` + preload scripts
- **Anti-détection** : `preload-auth.js` (5 couches) + flag `AutomationControlled`
- **Contrôle OBS** : serveur local HTTP+WebSocket (`obs-control.js`, `127.0.0.1` + token), dock `obs-dock.html`, script Lua hotkeys
- **Cookies** : partition `persist:dualview` partagée entre webviews et fenêtres auth
- **Persistance** : `fs` + JSON natif
- **Installeur** : electron-builder — NSIS (Windows) · DMG (macOS) · AppImage + deb (Linux)

---

## Pour les contributeurs

**Prérequis** : Node.js >= 22 ([nodejs.org](https://nodejs.org))

| Plateforme | Commande | Artefact |
|---|---|---|
| Windows | `installer\build-installer.bat` | `DualView-Setup-<version>.exe` |
| macOS | `./installer/build-installer.sh --mac` | `DualView-<version>.dmg` |
| Linux | `./installer/build-installer.sh --linux` | `DualView-<version>.AppImage` |

👉 Voir aussi : **[CONTRIBUTING.md](CONTRIBUTING.md)** · **[ARCHITECTURE.md](ARCHITECTURE.md)**

---

## Désinstallation

**Paramètres Windows → Applications → DualView → Désinstaller**

Supprimez `%APPDATA%\DualView\` pour effacer toutes les données locales.

---

## Historique des versions

👉 Voir **[VERSION_HISTORY.md](VERSION_HISTORY.md)** pour le détail complet de chaque version.

| Version | Résumé |
|---------|--------|
| 0.7.1 | **Navigation persistante entre sessions** : pile `navStack[]`/`navIndex` par onglet, persistée dans la config. Boutons `←`/`→` fonctionnels après redémarrage (mode simulé → rechargement URL ; mode natif → cache Chromium). Dropdown ← → alimenté depuis la pile restaurée. Correction bug `_simModeSet` supprimé par le `did-navigate` du chargement initial. |
| 0.7.0 | Récupération crash webview (render-process-gone, overlay inline, auto-reload 10s) ; lecteur PDF natif (`plugins="true"`) ; vérification de mise à jour (API GitHub, bouton Paramètres → Général) ; corrections : GitHub/GitLab dans Services connectés, `detectServiceKeyFromUrl()`, `MaxListenersExceededWarning` → 200, `ERR_ABORTED` filtrés, `#dev-btn` résiduel supprimé ; raccourcis clavier redessinés |
| 0.6.2 | **Sécurité** : clés d'accès (WebAuthn — Windows Hello, Touch ID, FIDO2) désactivées dans la fenêtre d'authentification |
| 0.6.1 | Fixes : drag & drop hors groupe, onglets épinglés persistés, groupe orphelin, console silencieuse pour les favicons |
| 0.6.0 | Groupes d'onglets, onglets épinglés, rouvrir l'onglet fermé, favicons réels, menu contextuel natif |
| 0.5.4 | Menu contextuel étendu : retour/avance grisés, imprimer PDF, code source, inspecter élément |
| 0.5.3 | Onglets déplaçables (Drag & Drop), typage des onglets |
| 0.5.2 | Export / Import de configuration sélectif |
| 0.5.1 | Section Raccourcis clavier dans Paramètres ; correctifs topsites |
| 0.5.0 | Mode Focus, Top domaines, fusion Apparence+Langue, réouverture Portrait |
| 0.4.7 | Favoris (★ toolbar + panneau latéral) |
| 0.4.6 | Refactoring `main.js` (−38 %), fixes AUTO_PAUSE, thème portrait |
| 0.4.5 | Support macOS et Linux, script Lua cross-platform |
| 0.4.4 | Refactoring CSS/JS, i18n portrait, restructuration `src/` |
| 0.4.3 | Refonte sync vidéo anti-boucle |
| 0.4.2 | Pause auto YouTube, overlay pub portrait, bloqueur pub 3 niveaux |
| 0.4.1 | Raccourcis clavier, boutons souris, menu contextuel |
| 0.4.0 | Redimensionnement Portrait, capture PNG, omnibar, historique |
| 0.3.2 | Intégration OBS (dock + hotkeys Lua) |
| 0.3.0 | Services connectés, sync différée, bouton sync, anti-détection |
| 0.2.x | Sync vidéo, bloqueur pub, navigation ←/→ |
| 0.1.0 | Version initiale : navigation, onglets, scroll sync, thèmes |