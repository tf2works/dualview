# DualView v0.3.1 - Instructions d'installation

## Nouveautés v0.3.1

- **Démarrage sync différé** : la synchronisation démarre 3 secondes après l'ouverture
- **Contrôle de la synchronisation** : bouton dans la toolbar — ⏸ Pause / ▶ Reprendre / ↺ Redémarrer
- **Services connectés** : Google, Microsoft, Instagram, Facebook, Twitch, TikTok, X/Twitter, Discord, Steam + URL personnalisée
- **Anti-détection Electron** : connexion par clé d'accès (Windows Hello, FIDO2) et email/mot de passe fonctionnels via une fenêtre dédiée
- **Détection des pages de connexion** : popup dans landscape + overlay dans portrait avec bouton "Se connecter" direct
- **YouTube Shorts** : bloqueur de publicités désactivé sur les Shorts

## Problèmes connus v0.3.1

> Ces bugs sont identifiés et seront corrigés en v0.3.1.

| # | Symptôme | Contournement |
|---|----------|---------------|
| 1 | Après connexion Google/YouTube dans Services connectés, portrait affiche toujours l'utilisateur comme non connecté | Recharger manuellement l'onglet via ⟳ |
| 2 | Connexion Microsoft : la fenêtre auth ne se ferme pas automatiquement, le statut reste "Non connecté" | Fermer la fenêtre manuellement ; rouvrir les paramètres pour vérifier le statut |
| 3 | Navigation vers Outlook (et autres services Microsoft) : portrait affiche ERR_ABORTED au lieu de la page | Lié au BUG-2 ; sera corrigé avec la fermeture automatique Microsoft |

---

## Installation (utilisateurs)

### Prérequis
- Windows 11 (Build 22000+)
- Connexion internet

### Procédure
1. Double-cliquez sur **DualView-Setup-0.3.1.exe**
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

`← → ⟳ 🏠 [url] ▶ [✅] [● Sync] ⚙️`

| Bouton | Fonction |
|--------|----------|
| ← | Page précédente (les deux fenêtres) |
| → | Page suivante (les deux fenêtres) |
| ⟳ | Recharger (les deux fenêtres) |
| 🏠 | Page d'accueil |
| ▶ | Charger l'URL saisie |
| ✅ | Valider le redimensionnement Portrait |
| ● Sync | Contrôle de la synchronisation |
| ⚙️ | Menu : Redimensionner / Paramètres |

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

1. **⚙️ → Redimensionner** : contour orange, portrait redimensionnable
2. Redimensionnez à votre convenance
3. **✅** pour verrouiller et reprendre la synchronisation

---

## Configuration OBS

Deux sources "Capture de fenêtre" :
- `DualView - Paysage` : vue Desktop
- `DualView - Portrait` : vue Mobile

Les titres sont stables entre les changements d'onglets.

---

## Pour les contributeurs : builder l'installeur

**Prérequis** : Node.js >= 22 (https://nodejs.org)

Lancez **installer/build-installer.bat** depuis le dossier racine.
Produit **dist/DualView-Setup-0.3.1.exe** (~150 Mo).