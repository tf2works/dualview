# DualView v0.2.5

Affichage simultané d'une page web en vue **Desktop (16:9)** et **Mobile (9:16)**
avec synchronisation en temps réel — optimisé pour la capture OBS.

---

## Installation

### Prérequis
- Windows 11 (Build 22000+)
- Connexion internet (pour télécharger Node.js si absent, ~30 Mo)

### Procédure
1. Double-cliquez sur **`DualView-Setup-0.2.5.exe`**
2. Si Windows affiche "Éditeur inconnu" → **Plus d'informations** puis **Exécuter quand même**
3. Acceptez l'élévation Administrateur si demandée
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
← → ⟳ 🏠 [url] ▶ [✅] ⚙️
```

| Bouton | Fonction |
|--------|----------|
| ← | Page précédente (les deux fenêtres) |
| → | Page suivante (les deux fenêtres) |
| ⟳ | Recharger (les deux fenêtres) |
| 🏠 | Page d'accueil |
| ▶ | Charger l'URL saisie |
| ✅ | Valider le redimensionnement Portrait (visible en mode resize) |
| ⚙️ | Menu : Redimensionner / Paramètres |

---

## Onglets

- **+** pour ajouter un onglet
- Cliquez sur un onglet pour le sélectionner
- **×** pour fermer un onglet (minimum 1 requis)
- Onglets et URLs sauvegardés automatiquement

---

## Synchronisation

### Scroll
Scrollez dans la fenêtre Paysage → Portrait suit en pourcentage.

### Vidéo
DualView détecte les événements play/pause/seek dans Paysage et les
applique à Portrait avec correction de dérive (±3s / ±5s).
Compatible YouTube, TikTok, Instagram, et tout site avec balise `<video>`.

---

## Redimensionnement Portrait

1. **⚙️ → Redimensionner** : Portrait devient redimensionnable (contour orange)
2. Redimensionnez la fenêtre Portrait
3. **✅** pour verrouiller et reprendre la synchronisation

---

## Paramètres

Cliquez sur **⚙️ → Paramètres** pour accéder aux options :

- **Général** : restauration des onglets au démarrage, page d'accueil, comportement des nouveaux onglets
- **Apparence** : Automatique / Clair / Sombre (redémarrage requis)
- **Langue** : Français / English (redémarrage requis)
- **Confidentialité** : aperçu des protections actives

---

## Sécurité

- Téléchargements bloqués (DualView est un outil de streaming)
- Permissions refusées : caméra, micro, géolocalisation, notifications
- Navigation limitée à `http://`, `https://` et `file://`
- Bloqueur de publicités intégré (Google Ads, DoubleClick, YouTube pre-roll…)

---

## Configuration OBS

1. Ajoutez une source **Capture de fenêtre**
2. Sélectionnez `DualView - Paysage` ou `DualView - Portrait`
3. Décochez "Capturer le curseur" si désiré

Les titres de fenêtres sont **stables** entre les changements d'onglets —
vos scènes OBS ne se cassent pas.

Pour Aitum VerticalCanvas, capturez `DualView - Portrait` dans une scène 9:16.

---

## Persistance des données

| Donnée | Emplacement |
|--------|-------------|
| Position / taille des fenêtres | `%APPDATA%\DualView\dualview-config.json` |
| Onglets & URLs | idem |
| Paramètres | idem |

---

## Désinstallation

**Paramètres Windows → Applications → DualView → Désinstaller**

Les données de configuration (`%APPDATA%\DualView\`) sont conservées.
Supprimez ce dossier manuellement pour tout effacer.

---

## Pour les contributeurs

**Prérequis** : Node.js >= 22 ([nodejs.org](https://nodejs.org))

```
installer/build-installer.bat
```

Produit `dist/DualView-Setup-0.2.5.exe` (~150 Mo).

---

## Stack technique

- **Electron 42** (Chromium 130+, Node.js 22)
- **IPC sécurisé** : `contextIsolation` + preload scripts
- **Persistance** : `fs` + JSON natif (pas de dépendance electron-store)
- **Installeur** : electron-builder NSIS (désinstallateur Windows natif inclus)

---

## Historique des versions

| Version | Notes |
|---------|-------|
| 0.1.0 | Version initiale. Navigation, onglets, scroll sync, thèmes. |
| 0.2.0 | Sync vidéo play/pause/seek. YouTube/TikTok/Instagram. |
| 0.2.1 | Bloqueur pub. Boutons nav ←/→. |
| 0.2.2 | Fix bloqueur pub. Fix nav back/forward. |
| 0.2.3 | Fix sync vidéo (2ème vidéo). |
| 0.2.4 | Contrôle intégré dans Paysage. Portrait taille fixe. Bouton ▶. |
| 0.2.5 | Sécurité. Paramètres. Menu ⚙️. Boutons ⟳ 🏠. i18n FR/EN. |