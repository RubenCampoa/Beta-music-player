@echo off
cd /d "%~dp0"

echo Stopping existing Beta Music Player processes...
taskkill /F /IM BetaMusicPlayerCpp.exe /T 2>nul
taskkill /F /IM BetaMusicPlayer.exe /T 2>nul
timeout /t 1 /nobreak >nul

set "EXE=%~dp0dist\BetaMusicPlayer\BetaMusicPlayer.exe"
if not exist "%EXE%" set "EXE=%~dp0cpp\build-nmake\BetaMusicPlayerCpp.exe"
if not exist "%EXE%" (
  echo [ERROR] Cannot find BetaMusicPlayer.exe. Run build_cpp.bat or package_qt.ps1 first.
  pause
  exit /b 1
)

echo Starting %EXE%
start "" "%EXE%"
exit /b 0
