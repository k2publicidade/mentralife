# Jurídico e proteção de dados (26/11/2026)

Este documento descreve o que foi implementado para o lançamento e o que ainda depende do responsável. Os textos legais são um rascunho técnico fiel ao funcionamento do sistema e precisam de revisão de um advogado antes da publicação.

## Fonte única

[`dist/legal.mjs`](../dist/legal.mjs) concentra:

- **`COMPANY`**: nome empresarial, CNPJ, endereço, e-mail, telefone, horário e encarregado.
- **`LEGAL`**: versões, idade mínima e prazos.
- **Textos**: Termos de Uso, Aviso de Privacidade e página de exclusão.

As páginas públicas são geradas com `node scripts/legal-pages.mjs`:

| Página | Rota |
|---|---|
| [`dist/termos.html`](../dist/termos.html) | `/termos` |
| [`dist/privacidade.html`](../dist/privacidade.html) | `/privacidade` |
| [`dist/excluir-conta.html`](../dist/excluir-conta.html) | `/excluir-conta` |

`npm run check`, `npm run build:vercel` e o teste `tests/legal.test.mjs` falham se as páginas estiverem desatualizadas.

`COMPANY` traz os dados do cartão CNPJ da Nexo Entretenimento e Eventos Culturais Ltda (68.825.713/0001-28), que oferece a Mentra Life.

- **Atendimento:** pelo e-mail contato@mentralife.com.br, todos os dias, 24 horas, de forma automatizada.
- **Telefone:** não é publicado. O Decreto 7.962/2013 exige endereço físico e eletrônico, e o telefone do cartão CNPJ é do contador.
- **Encarregado:** não há um nomeado. O canal do titular é o mesmo e-mail, com base na dispensa para microempresas (Resolução CD/ANPD nº 2/2022).

`build:vercel` recusa publicar sem nome empresarial, CNPJ, endereço, e-mail e horário. `MENTRA_ALLOW_LEGAL_DRAFT=1` libera o build mesmo assim, só para testes. O domínio continua registrado em nome de pessoa física (CPF); vale transferi-lo para o CNPJ.

Ao mudar um texto de forma relevante:
1. Troque `termsVersion` ou `privacyVersion` e `effectiveDate`.
2. Gere as páginas novamente.
3. Avise os usuários com pelo menos `changeNoticeDays` de antecedência.

Quem não aceitou a versão nova vê um aviso em Meu espaço e precisa aceitar antes de gerar um PIX.

## O que cada norma exige e onde está

| Exigência | Implementação |
|---|---|
| Decreto 7.962/2013, art. 2º (identificação) | Bloco "Quem oferece o serviço" em Planos (site e app), no rodapé do site, em Meu espaço → Sobre e contato e nos Termos |
| Decreto 7.962/2013, art. 4º (resumo e aceite antes de contratar) | Resumo acima do PIX (pagamento único, sem renovação, arrependimento). O PIX só é gerado com os Termos vigentes aceitos (`428`); a versão fica em `six7pay_orders.terms_version` |
| CDC, art. 49 (arrependimento) | Meu espaço → Desistir da compra. Até 7 dias após a confirmação do pagamento. Gera protocolo `ARR-…` na hora e pede o estorno integral à Six7Pay. Se a Six7Pay não confirmar, o pedido fica `requested` em `withdrawal_requests` e aparece no /admin (Pagamentos); o estorno manual conclui o pedido |
| Cancelamento e renovação | PIX não renova. Cartão renova automaticamente até a pessoa cancelar (Planos ou Meu espaço → Cancelar renovação automática, efeito imediato, sem multa). O teste grátis de 30 dias exige cartão e autorização expressa da cobrança automática; cancelando antes do fim, nada é cobrado. Ver [PAGAMENTOS-SIX7PAY.md](PAGAMENTOS-SIX7PAY.md) |
| Dados do cartão | Número e CVV nunca gravados; só token, bandeira, 4 últimos, validade e dados do titular exigidos pela bandeira. Marcadores HMAC de cartão e CPF por 2 anos contra testes repetidos (legítimo interesse, prevenção a fraude) |
| LGPD, arts. 7º e 11 (bases legais e dados sensíveis) | Aceite dos Termos no cadastro (`users.terms_version`, `consent_log`). Consentimento próprio para Saúde e bem-estar, pedido no primeiro uso e revogável, com botão para apagar os registros |
| LGPD, art. 33 (transferência internacional, DeepSeek/China) | Consentimento específico antes do primeiro uso da IA. Sem ele, o chat, o áudio, o WhatsApp e o agente Hermes recusam (`428`), e nada é enviado à DeepSeek |
| LGPD, art. 18 (direitos do titular) | Exportar dados (inclui pedidos, consentimentos e acessos), Apagar meus dados, Excluir minha conta, revogar consentimentos. Canal do encarregado no Aviso |
| LGPD, art. 16 (retenção) | Ao excluir a conta, os pagamentos vão para `retained_payments` (nome, e-mail e dados do pagamento) até 1º de janeiro do 6º ano. O cron apaga depois |
| Marco Civil, art. 15 | `access_log` (IP, data e hora de cadastro, entrada e recuperação), 6 meses, mantido mesmo após a exclusão |
| Apple 5.1.1(v) e Google Play (exclusão) | Exclusão dentro do app (Meu espaço) permitida mesmo com plano ativo ou pagamentos, e página web `/excluir-conta` com formulário e canal por e-mail |
| Apple 3.1.1 | O app nativo não vende e não mostra links nem preços na tela de planos. A identificação da empresa aparece sem links |

