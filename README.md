# DualView v0.4.2

Affichage simultané d'une page web en vue **Desktop (16:9)** et **Mobile (9:16)**
avec synchronisation en temps réel — optimisé pour la capture OBS,
et **pilotable directement depuis OBS** (dock + raccourcis clavier).

---

## Installation

### Prérequis
- Windows 11 (Build 22000+)
- Connexion internet (~30 Mo pour Node.js si absent)

### Procédure
1. Double-cliquez sur **`DualView-Setup-0.4.2.exe`**
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
← → ⟳ 🏠 [url] ▶ 📷 [● Sync] ⚙️
```

| Bouton | Fonction |
|--------|----------|
| ← → | Page précédente / suivante (les deux fenêtres) |
| ⟳ | Recharger (les deux fenêtres) |
| 🏠 | Page d'accueil |
| [url] | Barre d'adresse — sélection auto au clic, Échap annule, suggestions omnibar |
| ▶ | Charger l'URL ou lancer une recherche |
| 📷 | Capture instantanée des deux vues en PNG |
| ● Sync | Contrôle synchronisation (Pause/Reprendre/Redémarrer) |
| ⚙️ | Menu : Redimensionner / Paramètres |

---

## Nouveautés v0.4.2

### 🧩 Restructuration modulaire (maintenabilité open source)

`main.js` (1 243 lignes) et `landscape.html` (4 237 lignes) ont été découpés en modules ciblés. Aucun changement fonctionnel — 100% compatible avec les versions précédentes.

**Côté processus principal** (`src/main/`) :
- `config-manager.js` — configuration JSON, constantes, préréglages
- `security.js` — bloqueur de publicités, sécurisation de session
- `url-detector.js` — détection pages login, URLs d'auth, identification de services
- `sync-manager.js` — cycle de vie de la synchronisation (démarrage différé, pause, reprise)
- `window-manager.js` — création et gestion des fenêtres BrowserWindow
- `context-menu.js` — menu contextuel clic droit
- `ipc/` — 9 handlers IPC thématiques (navigation, sync, tabs, historique, portrait, services, paramètres, OBS, captures)

**Côté renderer landscape** (`src/landscape/`) :
- `landscape.html` — HTML pur (~420 lignes, remplace les 4 237 lignes monolithiques)
- `landscape.css` — tous les styles (~955 lignes)
- `js/` — 15 modules JS : `i18n`, `state`, `ui-utils`, `webview-pool`, `tabs-manager`, `navigation`, `sync-ui`, `login-popup`, `history-panel`, `nav-history-dropdown`, `resize-modal`, `settings-panel`, `services-panel`, `keyboard-shortcuts`, `landscape-init`

---

## Nouveautés v0.4.1

### ⌨️ Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Alt + ←` / `Alt + →` | Page précédente / suivante |
| `F5` / `Ctrl + R` | Recharger |
| `Ctrl + T` | Nouvel onglet |
| `Ctrl + W` | Fermer l'onglet |
| `Ctrl + Tab` | Onglet suivant |
| `Ctrl + L` / `F6` | Focus barre d'adresse |

### 🖱️ Boutons souris Retour/Avance
Les boutons latéraux de la souris (boutons 3 et 4) déclenchent navigation arrière/avant,
comme dans un navigateur standard.

### 🔗 Ouverture de liens dans DualView
Tout lien ouvrant normalement un nouvel onglet navigateur (`target="_blank"`, `window.open()`)
est automatiquement redirigé dans un nouvel onglet DualView au lieu d'une fenêtre externe.

### 🖱️ Menu contextuel clic droit
Menu natif contextuel selon l'élément cliqué :
- **Lien** : Ouvrir dans un nouvel onglet, Copier l'URL
- **Image** : Enregistrer l'image sous…, Copier l'URL de l'image
- **Texte sélectionné** : Copier, Rechercher
- **Page** : Recharger, Copier l'URL de la page

