# Pagamentos com Six7Pay (PIX)

O gateway é a Six7Pay (API Paytime), estabelecimento **440627** — NEXO ENTRETENIMENTO E EVENTOS CULTURAIS LTDA. O guia de integração (PDF confidencial) fica com o proprietário e não entra no repositório.

## Como funciona

A Six7Pay não oferece link de pagamento nem webhook. Por isso a cobrança acontece dentro da tela **Assinatura**:

1. A pessoa escolhe o plano e toca em **Pagar com PIX**. O Worker lê o preço em centavos no catálogo administrável e registra o pedido em `six7pay_orders`.
2. O Worker cria a cobrança em `POST /paytime/transactions` com `payment_type: PIX`. O cabeçalho `Idempotency-Key` e o `reference_id` recebem o mesmo valor único (`mentra-<id>`). O QR Code vem de `GET /paytime/transactions/<id>/qrcode`.
3. A tela mostra o QR Code (quando a API devolve a imagem) e o código copia e cola. Ela consulta `/api/six7pay/order` a cada 5 s.
4. O Worker consulta `GET /paytime/transactions/<id>` no máximo a cada 10 s por pedido. O cron de cada minuto também confere os pedidos abertos: a cada 30 s na primeira hora e a cada 5 min depois. O plano é ativado mesmo que a pessoa feche a tela.
5. O status `PAID` com o valor igual ao do pedido libera os dias gravados no pedido (30, 90 ou 365), somados ao maior valor entre agora e o fim da vigência atual. Fica registrado em `payment_events` (`six7pay:<transação>`, com `days` e `promotional`). Uma confirmação repetida não estende o período.

### Preço, período e promoção

- O valor é decidido só pelo servidor em `POST /api/six7pay/checkout`. O cliente envia apenas o id do plano; qualquer valor enviado junto é ignorado.
- Preço promocional (`promoPriceCents`) só para quem nunca teve um pedido Six7Pay pago nem pagamento registrado em `payment_events`, inclusive dos planos antigos. Pedidos pagos e depois estornados também contam como já pagos.
- O pedido grava `amount` (valor cobrado), `days` e `promotional` (migração `0016_six7pay_periods.sql`). Mudar o catálogo depois não altera o que um pedido já criado libera. Pedidos antigos sem `days` valem 30 dias.
- Renovar antes de vencer é permitido. Contas liberadas pela administração sem data final não compram.
- `GET /api/plans` e `GET /api/me` devolvem, por plano, `regularPriceCents` (igual a `priceCents`), `promoPriceCents`, `days`, `chargeCents` (quanto esta pessoa pagaria agora) e `promotional`.

### Regras de segurança

- **Nenhuma cobrança é reenviada.** Se a API devolver `202 UNKNOWN`, cair a conexão ou responder 5xx, o pedido fica `unknown`. O Worker procura a tentativa pelo `reference_id` em `GET /paytime/dashboard/transactions?q=` e só aceita o item do estabelecimento `SIX7PAY_ESTABLISHMENT`.
- Uma recusa definitiva (4xx) marca o pedido como `failed`. A pessoa pode tentar de novo.
- Cada conta tem no máximo um PIX aberto. Escolher o mesmo plano de novo mostra o mesmo código.
- Pedidos sem pagamento após 8 h passam a `canceled`.
- A chave da API existe somente como segredo do Worker. Ela não vai para o navegador, para o app ou para o git.
- Os apps Android/iOS não mostram nem iniciam checkout (regras das lojas).

## Configuração

| Variável | Onde | Valor |
| --- | --- | --- |
| `SIX7PAY_API_KEY` | segredo do Worker | chave `ssp_…` do guia |
| `SIX7PAY_ESTABLISHMENT` | `vars` do Worker | `440627` |
| `SIX7PAY_CHECKOUT` | `vars` do Worker | `on` mostra o botão **Pagar com PIX**. Sem ele, a conciliação continua e o botão fica desligado. |

```powershell
npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
npx wrangler secret put SIX7PAY_API_KEY --config wrangler.production.jsonc
```

Cópia local da chave: `.mentra-private/six7pay-api-key` (fora do git e do deploy).

## Antes de ligar o checkout (`SIX7PAY_CHECKOUT=on`)

Siga a ordem do guia:

1. Saldo `GET /paytime/establishments/balance` responde 200.
2. Um PIX de valor baixo é criado e pago de um celular real.
3. O pedido aparece como `PAID` e a assinatura ativa sozinha.
4. O valor entra no saldo.

### Homologação concluída em 23/11/2026

Um PIX real de R$ 1,00 foi criado pelo código da Mentra e pago de um celular. Resultado:

- A Six7Pay confirmou `PAID` (R$ 1,00 cobrado, R$ 0,99 líquido).
- O plano foi ativado sozinho por 30 dias.
- A confirmação repetida não estendeu o período.
- O valor cai em D+1, conforme o plano D1.

Depois disso, `SIX7PAY_CHECKOUT` foi para `on` em produção.

### O que a API exige na prática (descoberto em 23/11/2026)

