# DualView v0.1.0

Affichage simultané d'une page web en vue **Desktop (16:9)** et **Mobile (9:16)** avec synchronisation en temps réel — optimisé pour la capture OBS.

---

## Installation

### Prérequis
- Windows 11 (Build 22000+)
- Connexion internet (pour télécharger Node.js si absent)

### Procédure
1. Décompressez l'archive `DualView-0.1.0.zip`
2. Double-cliquez sur **`install.bat`**
3. Acceptez l'élévation en mode Administrateur
4. Attendez la fin de l'installation (~2-5 min)
5. Un raccourci **DualView** apparaît sur le Bureau

> Le script vérifie automatiquement la sécurité des packages npm et applique les correctifs disponibles.

---

## Utilisation

### Fenêtres

| Fenêtre | Titre OBS | Description |
|---------|-----------|-------------|
| Contrôle | — | Barre d'adresse + onglets + boutons |
| Paysage | `DualView - Paysage` | Vue Desktop 16:9 |
| Portrait | `DualView - Portrait` | Vue Mobile 9:16 |

### Navigation
1. Saisissez une URL dans la barre d'adresse (fenêtre Contrôle)
2. Cliquez **Charger ▶** ou appuyez sur **Entrée**
3. Les deux fenêtres chargent simultanément la page

### Onglets
- Cliquez **+** pour ajouter un onglet
- Cliquez sur un onglet pour changer l'URL affichée
- Cliquez **×** pour fermer un onglet (minimum 1 requis)
- Les onglets et URLs sont sauvegardés automatiquement

### Synchronisation du scroll
- Scrollez dans la fenêtre **Paysage** → la fenêtre Portrait suit automatiquement
- La synchronisation est en **pourcentage** : même position relative dans la page

### Redimensionnement de la fenêtre Portrait
1. Cliquez **↔ Redimensionner** dans la fenêtre Contrôle
2. La synchronisation se met en **pause** (indicateur orange)
3. Redimensionnez la fenêtre Portrait à votre convenance
4. Cliquez **✓ Valider** pour reprendre la synchronisation
5. Les nouvelles dimensions sont sauvegardées

### Thème
- S'adapte automatiquement au thème Windows (Clair / Sombre)
- Aucune configuration requise

---

## Configuration OBS

### Capture de la fenêtre Paysage
1. Dans OBS, ajoutez une source **Capture de fenêtre**
2. Sélectionnez `DualView - Paysage`
3. Décochez "Capturer le curseur" si désiré

### Capture de la fenêtre Portrait
1. Dans OBS, ajoutez une source **Capture de fenêtre**
2. Sélectionnez `DualView - Portrait`
3. Décochez "Capturer le curseur" si désiré

### Intégration Aitum VerticalCanvas
- La fenêtre Portrait (`DualView - Portrait`) est conçue pour être capturée dans une scène VerticalCanvas 9:16
- Les titres de fenêtres sont **stables** : changer d'onglet ne modifie pas le titre → vos scènes OBS ne cassent pas

---

## Persistence des données

Les données suivantes sont sauvegardées automatiquement :

| Donnée | Emplacement |
|--------|-------------|
| Dimensions fenêtres | `%APPDATA%\dualview-config\config.json` |
| Positions fenêtres | idem |
| Onglets & URLs | idem |

---

## Gestion des versions

| Version | Date | Notes |
|---------|------|-------|
| 0.1.0 | 2026 | Version initiale |

---

## Désinstallation

1. Supprimez le dossier `%LOCALAPPDATA%\DualView`
2. Supprimez les raccourcis Bureau et Menu Démarrer
3. (Optionnel) Supprimez `%APPDATA%\dualview-config`

---

## Stack technique

- **Electron 42** (Chromium 148, Node.js 24)
- **electron-store** : persistance des configurations
- **IPC sécurisé** : contextIsolation + preload scripts
- Pas de mode développeur Windows requis
