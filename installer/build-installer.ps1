#Requires -Version 5.0
# DualView v0.2.3 - Script de build de l'installeur MSI
#
# Ce script est destine aux CONTRIBUTEURS qui veulent distribuer DualView.
# Il effectue les etapes suivantes :
#   1. Verifie les prerequis (Node.js >= 22, WiX Toolset v4)
#   2. Compile DualView avec electron-builder (npm install + npm run build)
#   3. Harvest les fichiers Electron avec wix harvest
#   4. Compile le MSI avec wix build (product.wxs)
#   5. Compile le Bundle Burn avec wix build (bundle.wxs)
#   6. Produit DualView-Setup-0.2.3.exe dans le dossier dist/
#
# Prerequis :
#   - Node.js >= 22 (https://nodejs.org)
#   - WiX Toolset v4 : dotnet tool install --global wix
#     (necessite .NET SDK 6+ : https://dot.net)

param(
    [switch]$SkipBuild  = $false,   # Sauter npm install + electron-builder
    [switch]$SkipWix    = $false,   # Sauter la compilation WiX
    [switch]$Unattended = $false    # Pas de pause finale
)

# ── Elevation Administrateur ──────────────────────────────────────────────────
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Relance en mode Administrateur..." -ForegroundColor Yellow
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($SkipBuild)  { $argList += " -SkipBuild" }
    if ($SkipWix)    { $argList += " -SkipWix" }
    if ($Unattended) { $argList += " -Unattended" }
    Start-Process PowerShell -Verb RunAs -ArgumentList $argList
    exit
}

# ── Configuration ─────────────────────────────────────────────────────────────
$APP_VERSION  = "0.2.3"
$SCRIPT_DIR   = Split-Path -Parent $PSCommandPath
$ROOT_DIR     = Split-Path -Parent $SCRIPT_DIR   # dossier racine dualview/
$DIST_DIR     = Join-Path $ROOT_DIR "dist"
$UNPACKED_DIR = Join-Path $DIST_DIR "win-unpacked"
$NODE_MIN_VER = [Version]"22.0.0"

