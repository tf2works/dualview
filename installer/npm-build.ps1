#Requires -Version 5.0
# DualView v0.2.3 - Script de build embarque dans l'installeur MSI
# Appele par le bootstrapper Burn pendant la phase d'installation.
# Ne pas executer directement.
#
# Variables d'environnement attendues (injectees par le bootstrapper) :
#   DUALVIEW_SRC_DIR   : dossier contenant les sources DualView
#   DUALVIEW_INST_LOG  : chemin vers le fichier de log

param(
    [string]$SrcDir  = $env:DUALVIEW_SRC_DIR,
    [string]$LogFile = $env:DUALVIEW_INST_LOG
)

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Log {
    param([string]$Msg, [string]$Level = "INFO")
    $line = "[$(Get-Date -Format 'HH:mm:ss')] [$Level] $Msg"
    Write-Host $line
    if ($LogFile) { Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue }
}

function Exit-Fail {
    param([string]$Msg)
    Write-Log $Msg "ERROR"
    exit 1
}

# ── Localiser node et npm ─────────────────────────────────────────────────────
function Find-NodeExe {
    # Recharger PATH apres installation eventuelle de Node
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path    = "$machinePath;$userPath"

    $candidates = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "$env:ProgramW6432\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    $found = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    return $null
}

function Find-NpmCmd {
    param([string]$NodeExePath)
    if ($NodeExePath) {
        $dir    = Split-Path -Parent $NodeExePath
        $npmCmd = Join-Path $dir "npm.cmd"
        if (Test-Path $npmCmd) { return $npmCmd }
    }
    $candidates = @(
        "$env:ProgramFiles\nodejs\npm.cmd",
        "$env:ProgramW6432\nodejs\npm.cmd"
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    return $null
}

function Invoke-Npm {
    param([string]$NpmCmd, [string[]]$Arguments)
    $cmdArgs = @("/c", "`"$NpmCmd`"") + $Arguments
    $output  = & cmd.exe $cmdArgs 2>&1
    if ($LogFile) {
        $output | ForEach-Object { Add-Content -Path $LogFile -Value "  [npm] $_" -ErrorAction SilentlyContinue }
    }
    return $LASTEXITCODE
}

# ── Validation du dossier source ──────────────────────────────────────────────
Write-Log "=== DualView Build Script v0.2.3 ==="
Write-Log "SrcDir : $SrcDir"

if (-not $SrcDir -or -not (Test-Path $SrcDir)) {
    Exit-Fail "Dossier source introuvable : '$SrcDir'"
}

$pkgJson = Join-Path $SrcDir "package.json"
if (-not (Test-Path $pkgJson)) {
    Exit-Fail "package.json absent dans '$SrcDir' - sources DualView manquantes"
}

# ── Verifier Node.js ──────────────────────────────────────────────────────────
Write-Log "Recherche de Node.js..."
$nodePath = Find-NodeExe
if (-not $nodePath) {
    Exit-Fail "Node.js introuvable. Le bootstrapper aurait du l'installer."
}

$nodeVer = (& "$nodePath" --version 2>$null) -replace "v", ""
Write-Log "Node.js $nodeVer detecte : $nodePath"

$npmPath = Find-NpmCmd -NodeExePath $nodePath
if (-not $npmPath) {
    Exit-Fail "npm.cmd introuvable aupres de $nodePath"
}
Write-Log "npm    : $npmPath"

# ── npm install ───────────────────────────────────────────────────────────────
Write-Log "npm install (installation des dependances)..."
Push-Location $SrcDir
try {
    $exit = Invoke-Npm -NpmCmd $npmPath -Arguments @("install", "--prefer-offline")
    if ($exit -ne 0) { Exit-Fail "npm install a echoue (code $exit)" }
    Write-Log "npm install : OK"

    # ── electron-builder ──────────────────────────────────────────────────────
    Write-Log "npm run build (electron-builder --win --x64)..."
    $exit = Invoke-Npm -NpmCmd $npmPath -Arguments @("run", "build")
    if ($exit -ne 0) { Exit-Fail "npm run build a echoue (code $exit)" }
    Write-Log "Build : OK"

} finally {
    Pop-Location
}

Write-Log "=== Build termine avec succes ==="
exit 0
