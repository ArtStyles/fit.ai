$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path '.artifacts' -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apkPath = Join-Path (Get-Location) 'android/app/build/outputs/apk/release/app-release.apk'
$archive = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
function Read-ZipText([string]$name) {
  $entry = $archive.GetEntry($name)
  if ($null -eq $entry) { throw "Missing APK entry: $name" }
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}
function Zip-Hash([string]$name) {
  $entry = $archive.GetEntry($name)
  if ($null -eq $entry) { throw "Missing APK entry: $name" }
  $stream = $entry.Open()
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return [Convert]::ToHexString($sha.ComputeHash($stream)).ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}
try {
  $config = (Read-ZipText 'assets/capacitor.config.json') | ConvertFrom-Json
  if ($config.server.url -or $config.webDir -ne 'mobile/dist') { throw 'Remote app loader found' }
  if ($config.plugins.SplashScreen.launchAutoHide -ne $true) { throw 'Splash must auto-hide' }
  $manifest = (Read-ZipText 'assets/public/exercises/catalog/v1/manifest.json') | ConvertFrom-Json
  foreach ($exercise in $manifest.exercises) {
    $name = 'assets/public' + $exercise.assets.poster
    if ((Zip-Hash $name) -ne $exercise.assets.posterSha256) { throw "Poster mismatch: $name" }
  }
  foreach ($asset in Get-ChildItem mobile/dist/assets -File) {
    if ((Zip-Hash ('assets/public/assets/' + $asset.Name)) -ne (Get-FileHash $asset.FullName -Algorithm SHA256).Hash.ToLowerInvariant()) { throw "Built asset mismatch: $($asset.Name)" }
  }
  $fonts = @(Get-ChildItem mobile/dist/fonts/vekira -File -Filter *.woff2)
  if ($fonts.Count -ne 16) { throw 'Missing original font files' }
  foreach ($font in $fonts) {
    if ((Zip-Hash ('assets/public/fonts/vekira/' + $font.Name)) -ne (Get-FileHash $font.FullName -Algorithm SHA256).Hash.ToLowerInvariant()) { throw "Font mismatch: $($font.Name)" }
  }
  foreach ($exercise in $manifest.exercises) {
    if ($exercise.motion.status -eq 'visual-approved') {
      if ((Zip-Hash ('assets/public' + $exercise.motion.preview)) -ne $exercise.motion.previewSha256) { throw 'Reviewed motion mismatch' }
    }
  }
  if ($archive.GetEntry('assets/public/sw.js')) { throw 'Web service worker must not be packaged' }
  if ((Zip-Hash 'assets/public/sql-wasm.wasm') -ne (Get-FileHash mobile/dist/sql-wasm.wasm -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'SQLite runtime mismatch' }
  if ((Zip-Hash 'assets/public/third-party/MuscleMap-LICENSE.txt') -ne (Get-FileHash public/third-party/MuscleMap-LICENSE.txt -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'MuscleMap license mismatch' }
  $result = [ordered]@{
    apk = $apkPath
    sha256 = (Get-FileHash $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
    bytes = (Get-Item $apkPath).Length
    appId = $config.appId
    webDir = $config.webDir
    remoteLoader = $false
    splashAutoHide = $config.plugins.SplashScreen.launchAutoHide
    reviewedPostersVerified = $manifest.exercises.Count
    originalFontsVerified = $fonts.Count
    builtAssetsMatch = $true
    sqliteRuntimeBundled = $true
    muscleMapLicenseVerified = $true
  }
  $json = $result | ConvertTo-Json
  $json | Set-Content .artifacts/apk-verification.json
  $json
} finally { $archive.Dispose() }
