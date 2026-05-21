@echo off
:: DualView v0.2.3 - Build de l'installeur MSI
:: Reserv aux contributeurs voulant distribuer DualView.
:: Les utilisateurs finaux executent directement DualView-Setup-0.2.3.exe.
echo.
echo  DualView v0.2.3 - Build Installeur MSI
echo  ========================================
echo.
echo  Ce script va :
echo    1. Verifier Node.js et WiX Toolset v4
echo       (WiX sera installe automatiquement si absent)
echo    2. Compiler DualView avec electron-builder
echo    3. Construire DualView-Setup-0.2.3.exe
echo.
echo  Prerequis : .NET SDK 6+ (https://dot.net/download)
echo  Duree estimee : 10 a 20 minutes
echo.
pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1"
