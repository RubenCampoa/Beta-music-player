@echo off
setlocal enabledelayedexpansion
title Beta Music Player (Qt C++)
cd /d "%~dp0"

set "BUILD_DIR=%~dp0cpp\build-nmake"
set "APP_EXE=%BUILD_DIR%\BetaMusicPlayerCpp.exe"

if not exist "!APP_EXE!" (
    set "APP_EXE=%BUILD_DIR%\Release\BetaMusicPlayerCpp.exe"
)

if not exist "!APP_EXE!" (
    set "APP_EXE=%~dp0dist\BetaMusicPlayer\BetaMusicPlayerCpp.exe"
)

if not exist "!APP_EXE!" (
    echo [INFO] Building C++ project, please wait...
    call "%~dp0build_cpp.bat"
    set "APP_EXE=%BUILD_DIR%\BetaMusicPlayerCpp.exe"
)

if not exist "!APP_EXE!" (
    echo [ERROR] Could not find or build BetaMusicPlayerCpp.exe.
    pause
    exit /b 1
)

if exist "C:\Qt\6.5.3\msvc2019_64\bin" (
    set "PATH=C:\Qt\6.5.3\msvc2019_64\bin;%PATH%"
)

echo [INFO] Launching Beta Music Player...
start "" /D "%~dp0" "!APP_EXE!"
endlocal
exit /b 0
