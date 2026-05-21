#Requires -Version 5.0
# DualView v0.2.3 - Script de desinstallation
# Appele automatiquement par Windows lors de la desinstallation via
# Parametres > Applications > DualView > Desinstaller.
#
# Affiche une boite de dialogue pour demander si les donnees utilisateur
# doivent etre supprimees (%APPDATA%\DualView\).

param(
    [switch]$Silent = $false   # Passe en mode silencieux (conserve les donnees)
)

# Charger les assemblies WPF/WinForms pour la boite de dialogue
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.Windows.Forms

$APP_DATA_DIR = Join-Path $env:APPDATA "DualView"

# ── Boite de dialogue ─────────────────────────────────────────────────────────
function Show-UserDataDialog {
    # Detecter la langue Windows
    $lcid = [System.Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName

    if ($lcid -eq "fr") {
        $title   = "DualView - Desinstallation"
        $msg     = "Voulez-vous supprimer vos donnees de configuration ?`n`n" +
                   "  - Onglets sauvegardes`n" +
                   "  - Positions des fenetres`n" +
                   "  - Preferences`n`n" +
                   "Dossier : $APP_DATA_DIR`n`n" +
                   "Cliquez OUI pour supprimer, NON pour conserver."
        $btnYes  = "Supprimer les donnees"
        $btnNo   = "Conserver les donnees"
    } else {
        $title   = "DualView - Uninstall"
        $msg     = "Would you like to remove your configuration data?`n`n" +
                   "  - Saved tabs`n" +
                   "  - Window positions`n" +
                   "  - Preferences`n`n" +
                   "Folder: $APP_DATA_DIR`n`n" +
                   "Click YES to remove, NO to keep."
        $btnYes  = "Remove data"
        $btnNo   = "Keep data"
    }

    # Boite de dialogue native Windows
    $result = [System.Windows.Forms.MessageBox]::Show(
        $msg,
        $title,
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Question,
        [System.Windows.Forms.MessageBoxDefaultButton]::Button2  # NON par defaut
    )
    return $result -eq [System.Windows.Forms.DialogResult]::Yes
}

# ── Suppression des donnees ───────────────────────────────────────────────────
function Remove-UserData {
    if (Test-Path $APP_DATA_DIR) {
        try {
            Remove-Item -Path $APP_DATA_DIR -Recurse -Force -ErrorAction Stop
            Write-Host "[OK] Donnees utilisateur supprimees : $APP_DATA_DIR"
        } catch {
            Write-Warning "Impossible de supprimer $APP_DATA_DIR : $_"
        }
    } else {
        Write-Host "[INFO] Aucune donnee utilisateur trouvee."
    }
}

# ── Point d'entree ────────────────────────────────────────────────────────────
if (-not $Silent) {
    $removeData = Show-UserDataDialog
} else {
    $removeData = $false
}

if ($removeData) {
    Remove-UserData
} else {
    Write-Host "[INFO] Donnees utilisateur conservees."
}

exit 0
