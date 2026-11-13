# Pagamentos com PicPay

A tela **Assinatura** abre um link individual por compra. O Worker lê o preço em centavos do catálogo administrável, registra a conta e o plano no D1 e só ativa o acesso após o webhook autenticado confirmar o valor e o identificador do link.

| Plano | Preço inicial do catálogo |
| --- | ---: |
| Mentra Basic | R$ 27,00 |
| Mentra Advanced | R$ 47,00 |
| Mentra Delux | R$ 97,00 |

Cada pagamento confirmado libera 30 dias. A renovação é manual e o checkout de um novo plano fica disponível após o fim do período ativo. O sistema registra estornos parciais e estornos totais de períodos anteriores para conciliação. Um estorno total do período vigente retira o crédito daquele pagamento.

## Ativação

1. No [Painel Lojista](https://painel-negocios.picpay.com), abra **Integrações → Link de pagamento** e obtenha as credenciais dessa integração. Valide a criação de um link, pois obter um token OAuth não confirma acesso à API de cobranças.
2. Aplique a migração `0012_picpay.sql` com `npm run db:production` antes de ativar o checkout. Publique o Worker e a interface pelo fluxo existente.
3. Na configuração de webhook de **Link de pagamento**, cadastre `https://mentralife.vercel.app/api/picpay/webhook` ou a URL HTTPS correspondente ao ambiente. Ao salvar, o painel gera a API Key enviada no cabeçalho `authorization`. [Documentação do webhook](https://developers-business.picpay.com/payment-link/docs/webhook)
4. Cadastre `PICPAY_CLIENT_ID`, `PICPAY_CLIENT_SECRET` e `PICPAY_WEBHOOK_TOKEN` como segredos do Worker. Por exemplo, use `npx wrangler secret put PICPAY_WEBHOOK_TOKEN --config wrangler.production.jsonc` e informe a API Key na entrada interativa. Repita para as outras duas variáveis.
5. Em homologação, use um banco separado, credenciais de sandbox e `PICPAY_ENV=sandbox`. Confira o valor do link, o retorno para a tela de planos e a ativação após o webhook. [Configuração da sandbox](https://developers-business.picpay.com/payment-link/docs/sandbox/setting_up)
