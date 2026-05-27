# DualView — Intégration OBS (v0.3.2)

Contrôlez DualView **sans quitter OBS** : un panneau de dock pour la souris,
des raccourcis clavier natifs pour le pilotage rapide.

L'intégration repose sur deux mécanismes complémentaires :

| | Méthode 1 — Dock | Méthode 3 — Hotkeys |
|---|---|---|
| Quoi | Panneau visuel dans OBS | Raccourcis clavier natifs OBS |
| Pour | Sync, URL, onglets à la souris | Pause/reprise, onglet, recharge au clavier |
| Mise en place | URL dans un dock navigateur | Script Lua à charger une fois |

> **À savoir.** OBS est lui-même un *serveur* WebSocket et ne se connecte jamais
> à une autre application. L'intégration n'utilise donc PAS le WebSocket d'OBS :
> c'est **DualView** qui héberge un petit serveur local (sur `127.0.0.1`), et OBS
> s'y connecte. Vous n'avez **rien à configurer** dans *Outils → Paramètres du
> serveur WebSocket* d'OBS.

---

## Étape 0 — Récupérer le port et le token

1. Lancez **DualView**.
2. Ouvrez **⚙️ → Paramètres → OBS**.
3. Notez les informations affichées :
   - **Port** (ex. `49231`)
   - **Token** (chaîne de sécurité)
   - **URL du dock** (déjà prête à copier, token inclus)

Le serveur démarre automatiquement avec DualView. Le port est choisi
automatiquement par défaut ; vous pouvez le fixer dans les paramètres si vous
préférez un port stable.

---

## Méthode 1 — Panneau de dock OBS

1. Dans OBS : **Affichage → Docks → Docks de navigateur personnalisés…**
   (selon la version : *Docks → Dock de navigateur personnalisé*).
2. Ajoutez une ligne :
   - **Nom du dock** : `DualView`
   - **URL** : collez l'**URL du dock** copiée à l'étape 0
     (de la forme `http://127.0.0.1:PORT/dock?token=...`).
3. Validez. Un panneau **DualView** apparaît dans OBS.
4. Placez-le où vous voulez (ancré à gauche, à droite, ou flottant).

Le dock affiche en temps réel :
- l'état de la **synchronisation** (active / en pause),
- l'**URL** en cours,
- la **liste des onglets** sur une seule ligne défilable horizontalement
  (favicon + titre, onglet actif surligné). Des boutons **◀ ▶** apparaissent
  quand les onglets débordent et s'adaptent au redimensionnement du dock ;
  la molette défile aussi la rangée.

> Les favicons sont récupérés via le service Google
> (`google.com/s2/favicons`). C'est le seul appel externe du dock ; en cas
> d'échec, une icône générique s'affiche à la place.

Et permet de :
- **⏸ Pause / ▶ Reprendre / ↺ Redémarrer** la synchronisation,
- **← → ⟳ 🏠** naviguer, saisir une **URL**,
- **+** ouvrir un onglet, **clic** pour changer d'onglet, **×** pour fermer.

> Si le dock affiche « DualView hors ligne », c'est que DualView est fermé ou que
> le serveur OBS est désactivé. Il se reconnecte automatiquement dès que DualView
> est relancé.

---

## Méthode 3 — Hotkeys natives OBS

1. Dans OBS : **Outils → Scripts**.
2. Onglet **Scripts** → bouton **+** → choisissez le fichier
   `dualview-obs-hotkeys.lua` (dossier `obs-integration/` de DualView).
3. Le script sélectionné, renseignez à droite :
   - **Port DualView** : le port de l'étape 0,
   - **Token DualView** : le token de l'étape 0.
4. Ouvrez **Fichier → Paramètres → Raccourcis clavier**.
5. Cherchez les entrées **« DualView : … »** et attribuez une touche à chacune :
   - DualView : Pause synchronisation
   - DualView : Reprendre synchronisation
   - DualView : Redémarrer synchronisation
   - DualView : Page précédente / suivante
   - DualView : Recharger
   - DualView : Page d'accueil
   - DualView : Nouvel onglet
   - DualView : Fermer l'onglet actif

Les raccourcis fonctionnent **même quand OBS n'a pas le focus** (comportement
standard des hotkeys OBS), ce qui permet de piloter DualView pendant le live.

> Le script utilise `curl`, présent d'origine sur Windows 10/11. Aucune
> installation supplémentaire n'est nécessaire.

---

## Désactiver l'intégration

Dans **⚙️ → Paramètres → OBS**, désactivez l'option. Le serveur local s'arrête
immédiatement. DualView fonctionne normalement sans OBS.

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Dock « hors ligne » | DualView fermé / OBS désactivé | Lancer DualView, vérifier Paramètres → OBS |
| Dock vide / 403 | Token absent dans l'URL | Recopier l'URL complète depuis Paramètres → OBS |
| Hotkeys sans effet | Port/Token non renseignés dans le script | Vérifier les propriétés du script |
| Port déjà utilisé | Conflit avec une autre app | Fixer un autre port dans Paramètres → OBS |

---

## Sécurité

- Le serveur écoute **uniquement** sur `127.0.0.1` (machine locale) — il n'est
  jamais accessible depuis le réseau.
- Chaque commande exige le **token** généré au démarrage.
- Seules des actions connues sont acceptées (liste blanche) ; toute autre
  requête est rejetée.
