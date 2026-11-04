# Mentra Life · Vercel + Cloudflare D1

Aplicação web em português preparada para interface na Vercel e API/banco na Cloudflare Workers/D1, contas individuais isoladas, três planos configuráveis, painel administrativo e módulos de organização pessoal. O projeto está implementado e testado localmente nos escopos documentados; publicação e homologação remota ainda estão pendentes. DeepSeek e gateway são as duas últimas etapas.

## Executar

Node.js 24, Python 3 (empacotamento) e npm:

```powershell
npm ci
npm run db:local
npm run dev
```

Abra `http://127.0.0.1:8787`. O servidor Wrangler atende interface e API. Servir somente `dist` com Python não executa cadastro, login, banco ou integrações.

## Verificar

```powershell
npm run check
$env:MENTRA_TEST_URL='http://127.0.0.1:8787'
npm test
npm run build
npm run smoke:release -- --url http://127.0.0.1:8787
npm run readiness
```

A suíte com `MENTRA_TEST_URL` cria/remove contas sintéticas: use apenas base de teste. `smoke:release` é somente leitura e serve para verificações básicas do alvo, sem certificar o produto inteiro. `readiness` identifica configuração pendente sem imprimir segredos nem publicar. Build gera o pacote local em `dist/downloads`, excluído da hospedagem pública.

## Implementação atual

- Cadastro/login, recuperação por código pessoal, sessões HttpOnly, sincronização com revisão/idempotência e recuperação local de alterações.
- Agenda com séries e edição coletiva revisada; tarefas/prioridades; biblioteca privada com originais/OCR, recibos, links expiráveis por destinatário; finanças manuais e importação CSV revisada; saúde, planos Impulso e Momentos.
- WhatsApp de entrada, transcrição Workers AI, Web Push e Google Agenda de leitura implementados; dependem de configuração e homologação com provedores reais.
- Três planos configuráveis e autorização de IA por assinatura/cota. Selecionar plano não cobra nem ativa assinatura. Não há gateway implementado; DeepSeek real aguarda chave e homologação.
- Nove migrações D1. Backup criptografado, decriptação para restauração isolada, SQL de quarentena e preparação separada de staging/produção.

## Publicação e operação

Destino escolhido: Vercel com `vercel.app`, mantendo API, cron e D1 na Cloudflare. [Roteiro Vercel + Cloudflare](docs/VERCEL-CLOUDFLARE.md). `npm run build:vercel` gera apenas os arquivos públicos, com configuração e segredo entre serviços obrigatórios. Nenhum destino remoto foi criado/publicado ainda.

[Operação atual](docs/OPERACAO.md) · [Pendências exatas](docs/PENDENCIAS-PUBLICACAO.md) · [O que depende do proprietário](docs/DEPENDE-DO-OPERADOR.md) · [Auditoria dos 91 itens históricos](docs/AUDITORIA-FUNCIONAL.md)

[Integrações](docs/INTEGRACOES.md) · [Google Agenda](docs/CALENDARIO-GOOGLE.md) · [Links privados](docs/LINKS-PRIVADOS.md) · [Importação financeira](docs/IMPORTACAO-FINANCEIRA.md) · [Backup D1](docs/BACKUP-RESTAURACAO.md) · [Restauração da conta](docs/RESTAURACAO-CONTA.md) · [QA](docs/QA.md)

Arquivos do protótipo histórico estão em `dist/handoff`, também excluídos dos assets públicos. Eles não substituem a documentação operacional atual. Não publique SQL, `.mentra-private`, `.dev.vars*`, `.env*`, banco local ou chaves.
