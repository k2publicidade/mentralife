# WhatsApp da Mentra: conversa individual por QR Code

Um único número de WhatsApp atende todas as contas. Cada pessoa conversa com a **sua** Mentra: a resposta usa só os dados da conta vinculada àquele número, o mesmo cérebro (DeepSeek + ações) do chat do aplicativo, a mesma cota do plano e o mesmo histórico.

> **Mudança em 19/11/2026:** o dono decidiu rodar o WhatsApp no **Hermes Agent, em uma VPS Windows**, com o DeepSeek conversando lá e os dados continuando nas contas da Mentra. O kit e o passo a passo estão em `hermes-vps/LEIA-ME.md`. O backend ganhou os eventos `gate`, `context`, `act`, `log` e `read` (leitura de foto ou PDF por OCR, `server/vision.mjs`) no mesmo endpoint assinado (`server/whatsapp-gateway.mjs`, seção "Agente externo"). O gateway Baileys descrito abaixo continua no projeto como alternativa, mas não deve rodar junto com o Hermes.

## Como funciona

```
Pessoa no WhatsApp ─► número da Mentra ─► gateway (whatsapp-gateway/, sessão por QR Code)
                                              │  POST assinado (HMAC) /api/whatsapp/gateway
                                              ▼
                                   Worker Cloudflare (server/whatsapp-gateway.mjs)
                                   número → conta → chat() → DeepSeek → resposta
```

- **Gateway** (`whatsapp-gateway/`): processo Node pequeno com Baileys. Só transporta mensagens. Não guarda dados de conta nem a chave da IA.
- **Backend** (`server/whatsapp-gateway.mjs`): confere a assinatura, encontra a conta pelo número, aplica assinatura ativa e limite do plano, chama `chat()` e grava a conversa em `messages` (aparece no chat do app).
- **Vínculo**: no app, o pop-up **Converse com a Mentra pelo WhatsApp** (ou o botão *Conectar meu WhatsApp* da tela inicial e de *Conexões e lembretes*) mostra o passo a passo, gera um código de 10 minutos e um botão que abre o WhatsApp com `VINCULAR <código>` pronto. `PARAR` desvincula.
- **Áudio**: notas de voz de até 2 MB são transcritas (Workers AI) e respondidas como texto.
- Número não vinculado ou sem assinatura ativa recebe uma orientação, no máximo uma vez por dia. Grupos, status e canais são ignorados.

## Conectar o número (QR Code)

1. Com o gateway ligado, abra `https://mentralife.com.br/admin`. O cartão **WhatsApp da Mentra** mostra o QR Code.
2. No celular da Mentra: WhatsApp › Configurações › Dispositivos conectados › Conectar dispositivo.
3. O cartão passa para **Conectado** e mostra o número. Para trocar de número, use *Desconectar e trocar número* e leia o novo QR Code.

No próprio servidor do gateway, o mesmo QR aparece em `http://127.0.0.1:3000` e nos logs.

## Orientar o cérebro da Mentra

Em `/admin` › **Cérebro da IA**, o Admin Master escreve em linguagem simples como a Mentra deve responder: um campo vale para o app e o WhatsApp, outro só para o WhatsApp (até 3.000 caracteres cada). Vale para todas as contas a partir da próxima mensagem e fica registrado em Atividade.

As orientações entram no prompt depois das regras fixas (`server/brain.mjs`, `server/chat.mjs`): mudam tom, formato e prioridades, mas não anulam o isolamento entre contas, as regras de ações nem os limites de saúde.

## Rodar no VPS (24 horas)

Qualquer VPS Linux pequeno (1 vCPU, 1 GB) com Docker serve. O gateway só faz conexões de saída: não precisa de domínio, HTTPS nem porta aberta.

```bash
# no seu computador: envie a pasta (sem node_modules e sem data)
scp -r whatsapp-gateway usuario@IP_DO_VPS:~/mentra-whatsapp

# no VPS
cd ~/mentra-whatsapp
nano .env            # MENTRA_API_URL e WHATSAPP_GATEWAY_SECRET (veja .env.example)
docker compose up -d --build
docker compose logs -f   # acompanha a conexão; o QR também aparece aqui
```

A sessão fica no volume `mentra-whatsapp-data`. Reiniciar o contêiner ou o VPS não pede novo QR Code. Rode o gateway em **um lugar só**: duas instâncias com a mesma sessão derrubam uma à outra.

## Configuração

| Onde | Nome | Valor |
| --- | --- | --- |
| Worker (secret) | `WHATSAPP_GATEWAY_SECRET` | 64 caracteres hexadecimais |
| Gateway (`.env`) | `WHATSAPP_GATEWAY_SECRET` | o mesmo valor |
| Gateway (`.env`) | `MENTRA_API_URL` | origem do Worker (`https://….workers.dev`) |

Para trocar o segredo: gere um novo, cadastre com `wrangler secret put WHATSAPP_GATEWAY_SECRET --config wrangler.production.jsonc`, atualize o `.env` e reinicie o gateway.

## Limites conhecidos

- A sessão por QR Code usa o WhatsApp Web de forma não oficial. A Meta pode restringir números com comportamento de robô. O gateway reduz o risco (só responde a quem escreve, sem disparos, um aviso por dia a desconhecidos), mas ele existe. A API oficial (`server/whatsapp.mjs`, já no projeto) é o caminho sem esse risco, porém sem QR Code e com aprovação da Meta.
- Se a pessoa conversar no app e no WhatsApp no mesmo instante, o app mantém a versão local do histórico naquela sincronização.
- Imagens e documentos pelo WhatsApp ainda não são interpretados neste modo.

## Testes

`npm test` (inclui `tests/whatsapp-gateway.test.mjs`) e, dentro de `whatsapp-gateway/`, `npm test`.
