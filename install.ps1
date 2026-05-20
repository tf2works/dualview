#Requires -Version 5.0
# DualView - Script de build Windows 11
# Version : 0.1.0
# Ce script installe les dependances et compile DualView.exe

param(
    [switch]$Unattended = $false
)

# Forcer l execution en tant qu Administrateur
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Relance en mode Administrateur..." -ForegroundColor Yellow
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($Unattended) { $argList += " -Unattended" }
    Start-Process PowerShell -Verb RunAs -ArgumentList $argList
    exit
}

# Configuration
$APP_NAME       = "DualView"
$APP_VERSION    = "0.1.0"
$SCRIPT_DIR     = Split-Path -Parent $PSCommandPath
$NODE_INSTALLER = "https://nodejs.org/dist/latest-v22.x/node-v22.15.0-x64.msi"
$NODE_MIN_VER   = [Version]"22.0.0"

function Write-Step { param($msg) Write-Host "" ; Write-Host ">>> $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "    [!!] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "    [XX] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "         $msg" -ForegroundColor Gray }

function Reload-EnvPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath) {
        $env:Path = $machinePath + ";" + $userPath
    } else {
        $env:Path = $machinePath
    }
}

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
    $found = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    return $null
}

function Find-NpmCmd {
    param([string]$NodeExePath)
    if ($NodeExePath) {
        $nodeDir = Split-Path -Parent $NodeExePath
        $npmCmd  = Join-Path $nodeDir "npm.cmd"
        if (Test-Path $npmCmd) { return $npmCmd }
    }
    $candidates = @(
        "$env:ProgramFiles\nodejs\npm.cmd",
        "$env:ProgramW6432\nodejs\npm.cmd",
        "${env:ProgramFiles(x86)}\nodejs\npm.cmd",
        "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Invoke-Npm {
    param([string]$NpmCmd, [string[]]$Arguments)
    $cmdArgs = @("/c", "`"$NpmCmd`"") + $Arguments
    $result  = & cmd.exe $cmdArgs 2>&1
    return $result
}

Clear-Host
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  $APP_NAME v$APP_VERSION - Build"         -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""
Write-Info "Ce script va compiler DualView.exe dans ce dossier."
Write-Info "Duree estimee : 5 a 15 minutes selon la connexion."
Write-Host ""

# Etape 1 : Verifier Windows 11
Write-Step "Verification de Windows 11..."
$osInfo  = Get-WmiObject -Class Win32_OperatingSystem
$osBuild = [int]$osInfo.BuildNumber
if ($osBuild -lt 22000) {
    Write-Fail "Windows 11 requis (build 22000+). Build actuel : $osBuild"
    if (-not $Unattended) { Read-Host "Appuyez sur Entree pour quitter" }
    exit 1
}
Write-OK "Windows 11 detecte (Build $osBuild)"

# Etape 2 : Verifier / Installer Node.js
Write-Step "Verification de Node.js (v22 LTS requis)..."
Reload-EnvPath
$nodeInstalled = $false
$nodePath      = Find-NodeExe

if ($nodePath) {
    try {
        $nodeVerStr = (& "$nodePath" --version 2>$null) -replace "v", ""
        $nodeVer    = [Version]$nodeVerStr
        if ($nodeVer -ge $NODE_MIN_VER) {
            Write-OK "Node.js $nodeVerStr installe ($nodePath)"
            $nodeInstalled = $true
        } else {
            Write-Warn "Node.js $nodeVerStr detecte, mais v22+ requis"
        }
    } catch {
        Write-Warn "Version Node.js indeterminee - reinstallation"
    }
} else {
    Write-Info "Node.js non trouve - installation en cours..."
}

if (-not $nodeInstalled) {
    Write-Info "Telechargement de Node.js v22 LTS..."
    $tmpMsi = Join-Path $env:TEMP "node-installer.msi"
    try {
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $NODE_INSTALLER -OutFile $tmpMsi -UseBasicParsing
        Write-Info "Installation de Node.js..."
        $proc = Start-Process msiexec.exe -ArgumentList "/i `"$tmpMsi`" /qn ADDLOCAL=ALL" -Wait -PassThru -NoNewWindow
        if ($proc.ExitCode -ne 0) {
            Write-Fail "Echec installation Node.js (code $($proc.ExitCode))"
            if (-not $Unattended) { Read-Host "Appuyez sur Entree pour quitter" }
            exit 1
        }
        Remove-Item $tmpMsi -ErrorAction SilentlyContinue
        Reload-EnvPath
        $nodePath = Find-NodeExe
        Write-OK "Node.js installe avec succes"
    } catch {
        Write-Fail "Impossible de telecharger Node.js : $_"
        Write-Warn "Installez manuellement depuis : https://nodejs.org"
        if (-not $Unattended) { Read-Host "Appuyez sur Entree pour quitter" }
        exit 1
    }
}

$npmPath = Find-NpmCmd -NodeExePath $nodePath
if (-not $npmPath) {
    Write-Fail "npm.cmd introuvable. Verifiez l installation de Node.js."
    if (-not $Unattended) { Read-Host "Appuyez sur Entree pour quitter" }
    exit 1
}
$nodeDir = Split-Path -Parent $nodePath
Write-Info "node.exe : $nodePath"
Write-Info "npm.cmd  : $npmPath"

# Etape 3 : Installer les dependances dans le dossier source
Write-Step "Installation des dependances npm..."
Push-Location $SCRIPT_DIR

try {
    Write-Info "npm install (2-5 minutes)..."
    $npmOut = Invoke-Npm -NpmCmd $npmPath -Arguments @("install")
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install a echoue :"
        $npmOut | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Pop-Location
        if (-not $Unattended) { Read-Host "Appuyez sur Entree pour quitter" }
        exit 1
    }
    Write-OK "Dependances installees"

    # Audit de securite
    Write-Step "Audit de securite des packages..."
    $auditOut = Invoke-Npm -NpmCmd $npmPath -Arguments @("audit")
    $auditStr = $auditOut -join " "
    if ($auditStr -match "0 vulnerabilit") {
        Write-OK "Aucune vulnerabilite detectee"
    } elseif ($auditStr -match "critical|high") {
        Write-Warn "Vulnerabilites HIGH/CRITICAL - tentative de correction..."
        Invoke-Npm -NpmCmd $npmPath -Arguments @("audit", "fix", "--force") | Out-Null
        Write-Warn "Verifiez manuellement : npm audit"
    } else {
        Write-Info "Vulnerabilites mineures - correction automatique..."
        Invoke-Npm -NpmCmd $npmPath -Arguments @("audit", "fix") | Out-Null
        Write-OK "Corrections appliquees"
    }

    # Etape 4 : Compiler l executable avec electron-builder
    Write-Step "Compilation de DualView.exe..."
    Write-Info "Cette etape peut prendre 5 a 10 minutes (telechargement Electron)..."
    Write-Info "Ne fermez pas cette fenetre."
    Write-Host ""

    $buildOut = Invoke-Npm -NpmCmd $npmPath -Arguments @("run", "build")
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "La compilation a echoue :"
        $buildOut | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Pop-Location
        if (-not $Unattended) { Read-Host "Appuyez sur Entree pour quitter" }
        exit 1
    }
    Write-OK "Compilation terminee"

} finally {
    Pop-Location
}

