# DualView — Résumé du TODO (v0.7.1)

**Dernière version livrée :** v0.7.1  
**Date du résumé :** juin 2026  

---

## 📊 Vue d'ensemble — Statut global

| Priorité | Total | ✅ Livré | ⏳ En cours | Items restants |
|----------|-------|---------|-----------|----------------|
| **🔴 P0** — Bugs bloquants | 8 | **8** | 0 | **0** ✨ |
| **🟡 P1** — UX quotidienne | 4 | **4** | 0 | **0** ✨ |
| **🟡 P2** — Créateur/streamer | 2 | **1** | 0 | **1** en attente |
| **🟡 P2 bis** — UX v0.5.x | 4 | **4** | 0 | **0** ✨ |
| **🟡 P3** — Robustesse open source | 3 | **2** | 0 | **1** en attente |
| **🟢 P4** — Différenciation | 3 | **0** | 0 | **3** nice to have |
| **🟢 P5** — Navigateur supplémentaires | 5 | **5** | 0 | **0** ✨ |
| **Structure** | 3 | **3** | 0 | **0** ✨ |
| | | | | |
| **TOTAL** | **32 items** | **27** (84%) | **0** | **5** (16%) |

---

## 🔴 Priorité 0 — Bugs bloquants (V1.0.0)

**Status : 100% complété en v0.7.0** ✅

### Code vs Documentation
- ✅ Bloqueur de publicités : documenté comme "détecteur" (overlay + compte à rebours uniquement)
- ✅ README.md : synchronisé (11 services, sections dédupliquées)
- ✅ CONTRIBUTING.md : corrigé (`npm start` uniquement)
- ✅ detectServiceKeyFromUrl() : GitHub/GitLab ajoutés

### Fonctionnalités régressées
- ✅ Gestion crash/récupération webview : render-process-gone + page de récupération
- ✅ Affichage PDF : `plugins="true"` sur les webviews
- ✅ Mécanisme de mise à jour : bouton "Vérifier les mises à jour" (option minimale)
- ✅ Résidu #dev-btn : supprimé

---

## 🟡 Priorité 1 — Expérience utilisateur quotidienne

**Status : 100% complété** ✅

- ✅ A. Préréglages de taille Portrait (v0.4.0)
- ✅ B. Capture instantanée PNG (v0.4.0)
- ✅ C. Historique de navigation dropdown (v0.4.0)
- ✅ M. Groupes d'onglets, épinglés, favicons (v0.6.0)

---

## 🟡 Priorité 2 — Fonctionnalités créateur / streamer

**Status : 50% complété** (1/2)

- ⏳ **D. Export de configuration OBS** — En attente (format JSON incompatible, v0.5.0)
- ✅ F. Mode Focus (masquer toolbar) (v0.5.0)

---

## 🟡 Priorité 2 bis — Expérience utilisateur (v0.5.x)

**Status : 100% complété** ✅

- ✅ Section Raccourcis clavier (v0.5.1)
- ✅ Correctifs topsites (v0.5.1)
- ✅ Top 10 domaines (v0.5.0)
- ✅ Fusion Apparence+Langue (v0.5.0)
- ✅ Réouverture fenêtre portrait (v0.5.0)

---

## 🟡 Priorité 3 — Robustesse et écosystème open source

**Status : 67% complété** (2/3)

- ✅ G. Support macOS/Linux cross-platform (v0.4.5+)
- ✅ H. Export/Import de configuration (v0.5.2)
- ⏳ **I. Tests automatisés (Playwright)** — Toujours en attente (CI/build.yml sans tests)

---

## 🟢 Priorité 4 — Différenciation

**Status : 0% — Nice to have post-1.0.0** 

- [ ] J. Injection CSS/JS personnalisé par domaine (type Stylus)
- [ ] K. Comparaison visuelle côte à côte (split diff responsive design)
- [ ] L. Pause automatique YouTube Shorts (TBD — SPA YouTube instable)

---

## 🟢 Priorité 5 — Fonctionnalités navigateur supplémentaires

**Status : 100% complété en v0.7.1** ✅

Ajouté en juin 2026 pour combler les écarts avec un navigateur classique.

