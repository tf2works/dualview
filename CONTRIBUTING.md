# Contribuer à DualView

Merci de l'intérêt que vous portez au projet ! Ce guide vous permet de
démarrer rapidement, que vous souhaitiez corriger un bug, ajouter une
fonctionnalité ou améliorer la documentation.

---

## Prérequis

| Outil | Version minimale | Lien |
|-------|-----------------|------|
| Node.js | 22 | https://nodejs.org |
| npm | 10 (fourni avec Node.js 22) | — |
| Git | — | https://git-scm.com |
| Windows | 11 Build 22000+ | (pour le build NSIS) |

> Le build de vérification (`npm start`) fonctionne sur Windows, macOS et Linux.
> La production des installeurs natifs nécessite l'OS correspondant
> (ou GitHub Actions — voir `.github/workflows/build.yml`).

---

## Installation du dépôt

```bash
git clone https://github.com/<org>/dualview.git
cd dualview
npm install
```

---

## Lancer l'application

```bash
# Mode normal
npm start

# Mode développement (DevTools activés, bouton 🔧 dans la toolbar)
npm start -- --dev
```

En mode `--dev` :
- Un bouton **🔧** apparaît dans la toolbar → ouvre les DevTools de la webview active
- **F12** ouvre les DevTools de la fenêtre landscape (renderer)
- Les logs `logger.log(...)` sont affichés dans la console

---

## Structure du code source

```
src/
├── main.js                    Processus principal Electron (IPC, fenêtres, session)
├── core/
│   ├── auth-window.js         Fenêtres d'authentification services connectés
│   ├── history-manager.js     Historique de navigation persistant
│   ├── logger.js              Système de logs conditionnel (--dev)
│   └── obs-control.js         Serveur HTTP+WebSocket OBS local
├── preload/
│   ├── preload-auth.js        Anti-détection Electron (fenêtres auth)
│   ├── preload-dev.js         DevTools en mode --dev
│   ├── preload-landscape.js   API IPC exposée au renderer landscape
│   └── preload-view.js        API IPC exposée au renderer portrait
└── renderer/
    ├── landscape.html          Fenêtre paysage (HTML squelette uniquement)
    ├── portrait.html           Fenêtre portrait (HTML squelette uniquement)
    ├── obs-dock.html           Panneau dock OBS
    ├── css/
    │   ├── landscape.css       Styles landscape (thèmes light/dark, composants)
    │   └── portrait.css        Styles portrait
    └── js/
        ├── landscape-i18n.js   Traductions FR/EN + t() + applyTranslations()
        ├── landscape-webview.js Scripts injectés dans les webviews landscape
        ├── landscape-ui.js     État, sync, thème, toast, nav, redimensionnement
        ├── landscape-views.js  Pool de webviews + popup login
        ├── landscape-tabs.js   Onglets, URL, omnibar, screenshot
        ├── landscape-settings.js Paramètres, services, historique, favoris, raccourcis (v0.5.1)
        ├── landscape-pollers.js  Polling pub/vidéo/scroll + initialisation
        ├── portrait-i18n.js    Traductions portrait + tp() + applyPortraitTranslations()
        ├── portrait-app.js     Logique portrait (pool, IPC handlers, remute)
        └── portrait-webview.js Scripts injectés dans les webviews portrait
```

**Règle importante** : les fichiers `renderer/js/` et `renderer/css/` sont
chargés via `<link>` / `<script src>` en `file://`. Il n'y a pas de bundler
(pas de Webpack, Vite, etc.). Les modifications sont effectives immédiatement
après redémarrage de l'application.

---

## Ajouter une traduction

Les traductions se trouvent dans deux fichiers :

- `src/renderer/js/landscape-i18n.js` — interface landscape (paramètres, toolbar, overlays)
- `src/renderer/js/portrait-i18n.js` — interface portrait (overlays, indicateur sync)

Pour ajouter une langue (exemple : allemand) :

1. Dupliquer le bloc `en: { ... }` dans les deux fichiers et le nommer `de`
2. Traduire toutes les valeurs
3. Dans `landscape.html`, ajouter `<option value="de">Deutsch</option>` dans le sélecteur de langue
4. Dans `landscape-i18n.js`, ajouter `langDe: 'Deutsch'` dans les deux blocs existants