# Etape 5 : Verifier et deplacer le setup.exe dans le dossier courant
Write-Step "Finalisation..."
$distDir    = Join-Path $SCRIPT_DIR "dist"
$setupFiles = Get-ChildItem -Path $distDir -Filter "*.exe" -ErrorAction SilentlyContinue |
              Where-Object { $_.Name -notmatch "unpack" } |
              Sort-Object LastWriteTime -Descending

if (-not $setupFiles) {
    Write-Fail "Executable non trouve dans $distDir"
    Write-Warn "Verifiez les logs ci-dessus"
    if (-not $Unattended) { Read-Host "Appuyez sur Entree pour quitter" }
    exit 1
}

$setupExe    = $setupFiles[0]
$targetName  = "DualView-Setup-$APP_VERSION.exe"
$targetPath  = Join-Path $SCRIPT_DIR $targetName

Copy-Item -Path $setupExe.FullName -Destination $targetPath -Force
Write-OK "Executable cree : $targetName"

# Resume final
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Build termine avec succes !"             -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Fichier cree : $targetName"             -ForegroundColor White
Write-Host "  Dossier      : $SCRIPT_DIR"             -ForegroundColor White
Write-Host ""
Write-Host "  Double-cliquez sur $targetName"         -ForegroundColor Cyan
Write-Host "  pour installer DualView."               -ForegroundColor Cyan
Write-Host ""

if (-not $Unattended) {
    Read-Host "Appuyez sur Entree pour fermer"
}
