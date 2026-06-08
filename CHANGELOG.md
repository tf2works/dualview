# Changelog DualView

Toutes les modifications notables sont documentées dans ce fichier.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)
Versionnage : [Semantic Versioning](https://semver.org/lang/fr/)

---

## [0.4.4] — 2025

### Ajouté
- `CONTRIBUTING.md` : guide complet pour les contributeurs (prérequis, structure, nommage branches, PR, points de vigilance)
- `CHANGELOG.md` : ce fichier, au format Keep a Changelog
- `.github/workflows/build.yml` : GitHub Actions — build automatique sur chaque tag `v*` et publication GitHub Release
- `src/renderer/css/landscape.css` : styles landscape externalisés (1 799 lignes)
- `src/renderer/css/portrait.css` : styles portrait externalisés (363 lignes)
- `src/renderer/js/landscape-i18n.js` : traductions FR/EN landscape + `t()` + `applyTranslations()`
- `src/renderer/js/landscape-webview.js` : scripts injectés dans les webviews landscape
- `src/renderer/js/landscape-ui.js` : état global, sync, thème, toast, nav, redimensionnement
- `src/renderer/js/landscape-views.js` : pool de webviews + popup login
- `src/renderer/js/landscape-tabs.js` : onglets, URL, omnibar, screenshot
- `src/renderer/js/landscape-settings.js` : paramètres, services, historique, raccourcis clavier
- `src/renderer/js/landscape-pollers.js` : polling pub/vidéo/scroll + initialisation
- `src/renderer/js/portrait-i18n.js` : traductions FR/EN portrait + `tp()` + `applyPortraitTranslations()`
- `src/renderer/js/portrait-app.js` : logique portrait (pool webviews, IPC handlers, remute, init)
- `src/renderer/js/portrait-webview.js` : scripts injectés dans les webviews portrait (`VIDEO_EXECUTOR_SCRIPT`, `AUTO_PAUSE_SCRIPT`)
- i18n portrait (option B) : attributs `data-i18n` sur tous les textes statiques des overlays portrait
- Indicateur sync portrait traduit dynamiquement (`● Sync active` / `⏸ Sync pausée`) via `tp()`
- Compte à rebours pub portrait traduit dynamiquement selon la langue active
- Écoute IPC `language-changed` dans portrait : mise à jour en temps réel sans redémarrage

### Modifié
- `landscape.html` : 4 441 → 419 lignes (−91%) — HTML squelette uniquement, `<link>` CSS + 7 `<script src>`
- `portrait.html` : 996 → 63 lignes (−94%) — HTML squelette avec `data-i18n` + 3 `<script src>`
- `src/main.js` : chemins mis à jour vers `core/`, `preload/`, `renderer/`
- `src/core/auth-window.js` : chemin preload-auth → `../preload/`, chemin assets → `../../assets/`

### Structure
- Réorganisation de `src/` en sous-dossiers : `core/` (logique Node.js), `preload/` (ponts IPC), `renderer/` (UI)
- `renderer/css/` et `renderer/js/` pour les ressources externalisées

---

## [0.4.3] — 2025

### Corrigé
- **Boucle vidéo YouTube** : la vidéo portrait ne tourne plus en boucle sur les premières secondes au lancement, après une pause, ou après repositionnement de la timeline
- Double `MutationObserver` par webview : remplacé par un observer unique (flag `__dualviewObserverActive`)
- `load-url` : vérification que l'URL change réellement avant de réassigner `src`
- Commandes en attente expirées : `pendingCmd` avec TTL 5 s — les commandes obsolètes n'affectent plus la mauvaise vidéo

### Modifié
- Protocole de sync vidéo refactorisé en commandes atomiques séquencées :
  - Pause : ① `pause()` → ② `seek-to(t)` après 50 ms
  - Lecture : ① `seek-to(t)` → ② `play()` après 100 ms
  - `play()` ne force plus `currentTime` → plus de boucle `seeked → play`
- `drift-check` conditionnel : correction périodique uniquement si portrait est à l'arrêt ET écart > 2 s
- `video-timeupdate` remplacé par `video-drift-check` (polling 5 s, envoyé seulement si lecture en cours)
- `sync-resume-state` : ré-injection de l'executor sans rechargement (scénario B)

---

## [0.4.2] — 2025

### Ajouté
- **Pause automatique YouTube** : vidéos classiques pausées au chargement dans les deux fenêtres (option désactivable dans Paramètres → Général)
- **Overlay pub portrait** : message "Publicité en cours" + compte à rebours pendant les pubs YouTube
- **Bouton remute** : bouton rouge en bas à droite de portrait si la vidéo a été démutée accidentellement (polling 2 s)
- **Paramètre `autoMutePortrait`** : force `video.muted = true` dans portrait, configurable dans Paramètres → Général

### Modifié
- Bloqueur de publicités renforcé à 3 niveaux : réseau (50+ domaines), CSS cosmétique, stub SDK IMA
- Sync vidéo : réalignement exact de la timeline portrait à chaque play
- Dropdown historique ← → : fermeture automatique 500 ms après que la souris quitte la zone

---

## [0.4.1] — 2025

### Ajouté
- **Raccourcis clavier** : `Alt+←/→` (nav), `F5`/`Ctrl+R` (recharge), `Ctrl+T/W` (onglets), `Ctrl+Tab`, `Ctrl+L`/`F6` (barre d'adresse)
- **Boutons souris** Retour/Avance (boutons latéraux 3 et 4)
- **Liens `target="_blank"`** → nouvel onglet DualView (au lieu d'une fenêtre système)
- **Menu contextuel** clic droit : lien, image, texte, page. Option "Enregistrer l'image sous…" (seule exception aux téléchargements bloqués)

---

## [0.4.0] — 2025

### Ajouté
- **Redimensionnement Portrait repensé** : modale ⚙️ → Redimensionner avec préréglages (iPhone 15, Pixel 8, Galaxy S24, iPad) + taille libre (contour orange). Le bouton ✅ de toolbar est supprimé.
- **Capture instantanée** 📷 : PNG horodaté des deux vues simultanément, dossier configurable dans Paramètres → Général
- **Omnibar** : sélection auto au clic, Échap annule, suggestions (historique, domaine, recherche), navigation clavier ↑↓
- **Moteur de recherche configurable** : DuckDuckGo par défaut ; Google, Bing, Brave, Qwant prédéfinis ; moteurs personnalisés (nom + URL template)
- **Historique de navigation persistant** : panneau latéral groupé par date, recherche fulltext, suppression individuelle/globale. Max 5 000 entrées (`history.json`)
- **Dropdown ← →** : historique de navigation de l'onglet actif au survol, fermeture auto

---

## [0.3.2] — 2025

### Ajouté
- **Intégration OBS** : serveur local HTTP+WebSocket (`127.0.0.1`, protégé par token)
- **Dock OBS** : panneau de navigateur personnalisé avec contrôle sync, URL, onglets en temps réel
- **Script Lua hotkeys** : vrais raccourcis natifs OBS (pause/reprise/redémarrage sync, navigation, onglets)
- `obs-integration/OBS_INTEGRATION.md` : guide complet de configuration

---

## [0.3.1] — 2025

### Corrigé
- Fix cookies portrait (partition partagée)
- Fix `ERR_ABORTED` sur webviews après handler `onBeforeSendHeaders` en double
- Fix sync vidéo YouTube (timing)
- Fix pub sur la première vidéo chargée
- Auth Microsoft plus robuste

### Ajouté
- Overlay paramètres dans portrait (page grisée pendant la configuration)
- Mode debug `--dev` : bouton 🔧 DevTools webview + F12 DevTools renderer

---

## [0.3.0] — 2025

### Ajouté
- **Services connectés** : 9 services pré-configurés (Google, Microsoft, Instagram, Facebook, Twitch, TikTok, X/Twitter, Discord, Steam) + URL personnalisée
- **Fenêtre d'authentification dédiée** : anti-détection Electron 5 couches (preload-auth.js), compatibilité Windows Hello / FIDO2
- **Démarrage sync différé** : synchronisation activée 3 s après ouverture
- **Bouton ● Sync** : Pause / Reprendre / Redémarrer dans la toolbar
- **Détection pages de connexion** : popup landscape + overlay portrait
- YouTube Shorts : exemptés du bloqueur de publicités

---

## [0.2.6] — 2025

### Ajouté
- **Pool de webviews** : switch d'onglet sans rechargement, état préservé en mémoire

---

## [0.2.5] — 2025

### Ajouté
- Sécurité : permissions bloquées (caméra, micro, géoloc, notifications)
- Panneau Paramètres : apparence, langue (FR/EN), page d'accueil
- Menu ⚙️ dans la toolbar
- i18n FR/EN (landscape)

---

## [0.2.4] — 2025

### Modifié
- Contrôle intégré dans la fenêtre Paysage (plus de fenêtre séparée)
- Portrait taille fixe (non redimensionnable par défaut)

---

## [0.2.3] — 2025

### Corrigé
- Fix sync vidéo

---

## [0.2.2] — 2025

### Corrigé
- Fix bloqueur de publicités
- Fix navigation back/forward

---

## [0.2.1] — 2025

### Ajouté
- Bloqueur de publicités (liste de domaines)
- Boutons de navigation ← →

---

## [0.2.0] — 2025

### Ajouté
- Synchronisation vidéo (play/pause/seek)
- Support YouTube, TikTok, Instagram

---

## [0.1.0] — 2025

### Ajouté
- Version initiale
- Navigation synchronisée paysage/portrait
- Onglets multiples
- Synchronisation scroll (pourcentage)
- Thèmes clair/sombre