- **`interest` é obrigatório também no PIX.** O exemplo do guia omite o campo. Sem ele, a API responde `422 PAYTIME_ERROR` ("Falha na comunicação com o provedor de pagamento") e registra a tentativa como `UPSTREAM_ERROR`. A Mentra envia `interest: "STORE"`: o cliente paga exatamente o preço do plano e a taxa PIX sai do recebido. Com `CLIENT`, um PIX de R$ 5,00 custa R$ 5,03 ao cliente.
- **Com `STORE`, `amount` é o valor líquido e `original_amount` é o valor cobrado.** A conferência usa `original_amount`.
- A criação já devolve `emv` (copia e cola). A imagem só vem em `GET /transactions/<id>/qrcode` (`{"qrcode":"data:image/png;base64,…"}`).
- A consulta devolve `establishment.id`. A Mentra só aceita a transação quando ele é igual a `SIX7PAY_ESTABLISHMENT`.
- `GET /paytime/dashboard/transactions`, que o guia descreve como exclusiva do estabelecimento, também lista transações do estabelecimento **335886**. Reporte esse vazamento à Six7Pay. Por isso a conciliação filtra por `SIX7PAY_ESTABLISHMENT`.

## Cartão de crédito: teste grátis de 30 dias e renovação automática (26/11/2026)

Código em `server/card.mjs`, tela em `dist/card-ui.mjs`, migração `0018_card_trial.sql`. Ligado por `SIX7PAY_CARD=on` (`vars` do Worker).

- **Teste grátis:** conta nova, sem pagamento anterior, cadastra o cartão em Planos e autoriza a renovação automática. Ganha 30 dias (`LEGAL.trialDays`). Um teste por conta, por cartão e por CPF (`trial_claims`, só HMAC, apagado após 2 anos).
- **Verificação do cartão:** a Six7Pay só devolve o token numa cobrança real. O Worker cobra R$ 1,00 (`CREDIT`, `create_token: true`, `Idempotency-Key: mentra-cv-<id>`) e estorna na hora (`estorno-cv-<id>`). Estorno não confirmado fica `reversal_pending` em `card_verifications` e o cron tenta de novo. Verificação sem resposta é procurada pela referência e estornada se tiver sido aprovada.
- **Cobrança:** no fim de cada período (2 h antes), o cron cobra o plano pelo token, com o mesmo pedido do PIX (`six7pay_orders.method='card'`). Por isso estorno, arrependimento (7 dias após cada cobrança), retenção após exclusão e /admin valem para o cartão. Preço: promocional no primeiro período pago, regular depois.
- **Recusa:** novas tentativas em 1, 2 e 3 dias (`renewal_retry_days`). Depois disso para, e a pessoa vê o aviso em Planos e no pop-up. Trocar o cartão ou pagar PIX zera as tentativas.
- **Cancelar:** Planos ou Meu espaço → Cancelar renovação automática (`POST /api/card/renewal`), ou remover o cartão (`DELETE /api/card`). Nada mais é cobrado; o acesso vai até o fim do período.
- **Sem direito ao teste** (já pagou antes): "Assinar com cartão" (`POST /api/card` com `plan`) cobra o plano na hora e liga a renovação.
- **Dados guardados:** token da Six7Pay, bandeira, 4 últimos números, validade e dados do titular exigidos pela bandeira (nome, CPF, telefone, endereço) em `payment_methods`. Número e CVV passam pelo Worker só para a Six7Pay e nunca são gravados nem registrados em log (os testes conferem todas as tabelas).
- **3DS (antifraude):** desligado. Se o banco exigir autenticação (`analyse_status: WAITING_AUTH`), a pessoa é orientada a usar outro cartão ou PIX. Ligar o 3DS exige SDK e domínio autorizado pela Six7Pay.
- **Apps das lojas:** não mostram nem cadastram cartão (Apple 3.1.1).

| Variável | Onde | Valor |
| --- | --- | --- |
| `SIX7PAY_CARD` | `vars` do Worker | `on` liga o cartão |
| `CARD_FINGERPRINT_SECRET` | segredo do Worker | chave do HMAC de cartão e CPF (sem ela, usa a chave da Six7Pay) |

**Primeiro teste real:** com um cartão próprio, faça o cadastro do teste grátis em produção. Confira a cobrança de R$ 1,00 e o estorno na fatura e no painel da Six7Pay, e se o cartão aparece em Planos. A primeira renovação real acontece 30 dias depois.

## Ainda não implementado

- **PIX Automático (agendado):** a Six7Pay não oferece. Quem paga por PIX não tem teste grátis.
- **Boleto.**
## Estornos e painel de pagamentos (/admin → Pagamentos)

- A tela lista os últimos 100 pedidos com conta, plano, valor e situação. Mostra também o saldo disponível e o saldo a liberar na Six7Pay e se o checkout está ligado.
- **Estornar** pede confirmação e chama `POST /paytime/transactions/<id>/reversal` com o valor integral e `Idempotency-Key: estorno-<pedido>`. Repetir o pedido não gera um segundo estorno. Os dias liberados por aquele pagamento saem da assinatura (fica `canceled` se não sobrar período) e o estorno é registrado em `payment_events` e na Atividade.
- Estornos ou chargebacks feitos direto no painel da Six7Pay também são detectados. O cron reconsulta cada pagamento confirmado a cada 6 h durante 35 dias e aplica o mesmo ajuste uma única vez.
