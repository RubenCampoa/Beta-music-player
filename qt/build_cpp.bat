@echo off
setlocal
title Build Beta Music Player (Qt C++)
cd /d "%~dp0"

set "QT_ROOT=C:\Qt\6.5.3\msvc2019_64"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"

if not exist "%QT_ROOT%\lib\cmake\Qt6\Qt6Config.cmake" (
    echo [ERROR] Qt MSVC toolkit not found at:
    echo         %QT_ROOT%
    if not defined BETA_NO_PAUSE pause
    exit /b 1
)

where cl.exe >nul 2>nul
if errorlevel 1 (
    if exist "C:\BuildTools\Common7\Tools\VsDevCmd.bat" (
        call "C:\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
    )
)

where cl.exe >nul 2>nul
if errorlevel 1 (
    if exist "%VSWHERE%" (
        for /f "tokens=*" %%i in ('"%VSWHERE%" -latest -products * -property installationPath') do set "VS_ROOT=%%i"
        if defined VS_ROOT call "%VS_ROOT%\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
    )
)

where cl.exe >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Visual C++ Build Tools are not installed.
    echo Install "Desktop development with C++" in Visual Studio Installer,
    echo then run this file again. Qt itself is already installed.
    if not defined BETA_NO_PAUSE pause
    exit /b 1
)

cmake -S cpp -B cpp\build-nmake -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="%QT_ROOT%"
if errorlevel 1 goto :failed
cmake --build cpp\build-nmake
if errorlevel 1 goto :failed

if exist "webview2\build\native\x64\WebView2Loader.dll" (
    copy /y "webview2\build\native\x64\WebView2Loader.dll" "cpp\build-nmake\WebView2Loader.dll" >nul
)

"%QT_ROOT%\bin\windeployqt.exe" --release --qmldir app\ui cpp\build-nmake\BetaMusicPlayerCpp.exe
if errorlevel 1 goto :failed

echo.
echo Build complete: cpp\build-nmake\BetaMusicPlayerCpp.exe
if not defined BETA_NO_PAUSE pause
exit /b 0

:failed
echo.
echo [ERROR] Build failed. Review the compiler output above.
if not defined BETA_NO_PAUSE pause
exit /b 1
