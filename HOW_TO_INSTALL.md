# DualView v0.2.3 - Instructions d'installation

## Nouveautes v0.2.3

- Fix synchronisation video : la 2eme video ne freeze plus dans la fenetre Portrait
  (reinitialisation des detecteurs video a chaque navigation)
- Nouvel installeur MSI (remplace install.bat / install.ps1)
  Un seul fichier DualView-Setup-0.2.3.exe gere tout :
  telechargement de Node.js si absent, build, installation, desinstallation.

## Nouveautes v0.2.2

- Fix bloqueur pub : couvre correctement les webviews (session persist:dualview)
- Fix boutons nav : etat back/forward lu depuis la webview, pas le BrowserWindow
- Bouton redimensionnement renomme en icone double-fleche

## Nouveautes v0.2.1

- Bloqueur de publicites integre (YouTube, Google Ads, trackers)
- Boutons navigation Precedent / Suivant dans la barre de controle

---

## Installation (utilisateurs)

### Ce dont vous avez besoin

- Windows 11 (Build 22000+)
- Connexion internet (pour telecharger Node.js si absent, ~30 Mo)

### Etape 1 - Lancer l'installation

Double-cliquez sur **DualView-Setup-0.2.3.exe**

Si Windows affiche "Editeur inconnu" -> cliquez **Plus d'informations** puis **Executer quand meme**.
Si Windows demande une elevation -> cliquez **Oui**.

L'installeur effectue automatiquement :
  1. Detection de Node.js ; telechargement et installation si absent
  2. Compilation de DualView (npm install + electron-builder)
  3. Installation des fichiers dans Program Files\DualView\
  4. Creation d'un raccourci dans le Menu Demarrer

Duree estimee : 5 a 15 minutes selon la connexion.

### Etape 2 - Lancer DualView

Cherchez **DualView** dans le Menu Demarrer.

---

## Desinstallation

**Parametres Windows -> Applications -> DualView -> Desinstaller**

L'installeur propose de supprimer ou conserver vos donnees :
- Onglets sauvegardes
- Positions des fenetres
- Preferences

Repond OUI pour tout supprimer, NON pour conserver.

---

## Fenetres

| Fenetre            | Description                              |
|--------------------|------------------------------------------|
| DualView - Controle | Barre d'adresse, onglets, navigation    |
| DualView - Paysage  | Vue Desktop 16:9                         |
| DualView - Portrait | Vue Mobile 9:16                          |

---

## Bloqueur de publicites

Actif par defaut, sans configuration.
Bloque : Google Ads, DoubleClick, imasdk (YouTube pre-roll),
         Google Analytics, pagead, pubads, securepubads.

Les fenetres Paysage et Portrait beneficient toutes deux du blocage.

---

## Boutons de navigation

Fleche gauche (Precedent) et fleche droite (Suivant) dans la barre.
Desactives automatiquement si aucune page precedente/suivante.
La navigation s'applique simultanement aux deux fenetres.

---

## Synchronisation video

Les deux fenetres chargent la page independamment.
DualView detecte les evenements play/pause/seek dans Paysage
et les applique a Portrait avec correction de position (+-3s).
Correction anti-derive toutes les 5 secondes (tolerance +-5s).

Fix v0.2.3 : la detection video est reinitialisee a chaque navigation,
ce qui resout le freeze de la fenetre Portrait lors du passage
d'une video a une autre.

Plateformes : YouTube, TikTok, Instagram, generique.

---

## Configuration OBS

Deux sources "Capture de fenetre" :
- "DualView - Paysage" : vue Desktop
- "DualView - Portrait" : vue Mobile

Les titres sont stables entre les changements d'onglets.

---

## Pour les contributeurs : builder l'installeur

Pour compiler et distribuer DualView, vous avez besoin de :
- Node.js >= 22 (https://nodejs.org)
- .NET SDK 6+ (https://dot.net/download)
- WiX Toolset v4 (installe automatiquement par le script)

Lancez **installer\build-installer.bat** depuis le dossier racine du projet.
Le script produit **dist\DualView-Setup-0.2.3.exe**.

Pour plus de details, voir ARCHITECTURE.md.
