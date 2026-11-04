# Mentra Life — implantação e operação atual

Atualização de 29/10/2026. O produto usa Cloudflare Workers com D1; nove migrações. Não existe publicação em produção confirmada. Consulte PENDENCIAS-PUBLICACAO.md antes de admitir clientes pagantes. A auditoria de código não substitui a implementação integral ou homologação dos 91 itens históricos.

## Destino escolhido pelo proprietário

Site na Vercel, inicialmente em `vercel.app`; API, D1, Workers AI e scheduler na Cloudflare. A integração foi preparada em vercel.json, scripts/build-vercel.mjs e server/hosting.mjs. O procedimento, variáveis e homologação estão em VERCEL-CLOUDFLARE.md. As seções Cloudflare abaixo continuam necessárias para o backend; não significam hospedar a interface lá como destino final. Ainda faltam autenticação, criação dos recursos e deploy.

## Funcionamento entregue

Contas individuais autenticadas têm estado privado dividido em partes transacionais no D1, com revisão otimista, identificador de operação e limite de 5 MB por conta. Arquivos PDF/PNG/JPEG podem ter até 500 KB. Não há R2. Contas novas começam vazias, sem conteúdo fictício.

Agenda tem calendário mensal, fuso IANA, séries limitadas a cem ocorrências, edição individual ou coletiva revisada, cancelamento e restauração. Tarefas têm prazo, adiamento e até três prioridades. Biblioteca mantém originais, contextos privados Pessoal/Empresa, categorias, favoritos e OCR revisado no navegador; links privados têm destinatário autenticado, expiração e revogação. Contexto Empresa não concede colaboração.

Finanças incluem contas manuais, lançamentos, transferências internas, compromissos/baixas, recorrências previstas, orçamento, PDF/CSV e importação CSV de entradas/saídas. Não há acesso bancário automático, movimentação de dinheiro, cartões, faturas ou parcelamento. Saúde, Impulso e Momentos usam dados informados e decisões revisadas pelo usuário.

WhatsApp de entrada, transcrição Workers AI, Web Push e Google Agenda de leitura estão implementados, com testes de contratos simulados. Configuração e testes com provedores/aparelhos reais continuam pendentes. Referências: INTEGRACOES.md, CALENDARIO-GOOGLE.md, LINKS-PRIVADOS.md e IMPORTACAO-FINANCEIRA.md.

## Desenvolvimento e verificação

```powershell
npm ci
npm run db:local
npm run dev
```

Use Node.js 24. Abra `http://127.0.0.1:8787`. O Wrangler atende os assets e a API; servidor estático Python não oferece a camada operacional. Python 3 é usado apenas no empacotamento. `.wrangler` contém dados locais de desenvolvimento e não é publicação remota.

```powershell
npm run check
$env:MENTRA_TEST_URL='http://127.0.0.1:8787'
npm test
npm run build
npm run smoke:release -- --url http://127.0.0.1:8787
```

A suíte HTTP cria/remove contas sintéticas; não aponte para clientes de produção. O smoke é somente leitura: confere entrada, schema, três planos, bloqueio anônimo das APIs privadas e indisponibilidade pública dos pacotes fonte/handoff. Não certifica login real, isolamento entre contas autenticadas, segurança integral ou provedores.

## Destinos separados na Cloudflare

1. O proprietário autentica a conta de hospedagem com `npx wrangler login`. Não há conta Cloudflare autenticada no ambiente verificado nesta rodada.
2. Crie D1s separados para staging e produção. Registre o identificador real de cada banco. Não substitua o ID local de `wrangler.jsonc`: ele continua destinado ao desenvolvimento.
3. Prepare o arquivo de cada alvo com `npm run prepare:deployment -- --environment staging --database-id ID-REAL --worker NOME-DO-WORKER --origin https://ORIGEM-DO-ALVO`. Repita com `--environment production` e outro ID/nome quando aprovado. O comando usa o exemplo de produção, não grava secrets e recusa sobrescrever arquivos ou compartilhar Worker/D1 entre os alvos. O modo restore-test prepara uma terceira configuração somente para ensaio isolado. A origem é opcional até conhecer o endereço HTTPS; define o retorno Google e não cria DNS/domínio automaticamente.
4. Confira conta, Worker, ID D1 e origem. Aplique `npx wrangler d1 migrations apply DB --remote --config wrangler.staging.jsonc`. Publique com `npx wrangler deploy --config wrangler.staging.jsonc`. Configure domínio/HTTPS conforme o endereço escolhido pelo proprietário.
5. Cadastre os secrets e bindings das integrações no alvo correto. O exemplo inclui binding AI, cron e observabilidade com query strings suprimidas e invocações automáticas desligadas. Não inclua chaves em `vars`, código ou assets.
6. Execute `npm run readiness -- --config wrangler.staging.jsonc` e `npm run smoke:release -- --url https://ORIGEM-DO-ALVO`. Readiness verifica formatos/presença local; não comprova que o secret está cadastrado no Worker nem autentica o provedor. Prossiga com o roteiro de homologação real.
7. Depois dos critérios de staging, backup/restauração e operação, repita os passos no arquivo de produção. `npm run db:production` e `npm run deploy:production` usam exclusivamente `wrangler.production.jsonc`.

Os textos ID-REAL/NOME-DO-WORKER/ORIGEM-DO-ALVO são marcadores, não valores para executar. O script não cria banco nem publica por conta própria. `.openai/hosting.json` pertence ao protótipo histórico; a identidade do Sites retornou project_not_found na verificação anterior. Ela não representa uma publicação válida deste backend.

## Configuração externa

