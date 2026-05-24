# DualView v0.3.0

Affichage simultané d'une page web en vue **Desktop (16:9)** et **Mobile (9:16)**
avec synchronisation en temps réel — optimisé pour la capture OBS.

---

## Installation

### Prérequis
- Windows 11 (Build 22000+)
- Connexion internet (~30 Mo pour Node.js si absent)

### Procédure
1. Double-cliquez sur **`DualView-Setup-0.3.0.exe`**
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
← → ⟳ 🏠 [url] ▶ [✅] [● Sync] ⚙️
```

| Bouton | Fonction |
|--------|----------|
| ← → | Page précédente / suivante (les deux fenêtres) |
| ⟳ | Recharger (les deux fenêtres) |
| 🏠 | Page d'accueil |
| ▶ | Charger l'URL saisie |
| ✅ | Valider le redimensionnement Portrait |
| ● Sync | Contrôle synchronisation (Pause/Reprendre/Redémarrer) |
| ⚙️ | Menu : Redimensionner / Paramètres |

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

- Téléchargements bloqués
- Permissions refusées (caméra, micro, géoloc, notifications)
- Navigation limitée à `http://`, `https://`, `file://`
- Bloqueur pub intégré (Google Ads, DoubleClick, YouTube pre-roll)
- Exception : YouTube Shorts

---

## Configuration OBS

1. Source **Capture de fenêtre** → `DualView - Paysage` ou `DualView - Portrait`
2. Décochez "Capturer le curseur" si désiré

Les titres sont stables entre les changements d'onglets.

---

## Persistance

| Donnée | Emplacement |
|--------|-------------|
| Position / taille | `%APPDATA%\DualView\dualview-config.json` |
| Onglets & URLs | idem |
| Paramètres & Services | idem |
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

Produit `dist/DualView-Setup-0.3.0.exe` (~150 Mo).

---

## Stack technique

- **Electron 42** (Chromium 130+, Node.js 22)
- **IPC sécurisé** : `contextIsolation` + preload scripts
- **Anti-détection** : `preload-auth.js` (5 couches) + `AutomationControlled` flag
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