---

## Nommage des branches

```
feat/nom-court        Nouvelle fonctionnalité
fix/description-bug   Correction de bug
refactor/quoi         Refactoring sans changement de comportement
docs/quoi             Documentation uniquement
chore/quoi            Maintenance (dépendances, CI, etc.)
```

Exemples : `feat/mode-focus-toolbar`, `fix/youtube-shorts-autopause`, `fix/topsites-pointer-events`, `docs/contributing-de`

---

## Processus de Pull Request

1. **Forkez** le dépôt et créez votre branche depuis `main`
2. **Développez** et testez en mode `--dev`
3. **Vérifiez** que les fonctionnalités existantes ne sont pas cassées :
   - Navigation et sync scroll entre les deux fenêtres
   - Sync vidéo YouTube (play / pause / seek)
   - Onglets multiples
   - Paramètres (langue, thème, services)
   - Top 10 domaines sur onglet vide : clics fonctionnels, persistance entre onglets
   - Section Raccourcis clavier : affichage correct dans les deux langues
4. **Commitez** avec un message clair en français ou en anglais :
   ```
   feat: ajout du mode focus toolbar (F11)
   fix: correction boucle seek YouTube Shorts
   ```
5. **Ouvrez une Pull Request** vers `main` en décrivant :
   - Le problème résolu ou la fonctionnalité ajoutée
   - Comment tester la modification
   - Captures d'écran si changement d'UI

---

## Construire l'installeur

```bash
# Windows
npm run build:win      # → dist/DualView-Setup-<version>.exe

# macOS  (nécessite assets/icon.icns)
npm run build:mac      # → dist/DualView-<version>.dmg

# Linux
npm run build:linux    # → dist/DualView-<version>.AppImage

# Toutes les plateformes (CI uniquement)
npm run build
```

> Le script `installer/build-installer.bat` reste disponible pour les contributeurs Windows
> qui préfèrent l'ancienne méthode.

**Icônes requises pour les builds non-Windows :**
- `assets/icon.icns` — macOS (à générer depuis `icon.ico` avec `iconutil` ou `png2icns`)
- `assets/icon.png` — Linux (512×512 px minimum)

---

## Points de vigilance

### Sécurité de session

Il ne doit exister qu'**un seul handler** `onBeforeSendHeaders` par session
Electron. En ajouter un second écrase le précédent et provoque des
`ERR_ABORTED` sur toutes les webviews. Voir `ARCHITECTURE.md` — section Sécurité.

### Synchronisation vidéo

Le protocole anti-boucle (v0.4.3) est documenté en détail dans
`ARCHITECTURE.md`. En résumé : portrait ne force jamais `currentTime` sur
une vidéo en lecture. Toute modification de la logique vidéo doit respecter
cette règle pour éviter les boucles seeked → play.

### Ordre de chargement des scripts portrait

```
portrait-i18n.js  →  portrait-app.js  →  portrait-webview.js
```

`portrait-webview.js` utilise `DRIFT_THRESHOLD` et `PENDING_CMD_TTL` via
interpolation de template string — ces constantes doivent être définies
(dans `portrait-app.js`) avant que `portrait-webview.js` soit parsé.

### ⛔ URL de la page d'accueil par défaut — règle non négociable

L'URL configurée comme page d'accueil par défaut **ne doit jamais être modifiée**
dans une contribution. Cette valeur est définie dans `src/main.js` et dans
`src/renderer/js/landscape-settings.js`.

Cette page d'accueil est la vitrine du projet : elle est vue par tous les
utilisateurs à chaque démarrage. La modifier sans autorisation explicite des
mainteneurs — même pour une URL neutre ou à des fins de test — est considérée
comme une manipulation non consentie de l'expérience utilisateur.

**Toute Pull Request modifiant cette valeur sans accord préalable sera fermée,
et son auteur pourra être banni du dépôt.**

Si vous souhaitez proposer un changement de page d'accueil par défaut, ouvrez
d'abord une **Issue** avec le label `discussion` pour en débattre avec les
mainteneurs.

---

## Questions ?

Ouvrez une **Issue** GitHub avec le label `question`.