Use `npx wrangler secret put NOME --config wrangler.staging.jsonc` para cadastrar cada secret no prompt seguro. Não envie chaves no chat. Configure produção separadamente depois da homologação.

- WhatsApp: application secret, access token, ID do número e versão Graph aceita; token de verificação já preparado no arquivo privado `.dev.vars.push`. Cadastrar webhook HTTPS e completar os requisitos da aplicação Meta.
- Áudio: binding Workers AI `AI`, autorização do operador e conta ativa. Não depende da chave DeepSeek.
- Push: par VAPID já preparado, contato real VAPID_SUBJECT e permissão do aparelho. A entrega real e suas restrições precisam ser testadas.
- Google Agenda: cliente OAuth, segredo e URI HTTPS exata `/calendar-callback`; chave de criptografia já preparada em `.dev.vars.calendar`. Autorizar/testar a conta pelo fluxo do produto.
- Backup: chave já preparada em `.dev.vars.backup`. É usada somente pela operação local, não deve ser cadastrada no Worker. Guarde uma cópia segura separada dos arquivos de backup.

Contas de QA, dados sintéticos e secrets de testes não devem ser liberados em produção. Readiness não converte um ambiente de teste em produção.

## Administrador e acesso

O proprietário cadastra sua conta sem senha padrão. Depois de confirmar sua identidade e o e-mail escolhido, promova somente essa conta pelo console SQL do D1 do alvo:

```sql
UPDATE users SET role='admin' WHERE email='EMAIL-EXATO-DO-PROPRIETARIO';
```

Entre novamente e abra `/admin`. O servidor verifica o papel em todas as APIs administrativas. O painel consulta usuários/uso, altera o catálogo dos três planos e permite liberar/suspender acesso para homologação. Essas ações ficam auditadas e não equivalem a pagamento aprovado.

Cadastro não verifica titularidade de e-mail; não há entrega transacional automática nem MFA próprio. O operador ainda precisa definir a proteção administrativa e aceitar/completar esses fluxos antes da operação pública. Contas recebem código pessoal de recuperação de 256 bits, exibido uma vez; somente hash fica no banco. Recuperar exige e-mail/código, troca a senha, gera outro código e revoga sessões e concessões. A alteração de senha desconecta sessões, revoga links emitidos e remove conexão de calendário. A permissão mantida no Google também pode ser removida nas conexões da Conta Google.

Cookies são HttpOnly, SameSite e Secure em HTTPS. Escritas exigem origem válida; consultas privadas usam o usuário da sessão. Senhas usam PBKDF2 com salt aleatório. Nada disso dispensa homologação HTTPS, revisão de segurança e procedimentos de incidente.

## Dados, sincronização e recuperação

Antes de enviar alterações, o app mantém uma cópia pendente no IndexedDB, separada por conta/aba. A confirmação do servidor remove somente a operação correspondente. Conflito, falha de sessão ou armazenamento pausa as edições; comparar e substituir exige revisão explícita. Resposta perdida pode ser repetida com o mesmo identificador, sem duplicar gravação.

Não há funcionamento integral offline. A cópia no navegador não é um backup independente nem criptografada pelo app; depende do perfil do navegador. Quando IndexedDB não está disponível, a interface informa que a cópia fica somente em memória. Exporte antes de fechar nessa situação. Meu espaço oferece cópia compacta para restauração e exportação completa. A cópia de organização pode ser revisada/restaurada somente na mesma conta, sem restaurar credenciais, assinatura ou fila separada das integrações. Resumos mostram os campos alterados e recebem foco; arquivos inválidos não bloqueiam a conta sincronizada. Originais com hash informado divergente, tipo/MIME ou tamanho inválido são recusados. Ver RESTAURACAO-CONTA.md.

Backup completo do D1 e restauração isolada com quarentena estão em BACKUP-RESTAURACAO.md. Retenção, frequência, RPO/RTO, cópia externa, exclusões posteriores e ensaio remoto continuam como decisões e verificações de operação. Nunca ligue um banco restaurado diretamente ao Worker público antes da reconciliação.

## IA, planos e cobrança — últimas etapas

Os três planos e suas cotas/preços são configuráveis no administrador. Alterar cota vale imediatamente para assinantes existentes, conforme aviso da interface. A seleção de plano não cobra e mantém a assinatura pendente. O proprietário ainda definirá valores e condições finais.

DeepSeek é a penúltima etapa: cadastrar DEEPSEEK_API_KEY no Worker, conferir o modelo disponível e homologar pedidos/cotas/falhas com conta ativa. Notas opcionais informadas explicitamente pelo usuário são incluídas somente quando habilitadas. Saúde e documentos não são anexados automaticamente; a orientação de um plano envia os campos mostrados na solicitação e não executa ações.

Gateway é a última etapa. Há tabelas de assinaturas/eventos, mas faltam escolha do fornecedor, checkout, webhooks verificados e idempotentes, vigência, renovação, troca/cancelamento, inadimplência e reembolso, com sandbox completo. O retorno do navegador nunca será prova de pagamento. Não admitir cobrança real antes desse ciclo e dos critérios de publicação.

## Monitoramento e liberação

GET `/api/health` confere D1 e schema, sem certificar provedores. Vincule alertas a um responsável real, defina custos/capacidade e ensaie o procedimento de incidente. Termos, privacidade, retenção e suporte exigem os dados reais do operador e aprovação do responsável. Não foram presumidos como resolvidos.

Documentos de referência: AUDITORIA-FUNCIONAL.md, PENDENCIAS-PUBLICACAO.md, DEPENDE-DO-OPERADOR.md e QA.md. Documentação oficial consultada: [exportação/importação D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [comandos Wrangler D1](https://developers.cloudflare.com/workers/wrangler/commands/d1/) e [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
