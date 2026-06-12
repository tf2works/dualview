# DualView v0.5.1 - Instructions d'installation

## Nouveautés v0.5.1

- **Section Raccourcis clavier dans les Paramètres** : nouvelle entrée ⚓ dans la barre latérale, trois tableaux distincts (Navigation, Onglets, Interface) avec colonnes Windows/Linux vs macOS
- **Correctifs topsites** : clics sur les icônes du top 10 désormais fonctionnels (webview `about:blank` ne bloque plus les événements souris) ; le top 10 reste visible à l'ouverture de plusieurs onglets vides consécutifs

## Nouveautés v0.5.0

- **Mode Focus** (`Ctrl+Shift+H` ou `F11`) : masque la toolbar pour maximiser la capture OBS. Bande de détection 8 px, badge discret, toast de confirmation.
- **Top 10 domaines** sur onglet vide (mode "Page vide") : sites les plus visités avec favicon, visibles dans les deux fenêtres. Clic = navigation directe.
- **Fusion Apparence + Langue dans Général** : Paramètres simplifiés à 4 entrées.
- **Réouverture Portrait** : bouton ⚙️ → "Rouvrir le portrait" si la fenêtre portrait est fermée, reconstruction complète du pool d'onglets.

## Nouveautés v0.4.5

- **Support macOS** : installeur `.dmg` (x64 + arm64), compatible macOS 12 Monterey et supérieur
- **Support Linux** : installeur `.AppImage` + `.deb` (x64), compatible Ubuntu 20.04+, Fedora 36+, Arch…
- **Script OBS Lua cross-platform** : le script `dualview-obs-hotkeys.lua` fonctionne sur Windows, macOS et Linux
- **Build cross-platform** : script `installer/build-installer.sh` pour macOS et Linux ; GitHub Actions génère automatiquement les 3 plateformes sur chaque release

## Nouveautés v0.4.4

- **Refactoring open source** : `landscape.html` (4 441 → 419 lignes) et `portrait.html` (996 → 63 lignes) découpés en modules CSS et JS séparés
- **i18n portrait** : indicateur sync, overlay pub et textes statiques traduits dynamiquement selon la langue sélectionnée dans Paramètres
- **Restructuration `src/`** : dossiers `core/`, `preload/`, `renderer/` pour une meilleure lisibilité du code source

## Nouveautés v0.4.3

- **Correction boucle vidéo YouTube** : la vidéo portrait ne tourne plus en boucle sur les 5 premières secondes au lancement, après une pause, ou après repositionnement de la timeline
- **Protocole sync séquencé** : `pause → seek-to` et `seek-to → play` avec délais garantis
- **Drift-check conditionnel** : la correction périodique de dérive ne s'applique plus que si la vidéo portrait est à l'arrêt

## Nouveautés v0.4.2

- **Pause automatique YouTube** : vidéos classiques pausées au chargement dans les deux fenêtres (option désactivable dans Paramètres)
- **Overlay pub** : message "Publicité en cours" + compte à rebours dans la fenêtre portrait pendant les pubs
- **Bouton remute** : bouton rouge dans portrait si la vidéo a été démutée accidentellement
- **Bloqueur pub renforcé** : 3 niveaux (réseau 50+ domaines, CSS cosmétique, stub IMA)

## Nouveautés v0.4.0

- **Redimensionnement Portrait repensé** : **⚙️ → Redimensionner** avec préréglages (iPhone 15, Pixel 8, Galaxy S24, iPad) + taille libre. Le bouton ✅ de la toolbar est supprimé.
- **Capture instantanée** : bouton 📷 dans la toolbar — PNG horodaté des deux vues, dossier configurable dans Paramètres
- **Omnibar** : sélection auto au clic, Échap annule, suggestions (historique, domaine, recherche), navigation ↑↓
- **Moteur de recherche configurable** : DuckDuckGo par défaut, Google / Bing / Brave / Qwant prédéfinis + moteurs personnalisés
- **Historique de navigation** : panneau latéral (⚙️ → Historique) groupé par date, recherche fulltext, suppression ; dropdown sur ← →

---

## Installation (utilisateurs)

### Windows

**Prérequis** : Windows 11 (Build 22000+)

1. Téléchargez **`DualView-Setup-0.5.1.exe`** depuis les [Releases GitHub](https://github.com/<org>/dualview/releases)
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
Google, Microsoft, Instagram, Facebook, Twitch, TikTok, X/Twitter, Discord, Steam.

La connexion s'effectue dans une fenêtre dédiée qui contourne les restrictions des webviews Electron (clés d'accès Windows Hello, FIDO2, et email/mot de passe sont supportés).

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

**⚙️ → Paramètres** — 5 sections depuis v0.5.1 :

- **Général** : restauration onglets, pause auto YouTube, page d'accueil, nouveaux onglets, moteur de recherche, dossier captures, apparence, langue
- **Services connectés** : gestion des connexions (9 services + URL personnalisée)
- **Confidentialité** : informations sur les protections actives
- **OBS** : activation serveur local, port, URL dock, token
- **Raccourcis clavier** *(v0.5.1)* : tableaux Navigation / Onglets / Interface avec distinction Windows/Linux vs macOS

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
| Windows | `installer\build-installer.bat` | `dist/DualView-Setup-0.5.1.exe` (~150 Mo) |
| macOS | `./installer/build-installer.sh --mac` | `dist/DualView-0.5.1.dmg` |
| Linux | `./installer/build-installer.sh --linux` | `dist/DualView-0.5.1.AppImage` + `.deb` |

Voir `assets/README.txt` pour générer les icônes `icon.icns` (macOS) et `icon.png` (Linux) avant le premier build.

En mode développement (toutes plateformes) :
```bash
npm start -- --dev
```