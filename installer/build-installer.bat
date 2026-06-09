@echo off
echo.
echo  DualView v0.4.6 - Build
echo  ========================
echo.
echo  Produit dist\DualView-Setup-0.4.6.exe
echo  Inclut un desinstallateur Windows natif.
echo.
echo  Prerequis : Node.js v22+ (https://nodejs.org)
echo  Duree estimee : 5 a 15 minutes
echo.
pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1"