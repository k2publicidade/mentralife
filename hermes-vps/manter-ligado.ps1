# Mantem o WhatsApp da Mentra (Hermes) ligado 24 horas nesta VPS, sem depender de janela aberta nem de logon.
# Rode no PowerShell da VPS (como Administrador):   powershell -ExecutionPolicy Bypass -File .\manter-ligado.ps1
# Pode rodar de novo a qualquer momento: ele mostra o diagnostico e reinicia o servico.
$ErrorActionPreference = 'Stop'
$home_ = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:LOCALAPPDATA 'hermes' }
$bin = Join-Path $home_ 'bin'
$logs = Join-Path $home_ 'logs'
$taskName = 'Mentra WhatsApp (Hermes)'
function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Gateway-Processes {
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -match 'hermes' -and
    ($_.CommandLine -match '\bgateway\b' -or $_.CommandLine -match 'whatsapp') -and $_.CommandLine -notmatch 'manter-ligado'
  })
}

Step '1/5 Hermes'
if (-not (Get-Command hermes -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $bin 'hermes.cmd'))) { $env:Path = "$bin;$env:Path" }
$cmd = Get-Command hermes -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $cmd) { throw 'O comando hermes nao foi encontrado. Rode instalar.ps1 primeiro.' }
$hermesExe = $cmd.Source
Write-Host "  $hermesExe"

Step '2/5 Diagnostico (como estava antes de mexer)'
$running = Gateway-Processes
if ($running.Count) { Write-Host "  Processos do Hermes em execucao: $($running.Count)" } else { Write-Host '  O Hermes NAO estava em execucao. Por isso o WhatsApp nao respondia.' -ForegroundColor Yellow }
$paired = $false
foreach ($creds in @((Join-Path $home_ 'platforms\whatsapp\session\creds.json'), (Join-Path $home_ 'whatsapp\session\creds.json'))) {
  if (-not $paired -and (Test-Path $creds)) {
    try { $me = (Get-Content $creds -Raw | ConvertFrom-Json).me.id; if ($me) { $paired = $true; Write-Host "  Numero pareado: $(($me -split '[:@]')[0])" } } catch {}
  }
}
if (-not $paired) { Write-Host '  ATENCAO: nao ha numero pareado nesta VPS. Rode "hermes whatsapp", leia o QR Code e rode este script de novo.' -ForegroundColor Yellow }
$gatewayLog = Join-Path $logs 'gateway.log'
if (Test-Path $gatewayLog) { Write-Host '  Ultimas linhas de gateway.log:'; Get-Content $gatewayLog -Tail 15 | ForEach-Object { Write-Host "    $_" } }
try { $h = Invoke-RestMethod 'https://mentralife.trapgerador-k2.workers.dev/api/health' -TimeoutSec 20; Write-Host "  Servidor da Mentra: $($h.status)" }
catch { Write-Host "  ATENCAO: esta VPS nao alcancou o servidor da Mentra: $($_.Exception.Message)" -ForegroundColor Yellow }

Step '3/5 Encerrando instancias antigas (duas ao mesmo tempo derrubam uma a outra)'
try { Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop } catch {}
foreach ($p in (Gateway-Processes)) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }
Start-Sleep -Seconds 3

Step '4/5 Servico automatico'
New-Item -ItemType Directory -Force $logs | Out-Null
$serviceLog = Join-Path $logs 'mentra-servico.log'
$runner = Join-Path $home_ 'mentra-servico.ps1'
$runnerBody = @"
`$env:Path = '$bin;' + `$env:Path
`$log = '$serviceLog'
if ((Test-Path `$log) -and (Get-Item `$log).Length -gt 20MB) { Remove-Item `$log -Force }
"== inicio `$(Get-Date -Format s)" | Out-File `$log -Append -Encoding utf8
& '$hermesExe' gateway *>> `$log
"== fim `$(Get-Date -Format s) codigo `$LASTEXITCODE" | Out-File `$log -Append -Encoding utf8
"@
[IO.File]::WriteAllText($runner, $runnerBody, (New-Object Text.UTF8Encoding($true)))
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`""
# Liga com o Windows e confere a cada 5 minutos: se o Hermes tiver caido, sobe de novo.
$boot = New-ScheduledTaskTrigger -AtStartup
$watch = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# S4U: roda com este usuario mesmo sem ninguem logado, sem guardar senha.
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($boot, $watch) -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "  Tarefa '$taskName' criada e iniciada."

Step '5/5 Conferencia (aguarde 60 segundos)'
Start-Sleep -Seconds 60
$running = Gateway-Processes
$state = (Get-ScheduledTask -TaskName $taskName).State
Write-Host "  Estado da tarefa: $state | processos do Hermes: $($running.Count)"
if (Test-Path $serviceLog) { Write-Host '  Ultimas linhas do servico:'; Get-Content $serviceLog -Tail 20 | ForEach-Object { Write-Host "    $_" } }
if ($state -eq 'Running' -and $running.Count) {
  Write-Host "`nPRONTO: o WhatsApp da Mentra esta ligado e volta sozinho apos queda ou reinicio." -ForegroundColor Green
  Write-Host 'Pode fechar esta janela e desconectar o acesso remoto. Mande "oi" de um celular para testar.'
  Write-Host 'Importante: NAO rode "hermes gateway" manualmente nem "hermes gateway install" enquanto este servico existir.'
} else {
  Write-Host "`nNAO SUBIU. Copie tudo o que apareceu acima e envie para analise." -ForegroundColor Red
}