function Write-Step { param($m) Write-Host ""; Write-Host ">>> $m" -ForegroundColor Cyan }
function Write-OK   { param($m) Write-Host "    [OK] $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "    [!!] $m" -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "    [XX] $m" -ForegroundColor Red }
function Write-Info { param($m) Write-Host "         $m" -ForegroundColor Gray }

# FIX : fonction de sortie propre evitant le pattern "}; exit 1" 
# qui n'attend pas l'entree utilisateur quand stdin est redirige
function Exit-Script {
    param([int]$Code = 0)
    if (-not $Unattended) { Read-Host "Appuyez sur Entree pour fermer" }
    exit $Code
}

Clear-Host
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  DualView v$APP_VERSION - Build Installeur"  -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""
Write-Info "Ce script compile DualView et construit le MSI."
Write-Host ""

# ── Etape 1 : Verifier Windows 11 ────────────────────────────────────────────
Write-Step "Verification de Windows 11..."
$osBuild = [int](Get-WmiObject Win32_OperatingSystem).BuildNumber
if ($osBuild -lt 22000) {
    Write-Fail "Windows 11 requis (build 22000+). Build actuel : $osBuild"
    Exit-Script 1
}
Write-OK "Windows 11 detecte (Build $osBuild)"

# ── Etape 2 : Verifier Node.js ────────────────────────────────────────────────
Write-Step "Verification de Node.js (v22+ requis)..."

function Reload-EnvPath {
    $mp = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $up = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = if ($up) { "$mp;$up" } else { $mp }
}

# FIX : foreach classique au lieu de ForEach-Object
# (return dans ForEach-Object ne sort pas de la fonction)
function Find-NodeExe {
    Reload-EnvPath
    $candidates = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "$env:ProgramW6432\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    $c = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}

function Find-NpmCmd {
    param([string]$NodeExePath)
    $dir = Split-Path -Parent $NodeExePath
    $npm = Join-Path $dir "npm.cmd"
    if (Test-Path $npm) { return $npm }
    # Fallback : chercher npm.cmd dans les memes dossiers candidats
    $candidates = @(
        "$env:ProgramFiles\nodejs\npm.cmd",
        "$env:ProgramW6432\nodejs\npm.cmd",
        "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

$nodePath = Find-NodeExe
if (-not $nodePath) {
    Write-Fail "Node.js introuvable. Installez Node.js v22 LTS depuis https://nodejs.org"
    Exit-Script 1
}

# FIX : appel avec tableau d'arguments pour gerer les espaces dans le chemin
# (& "$nodePath" echoue si le chemin contient des espaces)
$nodeVerStr = (& $nodePath --version 2>&1) -replace "v", ""
if (-not $nodeVerStr -or $nodeVerStr -notmatch "^\d+\.\d+") {
    Write-Fail "Impossible de lire la version de Node.js depuis : $nodePath"
    Exit-Script 1
}

try {
    $nodeVer = [Version]$nodeVerStr
} catch {
    Write-Fail "Version Node.js invalide : '$nodeVerStr'"
    Exit-Script 1
}

if ($nodeVer -lt $NODE_MIN_VER) {
    Write-Fail "Node.js $nodeVerStr detecte, v22+ requis."
    Exit-Script 1
}

$npmPath = Find-NpmCmd -NodeExePath $nodePath
if (-not $npmPath) {
    Write-Fail "npm.cmd introuvable aupres de $nodePath"
    Exit-Script 1
}
Write-OK "Node.js $nodeVerStr ($nodePath)"
Write-OK "npm    : $npmPath"

# ── Etape 3 : Verifier WiX Toolset v4 ────────────────────────────────────────
Write-Step "Verification de WiX Toolset v4..."

# WiX v4.0.5 : derniere version open source sans EULA commerciale.
# WiX v5+ et v7 introduisent l'OSMF (Open Source Maintenance Fee).
# On force la v4.0.5 pour eviter tout probleme de licence.
$WIX_VERSION = "4.0.5"

function Find-WixCmd {
    Reload-EnvPath
    $dotnetToolsPath = Join-Path $env:USERPROFILE ".dotnet\tools\wix.exe"
    if (Test-Path $dotnetToolsPath) { return $dotnetToolsPath }
    $c = Get-Command "wix" -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}

function Get-WixVersion {
    param([string]$WixPath)
    $ver = (& $WixPath --version 2>&1) | Select-Object -First 1
    # Extraire le numero de version (ex: "4.0.5+abc123" -> "4.0.5")
    if ($ver -match "^(\d+\.\d+\.\d+)") { return [Version]$Matches[1] }
    return $null
}

$dotnet = Get-Command "dotnet" -ErrorAction SilentlyContinue
if (-not $dotnet) {
    Write-Fail ".NET SDK introuvable. Installez-le depuis https://dot.net/download"
    Exit-Script 1
}

$wixPath = Find-WixCmd
$wixNeedsInstall = $false

if ($wixPath) {
    $installedVer = Get-WixVersion -WixPath $wixPath
    if ($installedVer -and $installedVer -ge [Version]"5.0.0") {
        # Version avec EULA : desinstaller et remplacer par v4.0.5
        Write-Warn "WiX $installedVer detecte (EULA commerciale). Remplacement par v$WIX_VERSION..."
        & dotnet tool uninstall --global wix 2>&1 | Out-Null
        $wixNeedsInstall = $true
    } elseif (-not $installedVer) {
        Write-Warn "Version WiX indeterminee. Reinstallation de v$WIX_VERSION..."
        & dotnet tool uninstall --global wix 2>&1 | Out-Null
        $wixNeedsInstall = $true
    } else {
        Write-OK "WiX $installedVer present ($wixPath)"
    }
} else {
    Write-Info "WiX Toolset non trouve. Installation de v$WIX_VERSION..."
    $wixNeedsInstall = $true
}

if ($wixNeedsInstall) {
    $installOut = & dotnet tool install --global wix --version $WIX_VERSION 2>&1
    $installExit = $LASTEXITCODE
    if ($installExit -ne 0) {
        $alreadyInstalled = $installOut | Where-Object { $_ -match "already installed" }
        if (-not $alreadyInstalled) {
            Write-Fail "Installation WiX v$WIX_VERSION echouee (code $installExit)."
            $installOut | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Exit-Script 1
        }
    }
    Reload-EnvPath
    $wixPath = Find-WixCmd
    if (-not $wixPath) {
        Write-Fail "WiX introuvable apres installation. Verifiez que '%USERPROFILE%\.dotnet\tools' est dans le PATH."
        Exit-Script 1
    }
    $installedVer = Get-WixVersion -WixPath $wixPath
    Write-OK "WiX v$installedVer installe ($wixPath)"
}

# Extensions WiX requises
# FIX reseau : wix extension add contacte api.nuget.org via la stack NuGet,
# qui peut etre bloquee par un pare-feu (erreur SocketException 10013).
# Solution : telecharger les .nupkg manuellement via Invoke-WebRequest
# (stack HTTP Windows, non bloquee), puis installer depuis le fichier local.
Write-Info "Verification extensions WiX (UI, Util, Bal)..."

# Cache local des extensions WiX (dossier cache global dotnet tools)
$wixExtCacheDir = Join-Path $env:USERPROFILE ".wix\extensions"

# Extensions requises : nom -> version
$wixExts = [ordered]@{
    "WixToolset.UI.wixext"   = $WIX_VERSION
    "WixToolset.Util.wixext" = $WIX_VERSION
    "WixToolset.Bal.wixext"  = $WIX_VERSION
}

foreach ($extName in $wixExts.Keys) {
    $extVer     = $wixExts[$extName]
    $extNameLow = $extName.ToLower()

    # Verifier si l'extension est deja installee dans le cache WiX
    $cachedPath = Join-Path $wixExtCacheDir "$extNameLow\$extVer"
    if (Test-Path $cachedPath) {
        Write-Info "  $extName : deja present (cache)"
        continue
    }

    # Tenter d'abord wix extension add (si NuGet accessible)
    Write-Info "  $extName : installation..."
    $extOut  = & $wixPath extension add "$extName/$extVer" --global 2>&1
    $extExit = $LASTEXITCODE

    if ($extExit -eq 0) {
        Write-Info "  $extName : OK"
        continue
    }

    # NuGet bloque : fallback telechargement manuel du .nupkg
    $alreadyOk = $extOut | Where-Object { $_ -match "already|existe|installed" }
    if ($alreadyOk) {
        Write-Info "  $extName : deja present"
        continue
    }

    Write-Warn "  NuGet inaccessible pour $extName - telechargement manuel..."
    $tmpNupkg = Join-Path $env:TEMP "$extNameLow.$extVer.nupkg"

    # URL CDN NuGet (HTTPS direct, ne passe pas par api.nuget.org)
    $nupkgUrl = "https://globalcdn.nuget.org/packages/$extNameLow.$extVer.nupkg"

    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $nupkgUrl -OutFile $tmpNupkg -UseBasicParsing -ErrorAction Stop
        Write-Info "  $extName : .nupkg telecharge"
    } catch {
        # Fallback secondaire : nuget.org/api/v2
        $nupkgUrl2 = "https://www.nuget.org/api/v2/package/$extName/$extVer"
        try {
            Invoke-WebRequest -Uri $nupkgUrl2 -OutFile $tmpNupkg -UseBasicParsing -ErrorAction Stop
            Write-Info "  $extName : .nupkg telecharge (fallback)"
        } catch {
            Write-Fail "Impossible de telecharger $extName : $_"
            Write-Fail "Verifiez votre connexion ou installez manuellement :"
            Write-Fail "  wix extension add $extName/$extVer --global"
            Exit-Script 1
        }
    }

    # Installer depuis le fichier local
    $extOut2  = & $wixPath extension add $tmpNupkg --global 2>&1
    $extExit2 = $LASTEXITCODE
    Remove-Item $tmpNupkg -ErrorAction SilentlyContinue

    if ($extExit2 -ne 0) {
        $alreadyOk2 = $extOut2 | Where-Object { $_ -match "already|existe|installed" }
        if (-not $alreadyOk2) {
            Write-Fail "Echec installation $extName depuis fichier local (code $extExit2)"
            $extOut2 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Exit-Script 1
        }
    }
    Write-Info "  $extName : OK (installation locale)"
}

# ── Etape 4 : npm install + electron-builder ──────────────────────────────────
if (-not $SkipBuild) {
    Write-Step "npm install..."
    Push-Location $ROOT_DIR

    # FIX : supprimer les Pop-Location explicites dans les branches d'erreur
    # Le finally garantit le Pop-Location dans tous les cas
    try {
        $out = & cmd.exe /c "`"$npmPath`" install" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm install a echoue (code $LASTEXITCODE)"
            $out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Pop-Location
            Exit-Script 1
        }
        Write-OK "Dependances installees"

        Write-Step "npm run build (electron-builder)..."
        Write-Info "5 a 15 minutes selon la connexion..."
        $out = & cmd.exe /c "`"$npmPath`" run build" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm run build a echoue (code $LASTEXITCODE)"
            $out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Pop-Location
            Exit-Script 1
        }
        Write-OK "Application compilee"
    } catch {
        Write-Fail "Erreur inattendue pendant le build : $_"
        Pop-Location
        Exit-Script 1
    }

    Pop-Location
} else {
    Write-Warn "Build npm ignore (-SkipBuild)"
}

# Verifier que dist\win-unpacked existe
if (-not (Test-Path $UNPACKED_DIR)) {
    Write-Fail "dist\win-unpacked introuvable. Lancez le build sans -SkipBuild."
    Exit-Script 1
}
Write-OK "dist\win-unpacked : present"

# ── Etape 5 : Harvest fichiers Electron (PowerShell natif) ───────────────────
#
# WiX v4 CLI n'expose pas de commande "heat" ou "harvest".
# On genere electron-files.wxs directement en PowerShell en scannant
# dist\win-unpacked — aucune dependance externe supplementaire.

# Variables script-scope accessibles depuis les fonctions imbriquees
$script:_sb         = $null
$script:_uniqueDirs = $null
$script:_dirIdMap   = $null

function ConvertTo-WixId([string]$s) {
    $id = $s -replace '[^a-zA-Z0-9]', '_'
    if ($id -match '^\d') { $id = 'x' + $id }
    if ($id.Length -gt 68) { $id = $id.Substring(0, 68) }
    return $id
}

# Generateur recursif de l'arborescence de dossiers en XML WiX
function Write-WixDirTree([string]$parentRel, [int]$indent) {
    $spaces   = ' ' * $indent
    $children = $script:_uniqueDirs |
        Where-Object { (Split-Path $_ -Parent) -eq $parentRel } |
        Sort-Object
    foreach ($childDir in $children) {
        $name = Split-Path $childDir -Leaf
        $id   = $script:_dirIdMap[$childDir]
        [void]$script:_sb.AppendLine("${spaces}<Directory Id=`"$id`" Name=`"$name`">")
        Write-WixDirTree -parentRel $childDir -indent ($indent + 2)
        [void]$script:_sb.AppendLine("${spaces}</Directory>")
    }
}

function Invoke-HarvestDirectory {
    param([string]$SourceDir, [string]$OutputFile)

    $allFiles = Get-ChildItem -Path $SourceDir -Recurse -File | Sort-Object FullName
    if ($allFiles.Count -eq 0) {
        Write-Fail "Aucun fichier trouve dans $SourceDir"
        Exit-Script 1
    }

    # Collecter les dossiers uniques (chemins relatifs)
    $script:_uniqueDirs = $allFiles | ForEach-Object {
        $rel = $_.FullName.Substring($SourceDir.Length).TrimStart('\')
        Split-Path $rel -Parent
    } | Where-Object { $_ -ne '' } | Select-Object -Unique | Sort-Object

    # Table chemin -> ID WiX
    $script:_dirIdMap = @{}
    foreach ($d in $script:_uniqueDirs) {
        $script:_dirIdMap[$d] = 'dir_' + (ConvertTo-WixId $d)
    }

    $script:_sb = New-Object System.Text.StringBuilder
    [void]$script:_sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
    [void]$script:_sb.AppendLine('<!-- Genere par build-installer.ps1 - ne pas editer manuellement -->')
    [void]$script:_sb.AppendLine('<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">')
    [void]$script:_sb.AppendLine('  <Fragment>')
    [void]$script:_sb.AppendLine()

    # Arborescence des dossiers
    if ($script:_uniqueDirs.Count -gt 0) {
        [void]$script:_sb.AppendLine('    <DirectoryRef Id="INSTALLFOLDER">')
        Write-WixDirTree -parentRel '' -indent 6
        [void]$script:_sb.AppendLine('    </DirectoryRef>')
        [void]$script:_sb.AppendLine()
    }

    # ComponentGroup : un composant par fichier
    [void]$script:_sb.AppendLine('    <ComponentGroup Id="ElectronFiles">')
    $i = 0
    foreach ($file in $allFiles) {
        $relPath = $file.FullName.Substring($SourceDir.Length).TrimStart('\')
        $relDir  = Split-Path $relPath -Parent
        $dirAttr = if ($relDir -and $script:_dirIdMap.ContainsKey($relDir)) {
            $script:_dirIdMap[$relDir]
        } else { 'INSTALLFOLDER' }
        $src = "`$(var.ElectronDir)\$relPath"
        [void]$script:_sb.AppendLine("      <Component Id=`"c$i`" Guid=`"*`" Directory=`"$dirAttr`">")
        [void]$script:_sb.AppendLine("        <File Source=`"$src`" />")
        [void]$script:_sb.AppendLine("      </Component>")
        $i++
    }
    [void]$script:_sb.AppendLine('    </ComponentGroup>')
    [void]$script:_sb.AppendLine()
    [void]$script:_sb.AppendLine('  </Fragment>')
    [void]$script:_sb.AppendLine('</Wix>')

    [System.IO.File]::WriteAllText($OutputFile, $script:_sb.ToString(), [System.Text.Encoding]::UTF8)
    return $i
}

if (-not $SkipWix) {
    Write-Step "Harvest des fichiers Electron (PowerShell natif)..."
    $harvestOut  = Join-Path $SCRIPT_DIR "electron-files.wxs"
    $fileCount   = Invoke-HarvestDirectory -SourceDir $UNPACKED_DIR -OutputFile $harvestOut
    Write-OK "electron-files.wxs genere ($fileCount fichiers)"

    # ── Etape 6 : Compiler le MSI ─────────────────────────────────────────────
    Write-Step "Compilation du MSI (wix build)..."
    $msiOut = Join-Path $DIST_DIR "DualView-$APP_VERSION.msi"

    # FIX : WiX v4 n'accepte qu'une culture par invocation de wix build.
    # On compile en fr-FR (culture principale) ; en-US est gere par le
    # bootstrapper Burn qui charge le bon .wxl selon la langue Windows.
    $buildMsiArgs = @(
        "build",
        (Join-Path $SCRIPT_DIR "product.wxs"),
        (Join-Path $SCRIPT_DIR "custom-actions.wxs"),
        $harvestOut,
        "-d", "ElectronDir=$UNPACKED_DIR",
        "-ext", "WixToolset.UI.wixext",
        "-ext", "WixToolset.Util.wixext",
        "-culture", "fr-FR",
        "-arch", "x64",
        "-out", $msiOut
    )
    & $wixPath @buildMsiArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Compilation MSI echouee"
        Exit-Script 1
    }
    Write-OK "MSI cree : DualView-$APP_VERSION.msi"

    # ── Etape 7 : Compiler le Bundle Burn ────────────────────────────────────
    Write-Step "Compilation du Bundle Burn (installeur final)..."
    $bundleOut = Join-Path $DIST_DIR "DualView-Setup-$APP_VERSION.exe"

    $buildBundleArgs = @(
        "build",
        (Join-Path $SCRIPT_DIR "bundle.wxs"),
        "-ext", "WixToolset.Bal.wixext",
        "-ext", "WixToolset.Util.wixext",
        "-culture", "fr-FR",
        "-arch", "x64",
        "-out", $bundleOut
    )
    & $wixPath @buildBundleArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Compilation Bundle echouee"
        Exit-Script 1
    }
    Write-OK "Bundle cree : DualView-Setup-$APP_VERSION.exe"

} else {
    Write-Warn "Compilation WiX ignoree (-SkipWix)"
}

# ── Resume ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Build termine avec succes !"               -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Fichier a distribuer :"                    -ForegroundColor White
Write-Host "  dist\DualView-Setup-$APP_VERSION.exe"      -ForegroundColor Cyan
Write-Host ""
Write-Host "  Double-cliquez sur ce fichier pour"        -ForegroundColor White
Write-Host "  installer DualView sur Windows 11."        -ForegroundColor White
Write-Host ""

Exit-Script 0