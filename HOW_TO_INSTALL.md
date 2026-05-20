# DualView v0.2.1 - Instructions d'installation

## Nouveautes v0.2.1

- Bloqueur de publicites integre (YouTube, Google Ads, trackers)
  La mention "Bloqueur pub actif" apparait dans la barre de statut.
- Boutons navigation Precedent / Suivant dans la barre de controle
  Les fleches se desactivent automatiquement si aucun historique.

## Nouveautes v0.2.0

- Synchronisation video play/pause (paysage -> portrait)
- Synchronisation de position toutes les 5 secondes
- Compatible YouTube, TikTok, Instagram, tout site avec balise video

---

## Installation

### Etape 1 - Lancer le build

Double-cliquez sur **install.bat**

Le script va compiler **DualView-Setup-0.2.1.exe** dans ce dossier.
Duree : 5 a 15 minutes selon la connexion.

Si Windows demande confirmation -> cliquez Oui / Executer.

### Etape 2 - Installer

Double-cliquez sur **DualView-Setup-0.2.1.exe**
Aucun raccourci Bureau n'est cree automatiquement.

### Etape 3 - Lancer

Cherchez DualView dans le Menu Demarrer.

---

## Fenetres

- DualView - Controle  : barre d'adresse + onglets + navigation
- DualView - Paysage   : vue Desktop 16:9
- DualView - Portrait  : vue Mobile 9:16

---

## Bloqueur de publicites

Actif par defaut des le lancement, sans configuration.
Bloque : Google Ads, DoubleClick, imasdk (YouTube pre-roll),
         Google Analytics, pagead, pubads, securepubads.

La fenetre Paysage et Portrait beneficient toutes deux du blocage
car il est applique au niveau de la session Electron entiere.

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

Plateformes : YouTube, TikTok, Instagram, generique.

---

## Configuration OBS

Deux sources "Capture de fenetre" :
- "DualView - Paysage" : vue Desktop
- "DualView - Portrait" : vue Mobile

Les titres sont stables entre les changements d'onglets.

---

## Desinstallation

Parametres Windows -> Applications -> DualView -> Desinstaller
