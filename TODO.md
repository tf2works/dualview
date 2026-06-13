# DualView — TODO

> Améliorations et nouvelles fonctionnalités identifiées à partir de la v0.3.2.
> Classées par priorité. Cocher une case une fois l'item livré et reporté dans `CHANGELOG.md`.
> Dernière version livrée : **v0.5.1**.

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
  _(Tenté en v0.5.0 — le format JSON généré n'était pas compatible avec OBS. Reporté.)_

- [ ] **E. Indicateur réseau dans la toolbar**
  Afficher le temps de chargement de la dernière navigation (via `did-finish-load` + timestamp)
  et un indicateur de latence. Utile en live pour diagnostiquer une page lente.

- [x] **F. Mode Focus — masquer la toolbar**
  Raccourci clavier (`Ctrl+Shift+H` ou `F11`) pour masquer la toolbar et maximiser
  l'espace de capture OBS. La toolbar réapparaît au survol (bande 8 px) ou sur nouvelle pression.
  ✅ Livré en v0.5.0 — bande de détection + badge discret + toast.

---

## Priorité 2 bis — Expérience utilisateur (v0.5.1)

- [x] **Section Raccourcis clavier dans les Paramètres**
  Nouvelle entrée ⚓ dans la barre latérale des Paramètres. Trois tableaux (Navigation,
  Onglets, Interface) avec distinction Windows/Linux vs macOS. 18 clés i18n FR/EN.
  ✅ Livré en v0.5.1 — `landscape.html`, `landscape-i18n.js`, `landscape.css`.

- [x] **Correctifs topsites — clics et race condition**
  Clics sur les icônes du top 10 bloqués par la webview `about:blank` (`pointer-events`).
  Race condition `maybeShowTopSites()` causant la disparition du top 10 au 2e onglet vide.
  Manipulation `style.display` inline écrasant les règles CSS `pointer-events`.
  ✅ Livré en v0.5.1 — `landscape-views.js`, `landscape-tabs.js`, `landscape-ui.js`, `landscape.css`.

---

## Priorité 2 bis — Expérience utilisateur (v0.5.0)

- [x] **Top 10 domaines sur onglet vide**
  Quand "Nouveaux onglets" est réglé sur "Page vide", afficher les domaines les plus
  visités (historique toutes sessions, dédoublonné, max 10). Paysage + portrait.
  ✅ Livré en v0.5.0.

- [x] **Fusion Apparence + Langue dans Général**
  Déplacer les sections "Apparence" et "Langue" dans "Général" pour simplifier la
  navigation dans les paramètres (4 entrées au lieu de 6).
  ✅ Livré en v0.5.0.

- [x] **Réouverture fenêtre portrait**
  Bouton "Rouvrir le portrait" dans ⚙️, visible uniquement si la fenêtre portrait est
  fermée. Reconstruction complète du pool d'onglets au rouvrir.
  ✅ Livré en v0.5.0.

---

## Priorité 3 — Robustesse et écosystème open source

- [x] **G. Support macOS / Linux**
  Electron supporte nativement les trois plateformes. Travail nécessaire :
  - ✅ `app.getPath('userData')` utilisé partout — aucun chemin Windows en dur
  - ✅ Script Lua OBS rendu cross-platform (détection OS, curl natif macOS/Linux)
  - ✅ Cibles electron-builder ajoutées : `.dmg` (macOS x64+arm64), `.AppImage` + `.deb` (Linux)
  - ✅ `installer/build-installer.sh` créé (macOS + Linux)
  - ✅ GitHub Actions mis à jour : 3 jobs séparés (windows/macos/linux) + job release

- [x] **H. Export / Import de configuration**
  Bouton "Exporter ma config" (onglets, services, paramètres OBS) en JSON et
  "Importer" dans Paramètres → Général. Facilite les réinstallations et le partage
  de setup entre contributeurs.
  ✅ Livré en v0.5.2 — section Export/Import dans les Paramètres, export sélectif + import avec merge sélectif.

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