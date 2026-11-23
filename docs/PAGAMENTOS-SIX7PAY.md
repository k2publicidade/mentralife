# Pagamentos com Six7Pay (PIX)

O gateway é a Six7Pay (API Paytime), estabelecimento **440627** — NEXO ENTRETENIMENTO E EVENTOS CULTURAIS LTDA. O guia de integração (PDF confidencial) fica com o proprietário e não entra no repositório.

## Como funciona

A Six7Pay não oferece link de pagamento nem webhook. Por isso a cobrança acontece dentro da tela **Assinatura**:

1. A pessoa escolhe o plano e toca em **Pagar com PIX**. O Worker lê o preço em centavos no catálogo administrável e registra o pedido em `six7pay_orders`.
2. O Worker cria a cobrança em `POST /paytime/transactions` com `payment_type: PIX`. O cabeçalho `Idempotency-Key` e o `reference_id` recebem o mesmo valor único (`mentra-<id>`). O QR Code vem de `GET /paytime/transactions/<id>/qrcode`.
3. A tela mostra o QR Code (quando a API devolve a imagem) e o código copia e cola. Ela consulta `/api/six7pay/order` a cada 5 s.
4. O Worker consulta `GET /paytime/transactions/<id>` no máximo a cada 10 s por pedido. O cron de cada minuto também confere os pedidos abertos: a cada 30 s na primeira hora e a cada 5 min depois. O plano é ativado mesmo que a pessoa feche a tela.
5. O status `PAID` com o valor igual ao do pedido libera 30 dias, registrado em `payment_events` (`six7pay:<transação>`). Uma confirmação repetida não estende o período.

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

## Ainda não implementado

- **Cartão de crédito.** Exige que os dados do cartão passem pelo servidor da Mentra, o que traz escopo PCI. O antifraude 3DS depende de SDK e de domínio autorizado pela Six7Pay.
- **Boleto.**
## Estornos e painel de pagamentos (/admin → Pagamentos)

- A tela lista os últimos 100 pedidos com conta, plano, valor e situação. Mostra também o saldo disponível e o saldo a liberar na Six7Pay e se o checkout está ligado.
- **Estornar** pede confirmação e chama `POST /paytime/transactions/<id>/reversal` com o valor integral e `Idempotency-Key: estorno-<pedido>`. Repetir o pedido não gera um segundo estorno. Os 30 dias daquele pagamento saem da assinatura (fica `canceled` se não sobrar período) e o estorno é registrado em `payment_events` e na Atividade.
- Estornos ou chargebacks feitos direto no painel da Six7Pay também são detectados. O cron reconsulta cada pagamento confirmado a cada 6 h durante 35 dias e aplica o mesmo ajuste uma única vez.
