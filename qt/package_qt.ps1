param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$qtDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = Split-Path -Parent $qtDir
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
Copy-Item -LiteralPath (Join-Path $repoDir 'public\icon.png') -Destination (Join-Path $stageDir 'app-icon.png')
Copy-Item -LiteralPath (Join-Path $qtDir 'app.ico') -Destination (Join-Path $stageDir 'app.ico')
if (Test-Path -LiteralPath (Join-Path $qtDir 'webview2\build\native\x64\WebView2Loader.dll')) {
    Copy-Item -LiteralPath (Join-Path $qtDir 'webview2\build\native\x64\WebView2Loader.dll') -Destination (Join-Path $stageDir 'WebView2Loader.dll')
}

$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $stageDir 'node\node.exe')

# Dedicated production-only sidecar manifest to avoid bundling React / Vite / Lucide frontend bloat
$sidecarManifest = @{
    name = "beta-music-player-sidecar"
    version = "1.0.8"
    private = $true
    dependencies = @{
        "@neteasecloudmusicapienhanced/api" = "4.38.0"
        "@sansenjian/qq-music-api" = "^2.4.0"
        "kugoumusicapi" = "git+https://github.com/MakcRe/KuGouMusicApi.git#7a60b706002526914644e50c90f1310c0dc32182"
        "axios" = "^1.7.2"
        "cors" = "^2.8.5"
        "crypto-js" = "^4.2.0"
        "express" = "^4.19.2"
        "pako" = "^2.1.0"
        "qrc-decoder" = "^1.0.2"
        "xml2js" = "^0.6.2"
    }
} | ConvertTo-Json -Depth 5
Set-Content -LiteralPath (Join-Path $runtimeWork 'package.json') -Value $sidecarManifest -Encoding UTF8

Copy-Item -LiteralPath (Join-Path $repoDir 'scripts') -Destination $runtimeWork -Recurse
Push-Location $runtimeWork
try {
    Write-Host "[sidecar] Installing lean backend dependencies..."
    & npm.cmd install --omit=dev --no-audit --no-fund --ignore-scripts
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
    (Join-Path $stageDir 'node_modules\kugoumusicapi'),
    (Join-Path $stageDir 'node_modules\qrc-decoder')
)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Staged sidecar component is missing: $required" }
}

function Get-FreeLoopbackPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

$sidecarPortSet = [Collections.Generic.HashSet[int]]::new()
while ($sidecarPortSet.Count -lt 3) {
    [void]$sidecarPortSet.Add((Get-FreeLoopbackPort))
}
$sidecarPorts = @($sidecarPortSet)
$oldNeteasePort = $env:BETA_NETEASE_PORT
$oldQqPort = $env:BETA_QQ_PORT
$oldKugouPort = $env:BETA_KUGOU_PORT
$env:BETA_NETEASE_PORT = [string]$sidecarPorts[0]
$env:BETA_QQ_PORT = [string]$sidecarPorts[1]
$env:BETA_KUGOU_PORT = [string]$sidecarPorts[2]
$sidecarCheck = $null
try {
    $sidecarCheck = Start-Process -FilePath (Join-Path $stageDir 'node\node.exe') `
        -ArgumentList (Join-Path $stageDir 'netease_server.js') -WorkingDirectory $stageDir `
        -WindowStyle Hidden -PassThru
    $healthy = $false
    for ($attempt = 0; $attempt -lt 60 -and -not $healthy; $attempt++) {
        Start-Sleep -Milliseconds 150
        $healthy = $true
        foreach ($port in $sidecarPorts) {
            $client = [Net.Sockets.TcpClient]::new()
            try { $client.Connect('127.0.0.1', $port) }
            catch { $healthy = $false }
            finally { $client.Dispose() }
        }
        if ($sidecarCheck.HasExited) { break }
    }
    if (-not $healthy) { throw 'Staged three-platform sidecar failed its loopback health check.' }
} finally {
    if ($sidecarCheck -and -not $sidecarCheck.HasExited) { Stop-Process -Id $sidecarCheck.Id -Force }
    $env:BETA_NETEASE_PORT = $oldNeteasePort
    $env:BETA_QQ_PORT = $oldQqPort
    $env:BETA_KUGOU_PORT = $oldKugouPort
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
    'kugoumusicapi',
    '',
    'Detailed package licenses are included in node_modules.'
)
Set-Content -LiteralPath (Join-Path $stageDir 'THIRD_PARTY_NOTICES.txt') -Value $notice -Encoding UTF8

Write-Host "[package] Creating portable zip archive..."
$zipPath = Join-Path $distDir "Beta Music Player $version Portable.zip"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "[package] Compiling NSIS installer with LZMA solid compression..."
$makensis = Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache\nsis" -Recurse -Filter makensis.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -notmatch '\\Bin$' } | Select-Object -First 1
if (-not $makensis) { $makensis = Get-Command makensis.exe -ErrorAction SilentlyContinue }
if (-not $makensis) { throw 'NSIS makensis.exe was not found.' }
$setupPath = Join-Path $distDir "Beta Music Player Setup $version.exe"
& $makensis.FullName "/DVERSION=$version" "/DSOURCE_DIR=$stageDir" "/DOUTPUT_FILE=$setupPath" (Join-Path $qtDir 'installer.nsi')
if ($LASTEXITCODE -ne 0) { throw 'NSIS installer build failed.' }

Remove-Item -LiteralPath $runtimeWork -Recurse -Force
Write-Host "Portable: $zipPath"
Write-Host "Installer: $setupPath"
