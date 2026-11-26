# Conserta o config.yaml do Hermes que a primeira versao do instalar.ps1 regravou com a codificacao errada.
# Rode na VPS:   powershell -ExecutionPolicy Bypass -File .\reparar-config.ps1
param([string]$File)
$ErrorActionPreference = 'Stop'
if (-not $File) { $home_ = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:LOCALAPPDATA 'hermes' }; $File = Join-Path $home_ 'config.yaml' }
$strict = New-Object Text.UTF8Encoding($false, $true)
$text = $strict.GetString([IO.File]::ReadAllBytes($File))
$bytes = [Text.Encoding]::Default.GetBytes($text)
try { $fixed = $strict.GetString($bytes) } catch { Write-Host 'O arquivo nao tem o defeito de codificacao (ja esta correto ou o problema e outro); nada foi alterado. Rode: hermes config check'; exit 0 }
if ([Text.Encoding]::Default.GetString($bytes) -ne $text) { throw 'A conversao nao e reversivel neste arquivo; nada foi alterado.' }
if ($fixed -eq $text) { Write-Host 'O arquivo ja esta correto; nada a fazer.'; exit 0 }
$backup = "$File.antes-do-reparo"
Copy-Item $File $backup -Force
[IO.File]::WriteAllBytes($File, $bytes)
Write-Host "Consertado. Copia do arquivo anterior em $backup" -ForegroundColor Green
Write-Host 'Agora rode:  hermes config check'