### 💾 Enregistrement d'image (clic droit)
Enregistrement natif via dialogue système — seule exception aux téléchargements
bloqués par défaut.

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
- **Suggestions** pendant la frappe : historique de navigation, complétion de domaine, recherche avec le moteur configuré
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

### YouTube Shorts
Bloqueur de publicités désactivé sur `youtube.com/shorts/`.

---

## Problèmes connus v0.3.0

| # | Symptôme | Contournement |
|---|----------|---------------|
| 1 | Portrait non connecté après auth Google | Recharger via ⟳ |
| 2 | Auth Microsoft : fenêtre ne se ferme pas | Fermer manuellement |
| 3 | Outlook/services Microsoft : ERR_ABORTED dans portrait | Lié au BUG-2, corrigé en v0.3.1 |

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
play/pause/seek détectés dans Paysage → appliqués à Portrait (±3s / ±5s). YouTube, TikTok, Instagram, générique.

---

## Sécurité

- Téléchargements bloqués (exception : enregistrement d'image via clic droit)
- Permissions refusées (caméra, micro, géoloc, notifications)
- Navigation limitée à `http://`, `https://`, `file://`
- Bloqueur pub intégré (Google Ads, DoubleClick, YouTube pre-roll)
- Exception : YouTube Shorts

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
| Cookies sessions | `%APPDATA%\DualView\Partitions\persist_dualview\` |

---

## Désinstallation

**Paramètres Windows → Applications → DualView → Désinstaller**

Supprimez `%APPDATA%\DualView\` pour tout effacer.

---

## Pour les contributeurs

**Prérequis** : Node.js >= 22 ([nodejs.org](https://nodejs.org))

```
installer/build-installer.bat
```

Produit `dist/DualView-Setup-0.4.2.exe` (~150 Mo).

---

## Stack technique

- **Electron 42** (Chromium 130+, Node.js 22)
- **IPC sécurisé** : `contextIsolation` + preload scripts
- **Anti-détection** : `preload-auth.js` (5 couches) + `AutomationControlled` flag
- **Contrôle OBS** : serveur local HTTP+WebSocket (`obs-control.js`, 127.0.0.1 + token), dock `obs-dock.html`, script Lua hotkeys
- **Cookies** : `persist:dualview` partagé entre webviews et fenêtres auth
- **Persistance** : `fs` + JSON natif
- **Installeur** : electron-builder NSIS

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
| 0.3.1 | Fix cookies portrait. Fix ERR_ABORTED. Fix sync vidéo YouTube. Fix pub 1re vidéo. Auth Microsoft robuste. Overlay paramètres portrait. Mode debug --dev. || 0.3.2 | Intégration OBS (dock + hotkeys Lua). Serveur local HTTP+WebSocket. |
| 0.4.0 | Redimensionnement Portrait via modale (préréglages + taille libre). Capture instantanée PNG (📷). Omnibar (suggestions + Échap + sélection auto). Détection URL vs recherche. Moteur de recherche configurable (DuckDuckGo par défaut). Historique de navigation persistant (history.json) : panneau latéral groupé par date, recherche, suppression ; dropdown sur ← → par onglet. |
| 0.4.1 | Raccourcis clavier (Alt+←/→, F5/Ctrl+R, Ctrl+T/W/Tab, Ctrl+L/F6). Boutons souris Retour/Avance (boutons 3 et 4). Toute ouverture de nouvelle fenêtre redirigée en onglet DualView (`target="_blank"`, `window.open()`). Menu contextuel clic droit : lien, image, texte sélectionné, page — sans "Ouvrir dans une nouvelle fenêtre". Enregistrement d'image via clic droit ("Enregistrer l'image sous…") — seule exception aux téléchargements bloqués. |
| 0.4.2 | Restructuration modulaire : `main.js` → point d'entrée + 6 modules + 9 handlers IPC. `landscape.html` → HTML pur + CSS externe + 15 modules JS. Zéro régression. |