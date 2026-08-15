@echo off
cd /d "%~dp0"

echo [1/2] Building Qt C++ project...
call "%~dp0build_cpp.bat"
if errorlevel 1 (
  echo [ERROR] Build failed. See output above.
  pause
  exit /b 1
)

echo [2/2] Packaging portable + installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package_qt.ps1"
if errorlevel 1 (
  echo [ERROR] Packaging failed. See output above.
  pause
  exit /b 1
)

echo Done. Outputs are in qt\dist.
pause
exit /b 0
