# Instala e configura o Hermes Agent como o WhatsApp da Mentra nesta VPS Windows.
# Rode no PowerShell da VPS, dentro desta pasta:   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
# Pode rodar de novo a qualquer momento: ele só reaplica a configuração.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$home_ = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:LOCALAPPDATA 'hermes' }
$bin = Join-Path $home_ 'bin'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Ask-Secret($label) {
  $secure = Read-Host $label -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
}
function Set-EnvLine($file, $name, $value) {
  $lines = @(); if (Test-Path $file) { $lines = @([IO.File]::ReadAllLines($file, (New-Object Text.UTF8Encoding($false))) | Where-Object { $_ -notmatch "^\s*$name\s*=" }) }
  $lines += "$name=$value"
  [IO.File]::WriteAllLines($file, $lines, (New-Object Text.UTF8Encoding($false)))
}
function Invoke-Hermes { & $script:hermesExe @args; if ($LASTEXITCODE -ne 0) { Write-Host "  (aviso: 'hermes $($args -join ' ')' retornou $LASTEXITCODE)" -ForegroundColor Yellow } }

Step '1/6 Hermes Agent'
if (-not (Get-Command hermes -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $bin 'hermes.cmd'))) { $env:Path = "$bin;$env:Path" }
if (-not (Get-Command hermes -ErrorAction SilentlyContinue)) {
  Write-Host 'Instalando o Hermes (alguns minutos)...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  & ([scriptblock]::Create((Invoke-RestMethod 'https://hermes-agent.nousresearch.com/install.ps1'))) -NonInteractive -Channel stable
  $env:Path = "$bin;$env:Path"
}
if (-not (Get-Command hermes -ErrorAction SilentlyContinue)) { throw 'O comando hermes nao foi encontrado. Feche e abra o PowerShell e rode este script de novo.' }
$script:hermesExe = (Get-Command hermes -CommandType Application | Select-Object -First 1).Source
Invoke-Hermes --version

