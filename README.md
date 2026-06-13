# DualView v0.5.2

Affichage simultané d'une page web en vue **Desktop (16:9)** et **Mobile (9:16)**
avec synchronisation en temps réel — optimisé pour la capture OBS,
et **pilotable directement depuis OBS** (dock + raccourcis clavier).

---

## Table des matières

- [Installation](#installation)
- [Fenêtres](#fenêtres)
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
- [Bloqueur de publicités](#bloqueur-de-publicités)
- [Paramètres](#paramètres)
- [Sécurité](#sécurité)
- [Persistance des données](#persistance-des-données)
- [Stack technique](#stack-technique)
- [Pour les contributeurs](#pour-les-contributeurs)
- [Désinstallation](#désinstallation)

---

## Installation

### Prérequis

| Plateforme | Prérequis |
|---|---|
| Windows 11 (Build 22000+) | — |
| macOS 12+ | Xcode Command Line Tools |
| Linux x64 | FUSE (`libfuse2`) |

### Windows

1. Double-cliquez sur **`DualView-Setup-0.5.2.exe`**
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

Les titres de fenêtre sont stables entre les changements d'onglets, ce qui garantit une capture OBS fiable.

---

## Navigation

### Barre de contrôle (fenêtre Paysage)
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

> **Recommandation OBS** : ≤ 5 onglets (~80–150 Mo RAM par onglet)

---

## Synchronisation

### Scroll

Le défilement de la fenêtre Paysage est reproduit dans le Portrait en pourcentage de hauteur de page.

### Vidéo

Les événements play / pause / seek détectés dans Paysage sont appliqués au Portrait via un protocole de commandes séquencées atomiques (anti-boucle) :

| Action utilisateur | Séquence envoyée au portrait |
|---|---|
| Pause | ① `pause()` → ② `seek-to(t)` après 50 ms |
| Lecture | ① `seek-to(t)` → ② `play()` après 100 ms |
| Sync périodique (5 s) | `drift-check(t)` — appliqué uniquement si portrait est à l'arrêt ET écart > 2 s |

Plateformes supportées : YouTube, TikTok, Instagram, générique.

> La vidéo dans le Portrait est **toujours mute par défaut**. Si l'utilisateur active le son, un bouton **🔇 Remettre en mute** apparaît en bas à droite.

### Démarrage différé

La synchronisation s'active 3 secondes après l'ouverture, le temps que les deux fenêtres soient prêtes.

### Pause automatique YouTube

Quand l'utilisateur ouvre une vidéo YouTube classique, elle est automatiquement mise en pause dans les deux fenêtres :
- **Si une publicité est en cours** : la pub joue librement ; la vidéo réelle est pausée à la fin.
- **Si pas de pub** : pause immédiate à la seconde zéro.

Désactivable dans **Paramètres → Général → Pause automatique des vidéos YouTube**.

> Les **YouTube Shorts** ne sont pas concernés.

---

## Mode Focus

Appuyez sur **`Ctrl+Shift+H`** ou **`F11`** pour masquer la toolbar et maximiser la zone de capture OBS.

La toolbar reste accessible sans quitter le mode :
- **Survol du bord supérieur** (bande invisible de 8 px) : la toolbar réapparaît 2 secondes
- **Déplacer la souris sur la toolbar** : elle reste visible tant que la souris y est
- Un **badge discret** en bas à droite confirme l'activation (disparaît après 2 s)
- Même raccourci pour désactiver

---

## Favoris
## Favoris

Mettez n'importe quelle page en favori d'un simple clic sur l'étoile **★** dans la barre de contrôle.
Mettez n'importe quelle page en favori d'un simple clic sur l'étoile **★** dans la barre de contrôle.

- **☆** (inactif) → la page n'est pas en favori
- **★ dorée** (actif) → la page est en favori. Un toast de confirmation s'affiche.

### Panneau latéral Favoris

Accessible via **⚙️ → Favoris** :
- **☆** (inactif) → la page n'est pas en favori
- **★ dorée** (actif) → la page est en favori. Un toast de confirmation s'affiche.

### Panneau latéral Favoris

Accessible via **⚙️ → Favoris** :
- Barre de recherche fulltext sur URL et titre
- Cliquer sur une entrée navigue directement vers cette page
- Suppression individuelle
- Fermeture par ✕, `Échap`, ou clic extérieur
- Suppression individuelle
- Fermeture par ✕, `Échap`, ou clic extérieur

**Persistance** : stockés dans `%AppData%/DualView/favorites.json` — maximum 500 entrées.

---

## Historique de navigation

Un historique persistant est conservé entre les sessions :
- Accessible via **⚙️ → Historique**
- Affiché dans les suggestions de l'omnibar pendant la frappe
- Alimenté automatiquement par toutes les navigations (toutes sessions confondues)

Dropdown **← →** : survolez un bouton pendant 500 ms pour afficher l'historique de l'onglet actif.
**Persistance** : stockés dans `%AppData%/DualView/favorites.json` — maximum 500 entrées.

---

## Historique de navigation

Un historique persistant est conservé entre les sessions :
- Accessible via **⚙️ → Historique**
- Affiché dans les suggestions de l'omnibar pendant la frappe
- Alimenté automatiquement par toutes les navigations (toutes sessions confondues)

Dropdown **← →** : survolez un bouton pendant 500 ms pour afficher l'historique de l'onglet actif.

---

## Captures d'écran

Le bouton **📷** capture simultanément les deux vues en PNG horodaté :
## Captures d'écran

Le bouton **📷** capture simultanément les deux vues en PNG horodaté :

- Nommage : `dualview_YYYY-MM-DD_HH-mm-ss_paysage.png` + `_portrait.png`
- Dossier configurable dans **Paramètres → Général → Captures d'écran** (par défaut : dossier Images)
- Toast de confirmation avec le chemin de sauvegarde

---

## Page de démarrage — Top domaines

Quand **Paramètres → Général → Nouveaux onglets** est réglé sur **"Page vide"**, les onglets vides affichent automatiquement vos sites les plus fréquentés :

- Jusqu'à **10 domaines** classés par nombre de visites (toutes sessions confondues)
- Aucun doublon (normalisé par hostname, `www.` ignoré)
- Favicon de chaque site avec fallback sur l'initiale du domaine
- Visible dans **les deux fenêtres** — Paysage et Portrait affichent la même grille
- Clic → navigation directe dans l'onglet actif

---

## Redimensionnement Portrait

**⚙️ → Redimensionner** ouvre une modale avec :

- **Préréglages** : iPhone 15 (390×844), Pixel 8 (412×915), Galaxy S24 (360×780), iPad (768×1024)
- **Taille libre** : redimensionnez manuellement la fenêtre Portrait (contour orange)
- **Valider** verrouille la taille. **Annuler** restaure la taille précédente.

---

## Réouverture de la fenêtre Portrait

Si la fenêtre Portrait est fermée accidentellement, rouvrez-la sans redémarrer DualView :

1. Cliquez sur **⚙️** dans la toolbar Paysage
2. Sélectionnez **"Rouvrir le portrait"** (entrée visible uniquement si Portrait fermé)
3. La fenêtre se rouvre à sa **dernière position et taille connue**
4. Tous les onglets ouverts dans Paysage sont **automatiquement reconstruits** dans le Portrait

---

## Services connectés

---

## Page de démarrage — Top domaines

Quand **Paramètres → Général → Nouveaux onglets** est réglé sur **"Page vide"**, les onglets vides affichent automatiquement vos sites les plus fréquentés :

- Jusqu'à **10 domaines** classés par nombre de visites (toutes sessions confondues)
- Aucun doublon (normalisé par hostname, `www.` ignoré)
- Favicon de chaque site avec fallback sur l'initiale du domaine
- Visible dans **les deux fenêtres** — Paysage et Portrait affichent la même grille
- Clic → navigation directe dans l'onglet actif

---

## Redimensionnement Portrait

**⚙️ → Redimensionner** ouvre une modale avec :

- **Préréglages** : iPhone 15 (390×844), Pixel 8 (412×915), Galaxy S24 (360×780), iPad (768×1024)
- **Taille libre** : redimensionnez manuellement la fenêtre Portrait (contour orange)
- **Valider** verrouille la taille. **Annuler** restaure la taille précédente.

---

## Réouverture de la fenêtre Portrait

Si la fenêtre Portrait est fermée accidentellement, rouvrez-la sans redémarrer DualView :

1. Cliquez sur **⚙️** dans la toolbar Paysage
2. Sélectionnez **"Rouvrir le portrait"** (entrée visible uniquement si Portrait fermé)
3. La fenêtre se rouvre à sa **dernière position et taille connue**
4. Tous les onglets ouverts dans Paysage sont **automatiquement reconstruits** dans le Portrait

---

## Services connectés

Connexion aux services web depuis **Paramètres → Services connectés** :

- **9 services pré-configurés** : Google, Microsoft, Instagram, Facebook, Twitch, TikTok, X/Twitter, Discord, Steam
- Connexion dans une **fenêtre dédiée** : compatibilité Windows Hello, FIDO2, email/mot de passe
- **URL personnalisée** avec bouton "J'ai terminé" + confirmation
- **Détection automatique de connexion** par cookies

- **9 services pré-configurés** : Google, Microsoft, Instagram, Facebook, Twitch, TikTok, X/Twitter, Discord, Steam
- Connexion dans une **fenêtre dédiée** : compatibilité Windows Hello, FIDO2, email/mot de passe
- **URL personnalisée** avec bouton "J'ai terminé" + confirmation
- **Détection automatique de connexion** par cookies

### Détection des pages de connexion

- **Paysage** : popup avec bouton "Se connecter" direct pour le service détecté
- **Portrait** : overlay plein écran, disparaît automatiquement à la navigation

---

## Intégration OBS

Pilotez DualView **sans quitter OBS**, de deux façons complémentaires :

### Panneau de dock OBS

Un panneau intégré à l'interface OBS pour contrôler la synchronisation, l'URL et les onglets à la souris, avec affichage de l'état en temps réel (sync, URL, onglet actif).

### Hotkeys OBS natives (script Lua)

Le script `obs-integration/dualview-obs-hotkeys.lua` ajoute de vrais raccourcis clavier OBS pour :
- Pause / Reprendre / Redémarrer la sync
- Navigation (retour / avance / recharger)
- Gestion des onglets (nouvel onglet / fermer)

Le script est **cross-platform** : détecte automatiquement l'OS et adapte la commande curl.

### Configuration

Activation et réglages dans **⚙️ → Paramètres → OBS** (activer/désactiver, port, URL du dock, token).

Le tout fonctionne via un serveur local hébergé par DualView (`127.0.0.1`, protégé par token). Aucune configuration du WebSocket d'OBS n'est nécessaire.

👉 Voir le guide détaillé : **[obs-integration/OBS_INTEGRATION.md](obs-integration/OBS_INTEGRATION.md)**

### Capture OBS des fenêtres

1. Source **Capture de fenêtre** → `DualView - Paysage` ou `DualView - Portrait`
2. Décochez "Capturer le curseur" si désiré

---

## Bloqueur de publicités

Le bloqueur fonctionne à **3 niveaux** :

| Niveau | Mécanisme | Détail |
|--------|-----------|--------|
| 1 — Réseau | Blocage de 50+ domaines publicitaires | Blocage ciblé des flux pub YouTube (`ctier=A`) sans affecter les vidéos normales |
| 2 — DOM | Injection CSS | Masquage des éléments pub résiduels (bannières, overlays, compteurs) |
| 3 — JS | Stub SDK | Neutralisation du SDK IMA de Google (pub in-stream YouTube) |

> **YouTube Shorts** : exemptés du bloqueur (pas de pré-roll).

### Overlay pub Portrait

Pendant qu'une publicité est diffusée dans la fenêtre Paysage, un overlay semi-transparent apparaît dans le Portrait :
- Message **"Publicité en cours"**
- **Compte à rebours** si YouTube expose la durée restante
- Disparaît automatiquement à la fin de la pub

---

## Paramètres

Accessible via **⚙️ → Paramètres** — 6 sections :

| Section | Contenu |
|---------|---------|
| **Général** | Page d'accueil, nouveaux onglets, pause auto YouTube, moteur de recherche, dossier captures, apparence (thème), langue |
| **Services** | Services connectés (9 pré-configurés + URL personnalisée) |
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
| Mesure | Détail |
|--------|--------|
| Téléchargements bloqués | Exception : enregistrement d'image via clic droit |
| Permissions refusées | Caméra, micro, géolocalisation, notifications |
| Navigation limitée | `http://`, `https://`, `file://` uniquement |
| Anti-détection Electron | `preload-auth.js` (5 couches) + flag `AutomationControlled` |
| IPC sécurisé | `contextIsolation` + preload scripts |
| Serveur OBS local | Lié à `127.0.0.1` + token d'authentification |

---

## Persistance des données
## Persistance des données

| Donnée | Emplacement |
|--------|-------------|
| Position / taille des fenêtres | `%APPDATA%\DualView\dualview-config.json` |
| Position / taille des fenêtres | `%APPDATA%\DualView\dualview-config.json` |
| Onglets & URLs | idem |
| Paramètres & Services | idem |
| Historique de navigation | `%APPDATA%\DualView\history.json` |
| Favoris | `%APPDATA%\DualView\favorites.json` |
| Cookies & sessions | `%APPDATA%\DualView\Partitions\persist_dualview\` |
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
| 0.5.2 | Export / Import de configuration : 18 éléments sélectionnables (paramètres, historique avec limite, favoris, dimensions portrait), merge sélectif à l'import, restart auto si apparence/langue |
| 0.5.1 | Section Raccourcis clavier dans Paramètres (Windows/Linux/macOS) ; correctifs topsites (clics, race condition, disparition au 2e onglet) ; `pointer-events` webview vide |
| 0.5.0 | Mode Focus, Top domaines, fusion Apparence+Langue, réouverture Portrait |
| 0.4.7 | Favoris (★ toolbar + panneau latéral) |
| 0.4.6 | Refactoring `main.js` (−38%), fixes AUTO_PAUSE, thème portrait |
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