## As três ações (teste separado)

| Ação | Endpoint | Efeito |
|---|---|---|
| Não renovar | nenhum | Nada é cobrado. O acesso termina em `current_period_end` |
| Apagar meus dados | `POST /api/account/erase` (senha) | Apaga estado, partes, documentos, conversas, integrações, feedback e links de compartilhamento. Mantém conta, plano, pagamentos, cota, consentimentos e auditoria. Desconecta os outros aparelhos |
| Excluir minha conta | `DELETE /api/account` (senha) | Apaga tudo. Guarda os pagamentos em `retained_payments`. Só espera se houver um PIX em aberto |
| Desistir da compra | `POST /api/six7pay/withdraw` (`confirm:true`) | Estorno integral do último pagamento com até 7 dias e retirada dos dias liberados |

Os testes estão em `tests/legal.test.mjs`.

## Publicação

1. Faça o backup do D1 conforme [BACKUP-RESTAURACAO.md](BACKUP-RESTAURACAO.md).
2. Aplique a migração `0017_legal.sql` com `npm run db:production`.
3. Publique o Worker antes da interface. O Worker novo exige o aceite no cadastro; a interface antiga não envia o aceite e não conseguiria cadastrar.
4. Preencha `COMPANY`, rode `node scripts/legal-pages.mjs` e publique a Vercel.
5. Contas existentes começam sem aceite dos Termos vigentes e sem os consentimentos de IA e saúde. Elas veem os pedidos no primeiro uso; até autorizar, a IA fica bloqueada para elas.

## Formulários das lojas

- **URL de privacidade:** `https://mentralife.com.br/privacidade`
- **URL de exclusão de conta (Google Play):** `https://mentralife.com.br/excluir-conta`
- **Segurança dos dados (Google Play) e rótulos da App Store:**
  - Dados coletados: nome, e-mail, conteúdo do usuário, saúde e finanças informadas, áudio (só para transcrição), identificadores de aparelho para notificações e endereço IP.
  - Nenhum uso para publicidade ou rastreamento.
  - Criptografia em trânsito.
  - Exclusão disponível.

## Pendências do responsável

- **Cartão e renovação automática (26/11/2026):** Termos 2026-11-26.2 e Aviso 2026-11-26.3 descrevem o teste grátis, a verificação de R$ 1,00 estornada, a renovação e o cancelamento. O advogado deve revisar esses trechos, em especial a cobrança recorrente (dever de informação e cancelamento facilitado) e a retenção dos marcadores HMAC.

- Confirmar com o advogado se a empresa pode ficar sem encarregado nomeado. A dispensa da microempresa não vale para tratamento de alto risco, e o app trata dados de saúde com IA.
- O CNAE do CNPJ é de produção musical e eventos. Confirme com o contador a inclusão de um CNAE de software ou serviço digital para vender assinaturas e emitir notas.
- Confirmar que contato@mentralife.com.br recebe mensagens e responde automaticamente, como os Termos prometem.
- Revisão jurídica dos textos.
- Confirmar ou ajustar os parâmetros em `LEGAL`:
  - idade mínima de 18 anos;
  - backups por até 90 dias;
  - aviso de 15 dias antes de mudanças;
  - 5 dias úteis para estornos e cobranças.
- Os Termos prometem aviso por e-mail, mas o sistema não tem envio de e-mail transacional. Até haver um provedor, esses avisos precisam ser enviados manualmente.
- **WhatsApp:** a conversa usa sessão por QR Code (Hermes ou Baileys), não a API oficial do WhatsApp Business. Isso pode violar os termos do WhatsApp. Avalie a migração para a API oficial e nomeie o provedor da VPS no Aviso.
- **DeepSeek (China):** a transferência depende do consentimento. Um provedor com cláusulas-padrão da ANPD reduziria o risco.
- Cópias de segurança: definir retenção e descarte reais compatíveis com os 90 dias informados.
