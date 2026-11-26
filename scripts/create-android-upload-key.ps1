# Creates the Google Play *upload* key once, outside Git, in .mentra-private/android-signing/.
# With Play App Signing, Google holds the app signing key; this upload key can be reset via
# Play Console support if lost. Still: back up the folder to the owner's private storage.
param([string]$Alias = 'mentra-upload')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$environmentPath = Join-Path $projectRoot '.mentra-private/android-tools/environment.json'
if (!(Test-Path -LiteralPath $environmentPath)) { throw 'Prepare o JDK com scripts/prepare-android-tools.ps1 antes.' }
$javaHome = (Get-Content -LiteralPath $environmentPath -Raw | ConvertFrom-Json).javaHome
$signingRoot = Join-Path $projectRoot '.mentra-private/android-signing'
$storeFile = Join-Path $signingRoot 'mentra-upload.jks'
$propertiesFile = Join-Path $signingRoot 'keystore.properties'
if (Test-Path -LiteralPath $storeFile) { throw "Upload key já existe em $storeFile. Não sobrescrevo." }
New-Item -ItemType Directory -Force -Path $signingRoot | Out-Null
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
& (Join-Path $javaHome 'bin/keytool.exe') -genkeypair -v -storetype PKCS12 -keystore $storeFile -alias $Alias `
    -keyalg RSA -keysize 4096 -validity 10000 -storepass $password -keypass $password `
    -dname 'CN=Mentra Life, O=Mentra Life, C=BR'
if ($LASTEXITCODE -ne 0) { throw 'keytool falhou.' }
$escapedStore = $storeFile -replace '\\', '\\\\'
@(
    "storeFile=$escapedStore",
    "storePassword=$password",
    "keyAlias=$Alias",
    "keyPassword=$password"
) | Set-Content -LiteralPath $propertiesFile -Encoding ascii
Write-Host "Upload key criada em $signingRoot. Faça backup privado desta pasta; ela não vai para o Git."
