param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$qtDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$qtRoot = 'C:\Qt\6.5.3\msvc2019_64'
$buildDir = Join-Path $qtDir 'cpp\build-nmake'
$distDir = Join-Path $qtDir 'dist'
$stageDir = Join-Path $distDir 'BetaMusicPlayer'
$runtimeWork = Join-Path $distDir '.sidecar-runtime'

if (-not $SkipBuild) {
    $env:BETA_NO_PAUSE = '1'
    & (Join-Path $qtDir 'build_cpp.bat')
    if ($LASTEXITCODE -ne 0) { throw 'Qt Release build failed.' }
}

$exe = Join-Path $buildDir 'BetaMusicPlayerCpp.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Missing build output: $exe" }
if (-not (Test-Path -LiteralPath "$qtRoot\bin\windeployqt.exe")) { throw 'windeployqt was not found.' }

foreach ($target in @($stageDir, $runtimeWork)) {
    if (Test-Path -LiteralPath $target) {
        $resolved = [IO.Path]::GetFullPath($target)
        $allowedRoot = [IO.Path]::GetFullPath($distDir) + [IO.Path]::DirectorySeparatorChar
        if (-not $resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove path outside qt/dist: $resolved"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

New-Item -ItemType Directory -Path $stageDir, (Join-Path $stageDir 'node'), $runtimeWork -Force | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $stageDir 'BetaMusicPlayer.exe')
Copy-Item -LiteralPath (Join-Path $qtDir 'app') -Destination $stageDir -Recurse
Copy-Item -LiteralPath (Join-Path $qtDir 'netease_server.js') -Destination $stageDir
Copy-Item -LiteralPath (Join-Path $qtDir 'app-icon.png') -Destination (Join-Path $stageDir 'app-icon.png')
Copy-Item -LiteralPath (Join-Path $qtDir 'app.ico') -Destination (Join-Path $stageDir 'app.ico')
if (Test-Path -LiteralPath (Join-Path $qtDir 'webview2\build\native\x64\WebView2Loader.dll')) {
    Copy-Item -LiteralPath (Join-Path $qtDir 'webview2\build\native\x64\WebView2Loader.dll') -Destination (Join-Path $stageDir 'WebView2Loader.dll')
}

$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $stageDir 'node\node.exe')

Copy-Item -LiteralPath (Join-Path $qtDir 'package.json') -Destination $runtimeWork
if (Test-Path -LiteralPath (Join-Path $qtDir 'package-lock.json')) {
    Copy-Item -LiteralPath (Join-Path $qtDir 'package-lock.json') -Destination $runtimeWork
}
Copy-Item -LiteralPath (Join-Path $qtDir 'scripts') -Destination $runtimeWork -Recurse
Push-Location $runtimeWork
try {
    Write-Host "[sidecar] Installing lean backend dependencies..."
    if (Test-Path -LiteralPath (Join-Path $runtimeWork 'package-lock.json')) {
        & npm.cmd ci --omit=dev --no-audit --no-fund --ignore-scripts
    } else {
        & npm.cmd install --omit=dev --no-audit --no-fund --ignore-scripts
    }
    if ($LASTEXITCODE -ne 0) { throw 'Production sidecar dependency install failed.' }
    & node.exe (Join-Path $runtimeWork 'scripts\patch-ncm-lyric.js')
    & node.exe (Join-Path $runtimeWork 'scripts\patch-qmusic-lyric.js')
    & node.exe (Join-Path $runtimeWork 'scripts\patch-qmusic-cookie.js')
    
    # Strip unnecessary documentation, tests, maps and type definitions to slim down the bundle
    Get-ChildItem -Path (Join-Path $runtimeWork 'node_modules') -Recurse -Directory -Include 'test', 'tests', 'docs', 'doc', 'examples', 'example', '.github', 'coverage', 'benchmark' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path (Join-Path $runtimeWork 'node_modules') -Recurse -File -Include '*.md', '*.ts', '*.map', '*.flow', '*.yml', '*.yaml' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
} finally {
    Pop-Location
}
Copy-Item -LiteralPath (Join-Path $runtimeWork 'node_modules') -Destination $stageDir -Recurse

foreach ($required in @(
    (Join-Path $stageDir 'node\node.exe'),
    (Join-Path $stageDir 'netease_server.js'),
    (Join-Path $stageDir 'node_modules\@neteasecloudmusicapienhanced\api'),
    (Join-Path $stageDir 'node_modules\@sansenjian\qq-music-api'),
    (Join-Path $stageDir 'node_modules\qrc-decoder')
)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Staged sidecar component is missing: $required" }
}

Write-Host "[windeployqt] Deploying Qt runtime without unused WebEngine/OpenGL fallback..."
& "$qtRoot\bin\windeployqt.exe" --release --no-translations --no-opengl-sw --no-compiler-runtime --qmldir (Join-Path $qtDir 'app\ui') (Join-Path $stageDir 'BetaMusicPlayer.exe')
if ($LASTEXITCODE -ne 0) { throw 'Qt runtime deployment failed.' }

# Remove optional software OpenGL renderer (20MB) to save package size
$openglSw = Join-Path $stageDir 'opengl32sw.dll'
if (Test-Path -LiteralPath $openglSw) { Remove-Item -LiteralPath $openglSw -Force }

# Deploy only essential Chinese/English translations (saves ~30MB of global locale files)
$transDir = Join-Path $stageDir 'translations'
New-Item -ItemType Directory -Path $transDir -Force | Out-Null
foreach ($lang in @('qt_zh_CN.qm', 'qt_en.qm')) {
    $src = Join-Path $qtRoot "translations\$lang"
    if (Test-Path -LiteralPath $src) {
        Copy-Item -LiteralPath $src -Destination $transDir -Force
    }
}

# Portable packages need an app-local MSVC runtime. windeployqt may only add
# the redistributable installer, which is insufficient on a clean machine.
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'vswhere was not found.' }
$vsRoot = & $vswhere -latest -products '*' -property installationPath
$vcRedistRoot = Join-Path $vsRoot 'VC\Redist\MSVC'
$vcCrtDir = Get-ChildItem -LiteralPath $vcRedistRoot -Directory -Recurse -Filter 'Microsoft.VC143.CRT' |
    Where-Object { $_.FullName -match '\\x64\\Microsoft\.VC143\.CRT$' -and $_.FullName -notmatch '\\onecore\\' } |
    Sort-Object FullName -Descending | Select-Object -First 1