Step '2/6 Chaves (ficam somente nesta VPS, em .env)'
New-Item -ItemType Directory -Force $home_ | Out-Null
$envFile = Join-Path $home_ '.env'
$current = if (Test-Path $envFile) { [IO.File]::ReadAllText($envFile) } else { '' }
$kit = @{}
$kitFile = Join-Path $here 'mentra.env'
if (Test-Path $kitFile) { Get-Content $kitFile | ForEach-Object { if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+)$') { $kit[$Matches[1]] = $Matches[2].Trim() } } }
$api = if ($kit.MENTRA_API_URL) { $kit.MENTRA_API_URL } else { 'https://mentralife.trapgerador-k2.workers.dev' }
$secret = $kit.WHATSAPP_GATEWAY_SECRET
if (-not $secret -and $current -notmatch 'WHATSAPP_GATEWAY_SECRET=[a-f0-9]{64}') { $secret = Ask-Secret 'Cole o WHATSAPP_GATEWAY_SECRET da Mentra (64 caracteres)' }
if ($secret) { if ($secret -notmatch '^[a-f0-9]{64}$') { throw 'WHATSAPP_GATEWAY_SECRET invalido.' }; Set-EnvLine $envFile 'WHATSAPP_GATEWAY_SECRET' $secret }
Set-EnvLine $envFile 'MENTRA_API_URL' $api
if ($current -notmatch 'DEEPSEEK_API_KEY=\S+') {
  $key = Ask-Secret 'Cole a chave da API do DeepSeek (sk-...)'
  if (-not $key) { throw 'A chave do DeepSeek e obrigatoria.' }
  Set-EnvLine $envFile 'DEEPSEEK_API_KEY' $key
}
Set-EnvLine $envFile 'WHATSAPP_ENABLED' 'true'
Set-EnvLine $envFile 'WHATSAPP_MODE' 'bot'
# Todos podem escrever; quem nao tem conta vinculada e barrado pelo plugin Mentra antes de chegar a IA.
Set-EnvLine $envFile 'WHATSAPP_ALLOW_ALL_USERS' 'true'
Set-EnvLine $envFile 'WHATSAPP_GROUP_POLICY' 'disabled'
if (Test-Path $kitFile) { Remove-Item $kitFile -Force; Write-Host 'mentra.env aplicado e apagado desta pasta.' }

Step '3/6 Plugin Mentra e personalidade'
$plugin = Join-Path $home_ 'plugins\mentra'
New-Item -ItemType Directory -Force $plugin | Out-Null
Copy-Item (Join-Path $here 'plugin\mentra\*') $plugin -Recurse -Force
Copy-Item (Join-Path $here 'SOUL.md') (Join-Path $home_ 'SOUL.md') -Force

Step '4/6 Configuracao'
# Mantem o modelo ja configurado; so define o DeepSeek se ainda nao for o provedor.
$provider = (& $script:hermesExe config get model.provider 2>$null | Out-String).Trim()
if ($provider -notmatch 'deepseek') {
  Invoke-Hermes config set model.provider deepseek
  Invoke-Hermes config set model.default deepseek-flash
} else { Write-Host '  Modelo DeepSeek ja configurado: mantido.' }
Invoke-Hermes config set plugins.enabled '[mentra]'
# No WhatsApp a IA so tem as ferramentas da Mentra: sem terminal, arquivos, navegador, memoria ou busca em conversas.
Invoke-Hermes config set platform_toolsets.whatsapp '[mentra, no_mcp]'
Invoke-Hermes config set agent.disabled_toolsets '[terminal, file, browser, code_execution, cronjob, delegation, memory, session_search, skills, skills_hub, web, search, tts, image_gen, vision, todo, clarify]'
Invoke-Hermes config set memory.memory_enabled false
Invoke-Hermes config set memory.user_profile_enabled false
Invoke-Hermes config set stt.echo_transcripts false
Invoke-Hermes config set display.platforms "{whatsapp: {tool_progress: 'off', interim_assistant_messages: false}}"
Invoke-Hermes config set whatsapp.unauthorized_dm_behavior ignore
# Comandos administrativos (/new, /sethome...) ficam so com este identificador, que nao e de ninguem.
Invoke-Hermes config set platforms.whatsapp.extra "{allow_admin_from: ['0000000@s.whatsapp.net']}"
Invoke-Hermes config set platforms.whatsapp.home_channel "{platform: whatsapp, chat_id: '0000000@s.whatsapp.net', name: Operador}"
# Sem o cabecalho "Hermes Agent" nas respostas (gravado direto no config.yaml: string vazia nao passa bem pela linha de comando).
$configFile = Join-Path $home_ 'config.yaml'
$yaml = [IO.File]::ReadAllText($configFile, (New-Object Text.UTF8Encoding($false)))
if ($yaml -notmatch '(?m)^\s*reply_prefix:') {
  $pattern = '(?m)^(\s*)unauthorized_dm_behavior: ignore[ \t]*\r?$'
  $match = [regex]::Match($yaml, $pattern)
  if ($match.Success) {
    $indent = $match.Groups[1].Value
    $line = $indent + 'unauthorized_dm_behavior: ignore' + "`n" + $indent + 'reply_prefix: ""'
    $yaml = $yaml.Substring(0, $match.Index) + $line + $yaml.Substring($match.Index + $match.Length)
    [IO.File]::WriteAllText($configFile, $yaml, (New-Object Text.UTF8Encoding($false)))
  } else { Write-Host '  ATENCAO: adicione manualmente em config.yaml, dentro de "whatsapp:", a linha  reply_prefix: ""' -ForegroundColor Yellow }
}

Step '5/6 Conferencia'
Invoke-Hermes plugins list
Invoke-Hermes tools --summary

Step '6/6 Proximos passos'
Write-Host @'
1) Conecte o numero da Mentra (aparece um QR Code; deixe a janela larga):
     hermes whatsapp
   No celular: WhatsApp > Dispositivos conectados > Conectar dispositivo.

2) Teste em primeiro plano e deixe esta janela aberta:
     hermes gateway
   Mande "oi" de outro celular. Sem conta vinculada, a resposta deve ser a orientacao para conectar.

3) Para ligar sozinho quando o Windows iniciar:
     hermes gateway install
   A tarefa inicia no logon do usuario. Ative o logon automatico deste usuario na VPS
   (netplwiz) para que o WhatsApp volte sozinho depois de um reinicio.
'@
