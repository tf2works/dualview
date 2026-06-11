# DualView — Guide de publication via GitHub Actions

Lorsqu'un tag `vX.X.X` est poussé sur GitHub, le workflow CI/CD génère automatiquement
les installateurs pour **Windows**, **macOS** et **Linux** et les publie dans une
GitHub Release.

---

## Prérequis (une seule fois)

Vérifier que les permissions du workflow sont correctement configurées :

**GitHub → Settings → Actions → General → Workflow permissions**
→ Sélectionner **"Read and write permissions"** → **Save**

---

## Étapes de publication

### 1. Vérifier que le tag n'existe pas déjà

```bash
git tag | grep vX.X.X          # remplacer X.X.X par votre numéro de version
```

Si la commande ne retourne rien, le tag est libre. Si elle retourne `vX.X.X`,
voir la section [Supprimer un tag existant](#supprimer-un-tag-existant) en bas de page.

---

### 2. Récupérer le dernier tag existant

```bash
git tag --sort=-version:refname | head -5
```

Affiche les 5 derniers tags dans l'ordre décroissant. Utile pour vérifier
le numéro de version précédent avant d'en créer un nouveau.

---

### 3. Créer le tag

Le format attendu est `vX.X.X` (ex. `v1.0.0`, `v1.2.0`, `v1.2.10`).

```bash
git tag -a vX.X.X -m "Titre personnalisé du tag"  # ex. : git tag -a v1.0.0 -m "Mon titre personnalisé"
```

L'option `-a` crée un **tag annoté** (recommandé) : il contient un auteur,
une date et un message — contrairement à un tag léger (`git tag vX.X.X`).
Le message `-m` apparaît dans l'interface GitHub et dans les Release notes.

> **Convention de nommage** : toujours préfixer avec `v` — le workflow
> se déclenche uniquement sur les tags correspondant au pattern `v*`.

---

### 4. Pousser le tag pour déclencher le build

```bash
git push origin vX.X.X                  # ex. : git push origin v1.0.0
```

Cela déclenche immédiatement le workflow GitHub Actions. Les 3 jobs de build
(Windows, macOS, Linux) démarrent en parallèle.

---

## Suivre l'avancement du build

1. Aller sur **github.com/\<org\>/dualview → onglet Actions**
2. Cliquer sur le workflow déclenché par le tag
3. Les 3 jobs s'exécutent en parallèle (~10 minutes) :

```
✅ Windows x64         ~8 min  → DualView Setup X.X.X.exe
✅ macOS (x64 + arm64) ~12 min → DualView-X.X.X.dmg + DualView-X.X.X-arm64.dmg
✅ Linux x64           ~6 min  → DualView-X.X.X.AppImage + dualview_X.X.X_amd64.deb
   └── GitHub Release          → démarre automatiquement après les 3 jobs
```

4. Une fois terminé, la Release est visible dans **github.com/\<org\>/dualview → onglet Releases**

---

## Supprimer un tag existant

Si le tag a déjà été créé par erreur (mauvais message, mauvaise version…) :

```bash
# Supprimer le tag en local
git tag -d vX.X.X                      # ex. : git tag -d v1.0.0

# Supprimer le tag sur GitHub
git push origin --delete vX.X.X        # ex. : git push origin :v1.0.0

# Recréer et repousser
git tag -a vX.X.X -m "DualView vX.X.X"  # ex. : git tag -a v1.0.0 -m "DualView v1.0.0"
git push origin vX.X.X                  # ex. : git push origin v1.0.0
```

> ⚠️ Si le workflow avait déjà démarré sur l'ancien tag, annulez-le manuellement
> dans **Actions** avant de repousser pour éviter deux Releases en doublon.

---

## Résolution des erreurs courantes

| Erreur | Cause | Solution |
|---|---|---|
| `403 Forbidden` sur la création de Release | Permissions du workflow insuffisantes | Activer **Read and write permissions** dans Settings → Actions |
| `Implicit publishing triggered by git tag` | electron-builder tente de publier lui-même | Vérifier que `--publish never` est présent dans `build.yml` |
| Job `release` skipped | Le tag ne correspond pas au pattern `v*` | Vérifier le format : `vX.X.X` et non `X.X.X` (le préfixe `v` est obligatoire) |
| Artefact manquant dans la Release | Un job de build a échoué | Consulter les logs du job en erreur dans l'onglet Actions |
| `tag already exists` | Tag local non synchronisé | Faire `git fetch --tags` avant de créer un nouveau tag |