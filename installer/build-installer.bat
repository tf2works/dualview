@echo off
:: DualView v0.2.3 - Build de l'installeur MSI
:: Reserv aux contributeurs voulant distribuer DualView.
:: Les utilisateurs finaux executent directement DualView-Setup-0.2.3.exe.
echo.
echo  DualView v0.2.6 - Build
echo  ========================
echo.
echo  Produit dist\DualView-Setup-0.2.6.exe
echo  Inclut un desinstallateur Windows natif.
echo.
echo  Prerequis : .NET SDK 6+ (https://dot.net/download)
echo  Duree estimee : 10 a 20 minutes
echo.
pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1"
