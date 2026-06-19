# DualView vX.X.X - Instructions d'installation

## Installation (utilisateurs)

### Windows

**Prérequis** : Windows 11 (Build 22000+)

1. Téléchargez **`DualView-Setup-x.x.x.exe`** depuis les [Releases GitHub](https://github.com/<org>/dualview/releases)
2. Si Windows affiche "Éditeur inconnu" → **Plus d'informations** puis **Exécuter quand même**
3. Acceptez l'élévation Administrateur si demandée

Durée estimée : 5 à 15 minutes.

### macOS

**Prérequis** : macOS 12 Monterey ou supérieur

1. Téléchargez **`DualView-x.x.x.dmg`** depuis les [Releases GitHub](https://github.com/<org>/dualview/releases)
2. Ouvrez le `.dmg` et glissez **DualView** dans `/Applications`
3. Au premier lancement : clic droit → **Ouvrir** (contournement Gatekeeper)

### Linux

**Prérequis** : distribution x64 avec FUSE (Ubuntu 20.04+, Fedora 36+, Arch…)

1. Téléchargez **`DualView-x.x.x.AppImage`** depuis les [Releases GitHub](https://github.com/<org>/dualview/releases)
2. Rendez le fichier exécutable :
   ```bash
   chmod +x DualView-*.AppImage
   ./DualView-*.AppImage
   ```

> Sur certaines distributions, FUSE doit être installé : `sudo apt install libfuse2` (Ubuntu/Debian)

### Lancer DualView

**Windows** : Menu Démarrer → DualView  
**macOS** : `/Applications/DualView.app`  
**Linux** : double-clic sur le `.AppImage` ou `./DualView-*.AppImage`

---

## Désinstallation

**Windows** : Paramètres → Applications → DualView → Désinstaller  
Les données (`%APPDATA%\DualView\`) sont conservées. Supprimez ce dossier pour tout effacer.

**macOS** : Glissez `/Applications/DualView.app` dans la Corbeille  
Les données (`~/Library/Application Support/DualView/`) sont conservées. Supprimez ce dossier pour tout effacer.

**Linux** : Supprimez simplement le fichier `.AppImage`  
Les données (`~/.config/DualView/`) sont conservées. Supprimez ce dossier pour tout effacer.

---

## Fenêtres

| Fenêtre | Description |
|---------|-------------|
| DualView - Paysage | Barre de contrôle + vue Desktop 16:9 |
| DualView - Portrait | Vue Mobile 9:16 (taille fixe par défaut) |

---

## Barre de navigation (fenêtre Paysage)

`← → ⟳ 🏠 [url] ▶ 📷 [● Sync] ⚙️`

| Bouton | Fonction |
|--------|----------|
| ← | Page précédente (les deux fenêtres) |
| → | Page suivante (les deux fenêtres) |
| ⟳ | Recharger (les deux fenêtres) |
| 🏠 | Page d'accueil |
| ▶ | Charger l'URL ou lancer une recherche |
| 📷 | Capture instantanée des deux vues en PNG |
| ● Sync | Contrôle de la synchronisation |
| ⚙️ | Menu : Redimensionner / Paramètres / Historique |

---

## Contrôle de la synchronisation

Cliquez sur **● Sync** pour afficher le menu :

| Option | Description |
|--------|-------------|
| ⏸ Mettre en pause | Suspend la sync (scroll, vidéo, navigation) |
| ▶ Reprendre | Relance la sync ; réinjecte les scripts vidéo et scroll |
| ↺ Redémarrer | Pause 500 ms puis reprise complète |

La synchronisation démarre automatiquement 3 secondes après l'ouverture.

---

## Services connectés

**⚙️ → Paramètres → Services connectés**

### Services pré-configurés
Google, Microsoft, Instagram, Facebook, Twitch, TikTok, X/Twitter, Discord, Steam, GitHub, GitLab.

La connexion s'effectue dans une fenêtre dédiée qui contourne les restrictions des webviews Electron (email/mot de passe). Les clés d'accès (Windows Hello, Touch ID, clés de sécurité FIDO2) sont volontairement désactivées dans cette fenêtre depuis la v0.6.2, pour des raisons de sécurité.

### Service personnalisé
Cliquez **+ Ajouter un service**, entrez un nom et une URL, puis **Connecter**. Un bouton **"✓ J'ai terminé"** apparaît dans la fenêtre d'auth. Cliquez-le une fois connecté et confirmez.

### Déconnexion
Survolez une tuile connectée → **✕**, ou utilisez **Déconnecter** pour les services personnalisés.

---

## Détection des pages de connexion

Quand DualView détecte une page de connexion :

**Dans landscape** : popup proposant :
- **Retour** — revenir à la page précédente
- **Se connecter (Nom du service)** — ouvre directement la fenêtre d'auth
- **Services connectés** — ouvre l'onglet Services connectés

**Dans portrait** : overlay plein écran orange indiquant *"Page de connexion détectée — Synchronisation en pause"*. Disparaît automatiquement quand l'utilisateur quitte la page de connexion.

---

## YouTube Shorts

Les Shorts (`youtube.com/shorts/...`) sont exemptés du bloqueur de publicités. La synchronisation vidéo reste active.

---

## Paramètres

**⚙️ → Paramètres** — 5 sections depuis vX.X.X :

- **Général** : restauration onglets, pause auto YouTube, page d'accueil, nouveaux onglets, moteur de recherche, dossier captures, apparence, langue, **vérification de mise à jour** *(v0.7.0)*
- **Services connectés** : gestion des connexions (11 services + URL personnalisée)
- **Confidentialité** : informations sur les protections actives
- **OBS** : activation serveur local, port, URL dock, token
- **Raccourcis clavier** *(vX.X.X)* : tableaux Navigation / Onglets / Interface avec distinction Windows/Linux vs macOS

---

## Redimensionnement de la fenêtre Portrait

1. **⚙️ → Redimensionner** — choisissez un préréglage (iPhone 15, Pixel 8, Galaxy S24, iPad) ou **Taille libre** pour redimensionner manuellement (contour orange)
2. **Valider** pour verrouiller la taille et reprendre la synchronisation, ou **Annuler** pour restaurer la taille précédente

---

## Configuration OBS

### Capture des fenêtres
Deux sources "Capture de fenêtre" :
- `DualView - Paysage` : vue Desktop
- `DualView - Portrait` : vue Mobile

Les titres sont stables entre les changements d'onglets.

### Contrôle depuis OBS (dock + hotkeys)
1. Ouvrez **⚙️ → Paramètres → OBS** dans DualView : notez le **port**, le **token** et l'**URL du dock**.
2. **Dock** : dans OBS → *Affichage → Docks → Dock de navigateur personnalisé*, collez l'URL du dock.
3. **Hotkeys** : dans OBS → *Outils → Scripts*, ajoutez `obs-integration/dualview-obs-hotkeys.lua`, renseignez port + token, puis attribuez les touches dans *Paramètres → Raccourcis clavier* (entrées « DualView : … »).

Guide complet pas à pas : **obs-integration/OBS_INTEGRATION.md**.

---

## Pour les contributeurs : builder l'installeur

**Prérequis** : Node.js >= 22 (https://nodejs.org)

| Plateforme | Commande | Artefact produit |
|---|---|---|
| Windows | `installer\build-installer.bat` | `dist/DualView-Setup-X.X.X.exe` (~150 Mo) |
| macOS | `./installer/build-installer.sh --mac` | `dist/DualView-X.X.X.dmg` |
| Linux | `./installer/build-installer.sh --linux` | `dist/DualView-X.X.X.AppImage` + `.deb` |

Voir `assets/README.txt` pour générer les icônes `icon.icns` (macOS) et `icon.png` (Linux) avant le premier build.

En mode développement (toutes plateformes) :
```bash
npm start
```

Les DevTools sont accessibles via `Ctrl+Maj+I` (Windows/Linux) ou `⌘+Option+I` (macOS) dans toutes les fenêtres.