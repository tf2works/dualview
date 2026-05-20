@echo off
:: DualView - Lanceur du script de build
:: Double-cliquez pour compiler DualView.exe
echo.
echo  DualView v0.1.0 - Build
echo  ========================
echo.
echo  Ce script va :
echo    1. Verifier Node.js (installation auto si absent)
echo    2. Installer les dependances
echo    3. Compiler DualView-Setup-0.1.0.exe dans ce dossier
echo.
echo  Duree estimee : 5 a 15 minutes
echo.
pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"