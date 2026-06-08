# DualView v0.4.3

Affichage simultané d'une page web en vue **Desktop (16:9)** et **Mobile (9:16)**
avec synchronisation en temps réel — optimisé pour la capture OBS,
et **pilotable directement depuis OBS** (dock + raccourcis clavier).

---

## Installation

### Prérequis
- Windows 11 (Build 22000+)
- Connexion internet (~30 Mo pour Node.js si absent)

### Procédure
1. Double-cliquez sur **`DualView-Setup-0.4.3.exe`**
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
| ← → | Page précédente / suivante (les deux fenêtres). Survol 500 ms → dropdown historique de l'onglet |
| ⟳ | Recharger (les deux fenêtres) |
| 🏠 | Page d'accueil |
| [url] | Barre d'adresse — sélection auto au clic, Échap annule, suggestions omnibar |
| ▶ | Charger l'URL ou lancer une recherche |
| 📷 | Capture instantanée des deux vues en PNG |
| ● Sync | Contrôle synchronisation (Pause/Reprendre/Redémarrer) |
| ⚙️ | Menu : Redimensionner / Paramètres |

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

Produit `dist/DualView-Setup-0.4.3.exe` (~150 Mo).

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
| 0.3.1 | Fix cookies portrait. Fix ERR_ABORTED. Fix sync vidéo YouTube. Fix pub 1re vidéo. Auth Microsoft robuste. Overlay paramètres portrait. Mode debug --dev. |
| 0.3.2 | Intégration OBS (dock + hotkeys Lua). Serveur local HTTP+WebSocket. |
| 0.4.0 | Redimensionnement Portrait via modale (préréglages + taille libre). Capture instantanée PNG (📷). Omnibar. Moteur de recherche configurable. Historique de navigation persistant. Dropdown ← →. |
| 0.4.1 | Raccourcis clavier. Boutons souris Retour/Avance. Liens externes → onglet DualView. Menu contextuel clic droit. Enregistrement image. |
| 0.4.2 | Pause automatique vidéos YouTube classiques (+ paramètre). Overlay pub dans portrait (message + compte à rebours). Bouton remute portrait. Fermeture auto dropdown historique (500 ms unfocus). Bloqueur pub renforcé 3 niveaux (50+ domaines, CSS cosmétique, stub IMA). Sync vidéo : réalignement exact au play, pause à currentTime=0. |
| 0.4.3 | Refonte sync vidéo anti-boucle : protocole séquencé atomique (pause→seek-to ; seek-to→play). Suppression du forçage currentTime sur play. drift-check conditionnel (portrait à l'arrêt seulement, seuil 2s). MutationObserver unique par webview. pendingCmd avec TTL 5s. Correction double-src sur load-url. |