- ✅ **Recherche dans la page (`Ctrl+F`)** (v0.7.1)
  - Barre inline (top-right de la zone webview) avec counter "X de Y"
  - API `findInPage()` + navigation ↑↓ + Escape pour fermer
  
- ✅ **Zoom de page (`Ctrl+`/`Ctrl-`/`Ctrl+0`)** (v0.7.1)
  - Persistance par domaine via `localStorage`
  - Toast temporaire d'affichage du niveau (ex. "Zoom : 110%")
  - Restauration automatique à chaque navigation sur le domaine
  
- ✅ **Affichage PDF natif** (v0.7.0)
  - Infrastructure en place : `plugins="true"` sur les webviews
  - PDF affichés directement dans la webview (lecteur Chromium natif)
  
- ✅ **Téléchargements configurables** (v0.7.1)
  - Case à cocher dans Paramètres → Confidentialité
  - Dossier de destination configurable (défaut : Téléchargements OS)
  - Mini-gestionnaire : panneau ⬇️ dans le menu ⚙️, liste, ouvrir dossier/fichier, effacer
  
- ✅ **Indicateur de chargement** (v0.7.1)
  - Barre de progression linéaire 3 px en haut de la zone webview
  - Theme-aware (couleur `--accent`)
  - Fade-out 0.5s à la fin du chargement

---

## 📈 Graphique d'avancement

```
Version 1.0.0 (objectif)
├─ Priorité 0 (Bugs bloquants)       ████████████████████ 100% ✅
├─ Priorité 1 (UX quotidienne)       ████████████████████ 100% ✅
├─ Priorité 2 (Créateur)             ██████████░░░░░░░░░░  50%
└─ Priorité 3 (Robustesse)           ██████████████░░░░░░  67%

Version 1.0.0 + (Post-launch)
├─ Priorité 4 (Différenciation)      ░░░░░░░░░░░░░░░░░░░░   0%
└─ Priorité 5 (Navigateur)           ████████████████████ 100% ✅

Structure Open Source                 ████████████████████ 100% ✅
```

---

## 🎯 Prochaines étapes recommandées (post-v0.7.1)

### Court terme (v1.0.0)
1. **P2-D : Export OBS** — Réessayer le format JSON (format actuel incompatible depuis v0.5.0)
2. **P3-I : Tests Playwright** — Ajouter 3-5 tests de régression au build.yml (valeur signal)
3. **Stabilisation v1.0.0** — Validation terrain des fonctionnalités P5 livrées en v0.7.1

### Moyen terme (v1.2.0+)
1. **P4-J : Injection CSS/JS** — Architecture type Stylus (répondre à l'absence d'extensions)
2. **P4-K : Split diff** — Outil unique pour responsive design testing

### Long terme (v2.0.0)
1. **P4-L : YouTube Shorts** — À revoir si YouTube stabilise son architecture
2. **P4 items** — Intégration complète comme outil pro d'une alternative à Polypane

---

## 📝 Notes importantes

### Raison du découpage Priorité 0 / 1 / 2 / 5

Le **Priorité 0** a été ajouté rétrospectivement (v0.7.0) pour catégoriser les **bugs critiques découverts lors de l'audit du code** :
- Écarts majeurs doc ↔ code (bloqueur pub)
- Régressions fonctionnelles (crash webview, PDF)
- Documentation obsolète (--dev, services)

Tous ont été corrigés en v0.7.0 pour atteindre une base solide avant la v1.0.0 grand public.

### Priorité 5 = Nouveau backlog navigateur (juin 2026)

Créé pour **compléter progressivement les fonctionnalités de navigateur classique** sans repousser la v1.0.0. À cet stade, l'app est un **navigateur dual restreint hautement optimisé pour la diffusion OBS**, pas un Chrome replacement — ce qui est voulu.

---

## 🔗 Fichiers documentaires liés

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Architecture technique détaillée (v0.6.2)
- [`CHANGELOG.md`](./CHANGELOG.md) — Historique des versions au format Keep a Changelog
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Guide pour contributeurs (v0.7.0)
- [`README.md`](./README.md) — Documentation utilisateur (v0.7.0, 11 services)
- [`VERSION_HISTORY.md`](./VERSION_HISTORY.md) — Détail des changements par version

---

**Généré automatiquement — à jour avec `/TODO.md` v0.7.1**