if (-not $vcCrtDir) { throw 'Microsoft VC143 x64 app-local runtime was not found.' }
Copy-Item -Path (Join-Path $vcCrtDir.FullName '*.dll') -Destination $stageDir -Force

foreach ($runtimeFile in @('platforms\qwindows.dll', 'vcruntime140.dll', 'msvcp140.dll')) {
    if (-not (Test-Path -LiteralPath (Join-Path $stageDir $runtimeFile))) {
        throw "Required Qt/VC runtime file is missing: $runtimeFile"
    }
}

$oldQuickBackend = $env:QT_QUICK_BACKEND
$env:QT_QUICK_BACKEND = 'software'
$appCheck = $null
try {
    $appCheck = Start-Process -FilePath (Join-Path $stageDir 'BetaMusicPlayer.exe') `
        -ArgumentList '--self-test' -WorkingDirectory $stageDir -WindowStyle Hidden -PassThru
    if (-not $appCheck.WaitForExit(30000)) {
        Stop-Process -Id $appCheck.Id -Force
        throw 'Staged application self-test timed out.'
    }
    if ($appCheck.ExitCode -ne 0) { throw "Staged application self-test failed with exit code $($appCheck.ExitCode)." }
} finally {
    if ($appCheck -and -not $appCheck.HasExited) { Stop-Process -Id $appCheck.Id -Force }
    $env:QT_QUICK_BACKEND = $oldQuickBackend
}

$cmakeText = Get-Content -LiteralPath (Join-Path $qtDir 'cpp\CMakeLists.txt') -Raw
$versionMatch = [regex]::Match($cmakeText, 'project\(BetaMusicPlayerQt VERSION ([0-9.]+)')
if (-not $versionMatch.Success) { throw 'Unable to read application version from CMakeLists.txt.' }
$version = $versionMatch.Groups[1].Value

$notice = @(
    'Beta Music Player - Third Party Runtime Notices',
    '',
    'Qt 6.5.3 (LGPL/GPL/commercial, see https://www.qt.io/licensing/)',
    'Node.js (MIT)',
    '@neteasecloudmusicapienhanced/api',
    '@sansenjian/qq-music-api',
    '',
    'Detailed package licenses are included in node_modules.'
)
Set-Content -LiteralPath (Join-Path $stageDir 'THIRD_PARTY_NOTICES.txt') -Value $notice -Encoding UTF8

Write-Host "[package] Creating portable zip archive..."
$zipPath = Join-Path $distDir "Beta Music Player $version Portable.zip"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "[package] Compiling NSIS installer with LZMA solid compression..."
$makensis = Get-Command makensis.exe -ErrorAction SilentlyContinue
if (-not $makensis) {
    foreach ($candidate in @(
        "$env:ProgramFiles\NSIS\makensis.exe",
        "${env:ProgramFiles(x86)}\NSIS\makensis.exe"
    )) {
        if (Test-Path -LiteralPath $candidate) {
            $makensis = Get-Item -LiteralPath $candidate
            break
        }
    }
}
if (-not $makensis) { throw 'NSIS makensis.exe was not found. Install NSIS 3 and add it to PATH.' }
$makensisPath = if ($makensis -is [IO.FileInfo]) {
    $makensis.FullName
} elseif ($makensis.Source) {
    $makensis.Source
} else {
    $makensis.Path
}
if (-not $makensisPath -or -not (Test-Path -LiteralPath $makensisPath)) {
    throw 'NSIS makensis.exe path could not be resolved.'
}
$setupPath = Join-Path $distDir "Beta Music Player Setup $version.exe"
& $makensisPath "/DVERSION=$version" "/DSOURCE_DIR=$stageDir" "/DOUTPUT_FILE=$setupPath" (Join-Path $qtDir 'installer.nsi')
if ($LASTEXITCODE -ne 0) { throw 'NSIS installer build failed.' }

Remove-Item -LiteralPath $runtimeWork -Recurse -Force
Write-Host "Portable: $zipPath"
Write-Host "Installer: $setupPath"
