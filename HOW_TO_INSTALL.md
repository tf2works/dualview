# DualView v0.4.1 - Instructions d'installation

## Nouveautés v0.4.1

- **Raccourcis clavier** : `Alt+←/→` (navigation), `F5`/`Ctrl+R` (recharger), `Ctrl+T/W/Tab` (onglets), `Ctrl+L`/`F6` (barre d'adresse)
- **Boutons souris** : boutons latéraux (3 et 4) pour Retour/Avance
- **Liens externes** : tout lien `target="_blank"` ou `window.open()` s'ouvre en onglet DualView
- **Menu contextuel clic droit** : lien, image, texte sélectionné, page (sans "Ouvrir dans une nouvelle fenêtre")
- **Enregistrement d'image** : clic droit → "Enregistrer l'image sous…" via dialogue système natif

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
1. Double-cliquez sur **DualView-Setup-0.4.2.exe`**
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
Produit **dist/DualView-Setup-0.4.2.exe** (~150 Mo).