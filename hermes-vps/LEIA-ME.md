# WhatsApp da Mentra no Hermes (VPS Windows)

O Hermes Agent roda na VPS, fica conectado ao número de WhatsApp da Mentra e conversa com cada pessoa usando o DeepSeek. Os dados de cada pessoa continuam na conta dela no sistema Mentra: o plugin `mentra` consulta e grava lá, sempre na conta de quem escreveu.

```
Pessoa no WhatsApp ─► número da Mentra ─► Hermes na VPS (DeepSeek + plugin mentra)
                                              │  chamadas assinadas (HMAC)
                                              ▼
                              backend da Mentra: número → conta → dados e ações
```

## Instalar

1. Copie `mentra-hermes-vps.zip` para a VPS (copiar e colar pela Área de Trabalho Remota funciona) e extraia.
2. Abra o PowerShell na pasta extraída e rode:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
   ```

   O script instala o Hermes, pede a chave do DeepSeek, aplica a configuração e copia o plugin. O arquivo `mentra.env` (segredo que liga a VPS ao backend) é lido e apagado.
3. Conecte o número: `hermes whatsapp` mostra o QR Code. No celular da Mentra: WhatsApp › Dispositivos conectados › Conectar dispositivo.
4. Teste: `hermes gateway` (deixe a janela aberta) e mande "oi" de outro celular.
5. Para ficar ligado 24 horas (liga com o Windows, sem janela aberta, e sobe de novo se cair):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\manter-ligado.ps1
   ```

   Depois disso não rode `hermes gateway` nem `hermes gateway install`: duas instâncias com o mesmo número derrubam uma à outra.

## Atualizar (plugin ou personalidade novos)

1. Copie o `mentra-hermes-vps.zip` novo para a VPS e extraia por cima da pasta antiga.
2. Rode `instalar.ps1` (copia o plugin e o `SOUL.md`; não pede as chaves de novo).
3. Rode `manter-ligado.ps1` (reinicia o serviço com a versão nova).

## Como cada pessoa é atendida

- **Quem não tem conta vinculada** recebe a orientação para conectar o número pelo aplicativo (no máximo uma vez por dia) e não chega à IA.
- **Vincular:** no app (`https://mentralife.com.br`), o pop-up de passo a passo ou o botão *Conectar meu WhatsApp* da tela inicial abre o WhatsApp com `VINCULAR <código>`. `PARAR` desvincula.
- **Conversa:** cada mensagem recebe os dados da conta de quem escreveu. A IA pode cadastrar tarefas, compromissos, lançamentos, contas financeiras, contas a pagar ou a receber e recibos; tudo aparece no aplicativo, inclusive a conversa.
- **Fotos e PDFs:** o plugin envia o arquivo ao backend da Mentra, que lê o texto e devolve para a conversa. Fotos são lidas pelo DeepSeek (`deepseek-flash`, com visão), com o Workers AI da Cloudflare como reserva. PDFs com texto são lidos direto; PDFs escaneados (só imagem) vão à leitura de documentos do DeepSeek, e o arquivo é apagado de lá logo depois. Com isso a IA cadastra o comprovante, o boleto ou a conta e pode guardar o arquivo nos documentos da pessoa (`save_document`). Limites: leitura até 2 MB, arquivo guardado até 500 KB (fotos maiores são reduzidas automaticamente), 60 leituras por pessoa por dia.
- **Diagnóstico:** desde a versão 1.2.0 do plugin, cada arquivo recebido aparece no `gateway.log` (`mentra recebeu…`, `mentra lendo…`, `mentra leitura…`). Se a pessoa mandar algo que não abre, ela recebe uma orientação em vez de silêncio.
- **Recibos:** "faz um recibo de 250 que recebi do João pela pintura" registra o lançamento e cria o rascunho de recibo em PDF em Arquivos › Documentos › Recibos.
- **Limite do plano e assinatura** são conferidos pelo backend a cada mensagem.
- **Estilo das respostas:** o que o admin escreve em `/admin` › *Cérebro da IA* é enviado ao Hermes a cada mensagem. A personalidade fixa fica em `SOUL.md`.
- **Áudio:** o Hermes transcreve notas de voz se houver um provedor de transcrição configurado (`faster-whisper` local, ou `GROQ_API_KEY` no `.env`).

## Segurança (por que está configurado assim)

O Hermes foi feito para um único dono, não para vários clientes. O isolamento entre contas vem de quatro travas, todas aplicadas pelo `instalar.ps1`:

1. No WhatsApp a IA só tem as ferramentas do plugin `mentra`. Terminal, arquivos, navegador, agendamentos, memória e busca em conversas ficam desligados.
2. As ferramentas não recebem número nem conta como argumento: a identidade vem da sessão do Hermes e o backend confere o vínculo a cada chamada.
3. Memória do Hermes desligada, porque ela é compartilhada entre todas as conversas.
4. Comandos administrativos do chat (`/new`, `/sethome`…) bloqueados para clientes.

Não religue essas opções neste perfil. Depois de qualquer mudança de configuração, confira com `hermes tools --summary`.

## Arquivos

| Arquivo | Vai para |
| --- | --- |
| `plugin/mentra/` | `%LOCALAPPDATA%\hermes\plugins\mentra\` |
| `SOUL.md` | `%LOCALAPPDATA%\hermes\SOUL.md` |
| `mentra.env` | chaves em `%LOCALAPPDATA%\hermes\.env` |

Logs: `%LOCALAPPDATA%\hermes\logs\gateway.log` e, com o serviço do `manter-ligado.ps1`, `%LOCALAPPDATA%\hermes\logs\mentra-servico.log`.

## Limites conhecidos

- A conexão por QR Code é o WhatsApp Web não oficial: há risco de a Meta restringir o número. Use um número dedicado.
- O painel admin mostra o WhatsApp como conectado enquanto o Hermes está ligado; o QR Code aparece só no terminal da VPS, e o botão "Desconectar" do painel não atua no Hermes.
- Rode o número em um lugar só. O gateway antigo (`whatsapp-gateway/`) não deve ser ligado junto.
- Suporte a Windows Server não é citado na documentação do Hermes (ela fala em Windows 10/11). Se a instalação falhar, a alternativa é uma VPS Linux com o mesmo plugin.
