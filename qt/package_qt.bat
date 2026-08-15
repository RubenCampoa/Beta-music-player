@echo off
setlocal
title Package Beta Music Player (Qt)
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0package_qt.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Packaging failed. Review the output above.
    if not defined BETA_NO_PAUSE pause
    exit /b 1
)
echo.
echo Packaging complete. See qt\dist.
if not defined BETA_NO_PAUSE pause
endlocal
