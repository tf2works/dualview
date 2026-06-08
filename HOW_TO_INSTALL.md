# DualView v0.4.4 - Instructions d'installation

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

### Prérequis
- Windows 11 (Build 22000+)
- Connexion internet

### Procédure
1. Double-cliquez sur **DualView-Setup-0.4.4.exe`**
2. Si Windows affiche "Éditeur inconnu" → **Plus d'informations** puis **Exécuter quand même**
3. Acceptez l'élévation Administrateur si demandée

Durée estimée : 5 à 15 minutes.

### Lancer DualView
Cherchez **DualView** dans le Menu Démarrer.

---

## Désinstallation

**Paramètres Windows → Applications → DualView → Désinstaller**

Les données (`%APPDATA%\DualView\`) sont conservées. Supprimez ce dossier pour tout effacer.

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

**⚙️ → Paramètres**

- **Général** : restauration onglets, page d'accueil, nouveaux onglets
- **Apparence** : Automatique / Clair / Sombre (redémarrage requis)
- **Langue** : Français / English (redémarrage requis)
- **Services connectés** : gestion des connexions
- **Confidentialité** : informations sur les protections actives

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

Lancez **installer/build-installer.bat** depuis le dossier racine.
Produit **dist/DualView-Setup-0.4.4.exe** (~150 Mo).