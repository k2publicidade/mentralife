# -Release: signed Play Store bundle (.aab) + signed APK, using the upload key.
param([switch]$Release)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolsRoot = Join-Path $projectRoot '.mentra-private/android-tools'
$environmentPath = Join-Path $toolsRoot 'environment.json'
if (!(Test-Path -LiteralPath $environmentPath)) { throw 'Prepare o JDK/SDK com scripts/prepare-android-tools.ps1 antes de compilar.' }
$configuration = Get-Content -LiteralPath $environmentPath -Raw | ConvertFrom-Json
$env:JAVA_HOME = $configuration.javaHome
$env:ANDROID_HOME = $configuration.sdkRoot
$env:ANDROID_SDK_ROOT = $configuration.sdkRoot
$env:ANDROID_USER_HOME = $configuration.androidUserHome
$env:GRADLE_USER_HOME = $configuration.gradleUserHome
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
$logDirectory = Join-Path $projectRoot 'qa/mobile'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
Push-Location $projectRoot
try {
    & npm.cmd run mobile:sync
    if ($LASTEXITCODE -ne 0) { throw 'Empacotamento mobile falhou.' }
    Push-Location (Join-Path $projectRoot 'android')
    try {
        $tasks = if ($Release) { @('bundleRelease', 'assembleRelease') } else { @('assembleDebug') }
        # Windows PowerShell 5.1 turns native stderr (Gradle warnings) into terminating errors; let cmd write the log.
        $buildLog = Join-Path $logDirectory 'android-build.log'
        $androidDirectory = Join-Path $projectRoot 'android'
        $gradleWrapper = Join-Path $androidDirectory 'gradlew.bat'
        $gradleCommand = 'cd /d "' + $androidDirectory + '" && "' + $gradleWrapper + '" ' + ($tasks -join ' ') + ' --no-daemon --console=plain --stacktrace > "' + $buildLog + '" 2>&1'
        & cmd.exe /d /c $gradleCommand
        if ($LASTEXITCODE -ne 0) { throw 'Compilação Android falhou; consulte qa/mobile/android-build.log.' }
    } finally { Pop-Location }
    $apkPath = if ($Release) { Join-Path $projectRoot 'android/app/build/outputs/apk/release/app-release.apk' } else { Join-Path $projectRoot 'android/app/build/outputs/apk/debug/app-debug.apk' }
    if (!(Test-Path -LiteralPath $apkPath)) { throw 'O Gradle não gerou o APK esperado.' }
    & (Join-Path $env:ANDROID_HOME 'build-tools/35.0.0/apksigner.bat') verify --print-certs $apkPath
    if ($LASTEXITCODE -ne 0) { throw 'A assinatura do APK não foi validada.' }
    & python scripts/verify-android-apk.py $apkPath
    if ($LASTEXITCODE -ne 0) { throw 'O conteúdo do APK não corresponde ao pacote mobile atual.' }
    Get-FileHash -LiteralPath $apkPath -Algorithm SHA256
    if ($Release) {
        $aabPath = Join-Path $projectRoot 'android/app/build/outputs/bundle/release/app-release.aab'
        if (!(Test-Path -LiteralPath $aabPath)) { throw 'O Gradle não gerou o AAB esperado.' }
        & (Join-Path $env:JAVA_HOME 'bin/jarsigner.exe') -verify $aabPath | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'A assinatura do AAB não foi validada.' }
        & python scripts/verify-android-apk.py $aabPath
        if ($LASTEXITCODE -ne 0) { throw 'O conteúdo do AAB não corresponde ao pacote mobile atual.' }
        Get-FileHash -LiteralPath $aabPath -Algorithm SHA256
        Write-Host "Bundle para a Play Store: $aabPath"
    } else { Write-Host "APK de teste gerado: $apkPath" }
} finally { Pop-Location }
