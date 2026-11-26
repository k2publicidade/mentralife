param([switch]$AcceptSdkLicense)
$ErrorActionPreference = 'Stop'
if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') { throw 'Este preparo portátil exige Windows x64.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolsRoot = Join-Path $projectRoot '.mentra-private/android-tools'
New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
function Get-VerifiedArchive($Name, $Url, $Sha256) {
    $archivePath = Join-Path $toolsRoot $Name
    if (Test-Path -LiteralPath $archivePath) {
        if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Sha256) { return $archivePath }
        throw "Arquivo existente com hash diferente: $Name. Confira o download antes de continuar."
    }
    $partialPath = $archivePath + '.partial'
    Write-Host "Baixando $Name do fornecedor oficial..."
    Invoke-WebRequest -Uri $Url -OutFile $partialPath
    if ((Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256) { throw "Checksum inválido: $Name" }
    Move-Item -LiteralPath $partialPath -Destination $archivePath
    return $archivePath
}
$jdkArchive = Get-VerifiedArchive 'microsoft-jdk-21.0.13.0.2-windows-x64.zip' 'https://aka.ms/download-jdk/microsoft-jdk-21.0.13.0.2-windows-x64.zip' 'c5706a9cf482ef1a0622a86eea5b13d557b07f04554572af061e2d02b58c0f99'
$cliArchive = Get-VerifiedArchive 'commandlinetools-win-15859902_latest.zip' 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
$jdkDirectory = Join-Path $toolsRoot 'jdk'
$cliDirectory = Join-Path $toolsRoot 'command-line'
if (!(Test-Path -LiteralPath $jdkDirectory)) { Expand-Archive -LiteralPath $jdkArchive -DestinationPath $jdkDirectory }
if (!(Test-Path -LiteralPath $cliDirectory)) { Expand-Archive -LiteralPath $cliArchive -DestinationPath $cliDirectory }
$jdkRoot = (Get-ChildItem -LiteralPath $jdkDirectory -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } | Select-Object -First 1).FullName
if (!$jdkRoot) { throw 'JDK extraído não contém java.exe.' }
$sdkRoot = Join-Path $toolsRoot 'sdk'
$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_USER_HOME = Join-Path $toolsRoot 'android-user'
$env:GRADLE_USER_HOME = Join-Path $toolsRoot 'gradle-cache'
$env:Path = (Join-Path $jdkRoot 'bin') + ';' + $env:Path
New-Item -ItemType Directory -Force -Path $sdkRoot,$env:ANDROID_USER_HOME | Out-Null
@{javaHome=$jdkRoot;sdkRoot=$sdkRoot;androidUserHome=$env:ANDROID_USER_HOME;gradleUserHome=$env:GRADLE_USER_HOME} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolsRoot 'environment.json') -Encoding utf8
& (Join-Path $jdkRoot 'bin/java.exe') --version
if (!$AcceptSdkLicense) { throw 'Revise os termos do Android SDK em https://developer.android.com/studio e execute novamente com -AcceptSdkLicense somente após concordar.' }
$sdkManager = Join-Path $cliDirectory 'cmdline-tools/bin/sdkmanager.bat'
$installLog = Join-Path $toolsRoot 'sdk-install.log'
1..20 | ForEach-Object { 'y' } | & $sdkManager "--sdk_root=$sdkRoot" 'platform-tools' 'platforms;android-36' 'build-tools;35.0.0' 'build-tools;36.0.0' *> $installLog
if ($LASTEXITCODE -ne 0) { throw "SDK Manager falhou. Confira $installLog" }
foreach ($required in @('platform-tools/adb.exe','platforms/android-36/android.jar','build-tools/36.0.0/aapt2.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $sdkRoot $required))) { throw "Componente ausente: $required. Confira $installLog" }
}
Write-Host 'JDK 21 e SDK Android 36 preparados na pasta privada; nenhuma configuração permanente do Windows foi alterada.'
