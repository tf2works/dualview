# DualView v0.2.5 - Instructions d'installation

## Nouveautés v0.2.5

- Paramètres intégrés (onglet ⚙️) : page d'accueil, restauration onglets,
  apparence, langue (FR/EN)
- Boutons ⟳ (recharger) et 🏠 (accueil) dans la barre de navigation
- Menu ⚙️ : Redimensionner | Paramètres
- Sécurité renforcée : blocage téléchargements, permissions, schémas non-http
- Installeur simplifié : un seul script, pas de dépendance WiX
- Page d'accueil par défaut : Knack3 Marketplace

## Nouveautés v0.2.4

- Barre de contrôle intégrée dans la fenêtre paysage (3 fenêtres → 2)
- Fenêtre portrait non redimensionnable par défaut
- Bouton ▶ remplace "Charger"
- Labels PAYSAGE/PORTRAIT retirés

## Nouveautés v0.2.3

- Fix synchronisation vidéo : 2ème vidéo ne freeze plus dans Portrait

---

## Installation (utilisateurs)

### Prérequis

- Windows 11 (Build 22000+)
- Connexion internet pour télécharger Node.js si absent (~30 Mo)

### Procédure

1. Double-cliquez sur **DualView-Setup-0.2.5.exe**
2. Si Windows affiche "Éditeur inconnu" → cliquez **Plus d'informations**
   puis **Exécuter quand même**
3. Si Windows demande une élévation → cliquez **Oui**

L'installeur effectue automatiquement :
- Détection de Node.js ; téléchargement et installation si absent
- Compilation de DualView (npm install + electron-builder)
- Installation dans Program Files\DualView\
- Création d'un raccourci dans le Menu Démarrer

Durée estimée : 5 à 15 minutes selon la connexion.

### Lancer DualView

Cherchez **DualView** dans le Menu Démarrer.

---

## Désinstallation

**Paramètres Windows → Applications → DualView → Désinstaller**

Les données de configuration (`%APPDATA%\DualView\`) sont conservées
par défaut. Supprimez ce dossier manuellement si vous souhaitez
tout effacer.

---

## Fenêtres

| Fenêtre             | Description                                      |
|---------------------|--------------------------------------------------|
| DualView - Paysage  | Barre de contrôle + vue Desktop 16:9             |
| DualView - Portrait | Vue Mobile 9:16 (taille fixe par défaut)         |

---

## Barre de navigation (fenêtre Paysage)

`← → ⟳ 🏠 [url] ▶ [✅] ⚙️`

| Bouton | Fonction |
|--------|----------|
| ←  | Page précédente (les deux fenêtres) |
| →  | Page suivante (les deux fenêtres) |
| ⟳  | Recharger (les deux fenêtres) |
| 🏠 | Page d'accueil |
| ▶  | Charger l'URL saisie |
| ✅ | Valider le redimensionnement Portrait |
| ⚙️ | Menu : Redimensionner / Paramètres |

---

## Paramètres

Cliquez sur **⚙️ → Paramètres** pour ouvrir l'onglet dédié.

### Général
- **Ouvrir les fenêtres et onglets précédents** : restaure la session
  précédente au démarrage
- **Page d'accueil** : Knack3 (défaut), URL personnalisée, ou page vide
- **Nouveaux onglets** : page d'accueil sélectionnée ou page vide

### Apparence
- Automatique (suit Windows), Clair, Sombre
- Un redémarrage est proposé pour appliquer le changement

### Langue
- Français (défaut), English
- Un redémarrage est proposé pour appliquer le changement

### Confidentialité (informatif)
- Téléchargements bloqués
- Permissions (caméra, micro, géoloc, notifs) bloquées
- Seuls http://, https:// et file:// autorisés

---

## Redimensionnement de la fenêtre Portrait

1. Cliquez **⚙️ → Redimensionner** : la fenêtre Portrait devient
   redimensionnable (contour orange)
2. Redimensionnez la fenêtre Portrait à votre convenance
3. Cliquez **✅** pour verrouiller et reprendre la synchronisation

---

## Bloqueur de publicités

Actif par défaut, sans configuration.
Bloque : Google Ads, DoubleClick, imasdk (YouTube pre-roll),
Google Analytics, pagead, pubads, securepubads.

---

## Synchronisation vidéo

DualView détecte les événements play/pause/seek dans Paysage
et les applique à Portrait avec correction de position (±3s).
Correction anti-dérive toutes les 5 secondes (tolérance ±5s).

Plateformes : YouTube, TikTok, Instagram, générique.

---

## Configuration OBS

Deux sources "Capture de fenêtre" :
- `DualView - Paysage` : vue Desktop (inclut la barre de contrôle)
- `DualView - Portrait` : vue Mobile

Les titres sont stables entre les changements d'onglets.

---

## Pour les contributeurs : builder l'installeur

**Prérequis** : Node.js >= 22 (https://nodejs.org)

Lancez **installer/build-installer.bat** depuis le dossier racine.
Le script produit **dist/DualView-Setup-0.2.5.exe** (~150 Mo).

Le fichier Setup inclut un désinstallateur natif Windows enregistré
dans Paramètres > Applications.