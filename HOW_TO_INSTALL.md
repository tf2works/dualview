# DualView v0.1.0 - Instructions d'installation

## Contenu du dossier

```
dualview/
+-- HOW_TO_INSTALL.md   <- Vous lisez ce fichier
+-- install.bat         <- Lanceur (double-clic pour demarrer)
+-- install.ps1         <- Script de build PowerShell
+-- package.json        <- Configuration de l'application
+-- src/                <- Code source
+-- assets/             <- Ressources
```

---

## Etape 1 - Lancer le build

Double-cliquez sur **install.bat**

Une fenetre PowerShell s'ouvre en mode Administrateur et :
- Verifie que vous etes sur Windows 11
- Installe Node.js v22 automatiquement si absent
- Installe les dependances du projet
- Compile **DualView-Setup-0.1.0.exe** dans ce meme dossier

Duree estimee : 5 a 15 minutes selon votre connexion internet.

Note : Windows peut afficher un avertissement de securite
"Voulez-vous executer ce script ?" - cliquez Oui / Executer une fois.

---

## Etape 2 - Installer l'application

Une fois le build termine, double-cliquez sur :

**DualView-Setup-0.1.0.exe**

L'installateur vous guide. Il vous demande :
- Le dossier d'installation (par defaut : Program Files)
- Si vous voulez un raccourci dans le Menu Demarrer

Aucun raccourci Bureau n'est cree automatiquement.

---

## Etape 3 - Lancer DualView

Cherchez **DualView** dans le Menu Demarrer.

Au lancement, trois fenetres apparaissent :
- DualView - Controle  : barre d'adresse + onglets
- DualView - Paysage   : vue Desktop 16:9
- DualView - Portrait  : vue Mobile 9:16

---

## Utilisation rapide

1. Saisissez une URL dans la barre d'adresse (fenetre Controle)
2. Appuyez sur Entree ou cliquez Charger
3. Les deux fenetres chargent la page simultanement
4. Scrollez dans la fenetre Paysage -> Portrait suit automatiquement

---

## Configuration OBS

Dans OBS, ajoutez deux sources "Capture de fenetre" :
- Selectionnez "DualView - Paysage" pour la vue Desktop
- Selectionnez "DualView - Portrait" pour la vue Mobile

Les titres de fenetres sont stables : changer d'onglet ne les modifie pas.

---

## Problemes connus

Le script s'arrete avec une erreur de connexion
  -> Verifiez votre connexion internet et relancez install.bat

"Execution de scripts desactivee"
  -> Clic droit sur install.ps1 -> Executer avec PowerShell

L'antivirus bloque le .exe genere
  -> Ajoutez une exception pour le dossier de build (comportement normal
     pour les executables Electron non signes par un certificat)

---

## Desinstallation

Parametres Windows -> Applications -> DualView -> Desinstaller
