#Requires -Version 5.0
# DualView v0.4.7 - Script de build
#
# Produit dist\DualView-Setup-[version].exe via electron-builder (NSIS).
# Ce fichier inclut automatiquement un desinstallateur Windows natif.
#
# Prerequis : Node.js >= 22 (https://nodejs.org)

param(
    [switch]$SkipBuild  = $false,
    [switch]$Unattended = $false
)

if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $args = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($SkipBuild)  { $args += " -SkipBuild" }
    if ($Unattended) { $args += " -Unattended" }
    Start-Process PowerShell -Verb RunAs -ArgumentList $args
    exit
}

$APP_VERSION = "0.4.7"
$SCRIPT_DIR  = Split-Path -Parent $PSCommandPath
$ROOT_DIR    = Split-Path -Parent $SCRIPT_DIR
$DIST_DIR    = Join-Path $ROOT_DIR "dist"
$NODE_MIN    = [Version]"22.0.0"

function Write-Step { param($m) Write-Host ""; Write-Host ">>> $m" -ForegroundColor Cyan }
function Write-OK   { param($m) Write-Host "    [OK] $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "    [!!] $m" -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "    [XX] $m" -ForegroundColor Red }
function Write-Info { param($m) Write-Host "         $m" -ForegroundColor Gray }
function Exit-Script { param([int]$Code=0) if (-not $Unattended) { Read-Host "Appuyez sur Entree pour fermer" } ; exit $Code }

function Reload-EnvPath {
    $mp = [System.Environment]::GetEnvironmentVariable("Path","Machine")
    $up = [System.Environment]::GetEnvironmentVariable("Path","User")
    $env:Path = if ($up) { "$mp;$up" } else { $mp }
}

function Find-NodeExe {
    Reload-EnvPath
    $candidates = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "$env:ProgramW6432\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    $c = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}

function Find-NpmCmd {
    param([string]$NodePath)
    $dir = Split-Path -Parent $NodePath
    $npm = Join-Path $dir "npm.cmd"
    if (Test-Path $npm) { return $npm }
    foreach ($p in @("$env:ProgramFiles\nodejs\npm.cmd","$env:ProgramW6432\nodejs\npm.cmd")) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

Clear-Host
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  DualView v$APP_VERSION - Build"             -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""
Write-Info "Produit dist\DualView-Setup-$APP_VERSION.exe"
Write-Info "Inclut un desinstallateur Windows natif."
Write-Host ""

Write-Step "Verification de Windows 11..."
$build = [int](Get-WmiObject Win32_OperatingSystem).BuildNumber
if ($build -lt 22000) { Write-Fail "Windows 11 requis (build 22000+). Actuel : $build" ; Exit-Script 1 }
Write-OK "Windows 11 (Build $build)"

Write-Step "Verification de Node.js (v22+ requis)..."
$nodePath = Find-NodeExe
if (-not $nodePath) { Write-Fail "Node.js introuvable. Installez depuis https://nodejs.org" ; Exit-Script 1 }

$nodeVerStr = (& $nodePath --version 2>&1) -replace "v",""
if (-not $nodeVerStr -or $nodeVerStr -notmatch "^\d+\.\d+") {
    Write-Fail "Impossible de lire la version Node.js" ; Exit-Script 1
}
try { $nodeVer = [Version]$nodeVerStr } catch { Write-Fail "Version invalide : $nodeVerStr" ; Exit-Script 1 }
if ($nodeVer -lt $NODE_MIN) { Write-Fail "Node.js $nodeVerStr detecte, v22+ requis." ; Exit-Script 1 }

$npmPath = Find-NpmCmd -NodePath $nodePath
if (-not $npmPath) { Write-Fail "npm.cmd introuvable." ; Exit-Script 1 }
Write-OK "Node.js $nodeVerStr ($nodePath)"
Write-OK "npm : $npmPath"

if (-not $SkipBuild) {
    Write-Step "npm install..."
    Push-Location $ROOT_DIR
    try {
        $out = & cmd.exe /c "`"$npmPath`" install" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm install a echoue (code $LASTEXITCODE)"
            $out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Pop-Location ; Exit-Script 1
        }
        Write-OK "Dependances installees"

        Write-Step "npm run build (electron-builder)..."
        Write-Info "5 a 15 minutes selon la connexion..."
        $out = & cmd.exe /c "`"$npmPath`" run build" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm run build a echoue (code $LASTEXITCODE)"
            $out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Pop-Location ; Exit-Script 1
        }
        Write-OK "Application compilee"
    } catch {
        Write-Fail "Erreur : $_" ; Pop-Location ; Exit-Script 1
    }
    Pop-Location
} else {
    Write-Warn "Build npm ignore (-SkipBuild)"
}

# Verifier le setup.exe produit par electron-builder
$setups = Get-ChildItem -Path $DIST_DIR -Filter "*.exe" -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -match "Setup" } |
          Sort-Object LastWriteTime -Descending
if (-not $setups) {
    Write-Fail "Aucun fichier Setup*.exe trouve dans dist\"
    Write-Info  "Verifiez les logs ci-dessus."
    Exit-Script 1
}

$setup = $setups[0]
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Build termine avec succes !"               -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Fichier : $($setup.Name)"                 -ForegroundColor Cyan
Write-Host "  Dossier : $DIST_DIR"                      -ForegroundColor White
Write-Host ""
Write-Host "  Double-cliquez sur ce fichier pour"        -ForegroundColor White
Write-Host "  installer DualView sur Windows 11."        -ForegroundColor White
Write-Host "  Le desinstallateur est cree automatiquement" -ForegroundColor White
Write-Host "  dans Parametres > Applications."           -ForegroundColor White
Write-Host ""
Exit-Script 0