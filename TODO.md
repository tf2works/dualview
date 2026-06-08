# DualView — TODO

> Améliorations et nouvelles fonctionnalités identifiées à partir de la v0.3.2.
> Classées par priorité. Cocher une case une fois l'item livré et reporté dans `CHANGELOG.md`.

---

## Priorité 1 — Expérience utilisateur quotidienne

- [x] **A. Préréglages de taille Portrait**
  Ajouter un sélecteur de device préconfiguré dans la toolbar (menu déroulant ou popup) :
  iPhone 15 (390×844), Pixel 8 (412×915), Galaxy S24 (360×780), iPad (768×1024).
  ✅ Livré en v0.4.0 — modale ⚙️ → Redimensionner.

- [x] **B. Capture instantanée (screenshot)**
  Bouton dans la toolbar pour capturer les deux vues simultanément en PNG.
  ✅ Livré en v0.4.0 — bouton 📷, dossier configurable dans Paramètres.

- [x] **C. Historique de navigation par onglet**
  Dropdown au survol (500 ms) des boutons ← → affichant les URLs de l'onglet actif.
  ✅ Livré en v0.4.0 — dropdown avec fermeture auto 500ms unfocus (v0.4.2).

---

## Priorité 2 — Fonctionnalités créateur / streamer

- [ ] **D. Export de configuration OBS (scènes prédéfinies)**
  Assistant dans Paramètres → OBS générant un fichier `.json` importable directement
  dans OBS avec les deux sources "Capture de fenêtre" (Paysage + Portrait) déjà
  configurées, nommées et positionnées.

- [ ] **E. Indicateur réseau dans la toolbar**
  Afficher le temps de chargement de la dernière navigation (via `did-finish-load` + timestamp)
  et un indicateur de latence. Utile en live pour diagnostiquer une page lente.

- [ ] **F. Mode Focus — masquer la toolbar**
  Raccourci clavier (`F11` ou `Ctrl+Shift+H`) pour masquer la toolbar et maximiser
  l'espace de capture OBS. La toolbar réapparaît au survol ou sur une nouvelle pression.

---

## Priorité 3 — Robustesse et écosystème open source

- [ ] **G. Support macOS / Linux**
  Electron supporte nativement les trois plateformes. Travail nécessaire :
  - Vérifier que `app.getPath('userData')` est utilisé partout (pas de chemins Windows codés en dur)
  - Remplacer `curl` dans le script Lua OBS par une solution cross-platform
  - Ajouter les targets `electron-builder` pour `.dmg` (macOS) et `.AppImage` (Linux)
  - Adapter `build-installer.bat` / `.ps1` ou créer des scripts équivalents

- [ ] **H. Export / Import de configuration**
  Bouton "Exporter ma config" (onglets, services, paramètres OBS) en JSON et
  "Importer" dans Paramètres → Général. Facilite les réinstallations et le partage
  de setup entre contributeurs.

- [ ] **I. Tests automatisés de base**
  Ajouter 3 à 5 tests Playwright vérifiant :
  - Ouverture des deux fenêtres
  - Synchronisation de navigation sur une URL de test
  - Pause / reprise de la sync
  Signal de qualité fort pour les contributeurs potentiels.

---

## Priorité 4 — Différenciation

- [ ] **J. Injection de CSS / JS personnalisé par domaine**
  Interface dans Paramètres permettant d'associer du CSS ou du JS à un domaine
  (ex. masquer un bandeau cookie sur `site.com`). Injecter via
  `webContents.insertCSS()` et `executeJavaScript()` au `did-finish-load`.
  _Référence : extension Stylus, Polypane._

- [ ] **K. Comparaison visuelle côte à côte (split diff)**
  Mode optionnel : capture périodique des deux vues, superposition avec une ligne
  de partage draggable pour comparer visuellement Desktop vs Mobile.
  Utile pour les tests de responsive design.

- [ ] **L. Pause automatique YouTube Shorts**
  Actuellement exclue (complexité de l'autoplay SPA YouTube Shorts).
  À retravailler quand YouTube stabilise son architecture Shorts.

---

## Structure open source

> ✅ v0.4.4 : Refactoring CSS/JS (landscape + portrait), restructuration src/, i18n portrait.


- [x] **CONTRIBUTING.md**
  Créer ce fichier (premier consulté par un contributeur potentiel) contenant :
  - Prérequis et lancement en mode dev (`npm start -- --dev`)
  - Convention de nommage des branches
  - Processus de Pull Request

- [x] **CHANGELOG.md**
  Créer un changelog structuré au format [Keep a Changelog](https://keepachangelog.com)
  en reprenant les sections des versions existantes.
  Indexé par GitHub, facilite le suivi des versions pour les utilisateurs.

- [x] **GitHub Actions — build automatique**
  Créer `.github/workflows/build.yml` pour :
  - Lancer le build sur chaque tag `v*`
  - Publier le `.exe` (et à terme `.dmg` / `.AppImage`) en GitHub Release automatiquement

---

## Légende priorités

| Symbole | Signification |
|---------|--------------|
| 🔴 | Bloquant / très demandé |
| 🟡 | Valeur ajoutée significative |
| 🟢 | Nice to have / différenciation |

_G (cross-platform) reste la priorité suivante pour le meilleur ratio impact / effort._

_CONTRIBUTING.md, CHANGELOG.md et GitHub Actions ✅ livrés en v0.4.4._