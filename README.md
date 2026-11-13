# Mentra Life · Android, iOS e web

Foco mobile: projetos nativos Capacitor em `android/` e `ios/`, interface compartilhada e instalação pela tela inicial. [Preparação, testes e pendências do app](docs/APP-MOBILE.md). Execute `npm run mobile:sync` para empacotar e sincronizar. A compilação, assinatura e homologação em aparelhos ainda precisam ser concluídas.

> Situação verificada em 05/11/2026: site online em https://mentralife.vercel.app. Veja o [relatório atualizado de auditoria](docs/RELATORIO-AUDITORIA-2026-11-05.md), com 482 testes aprovados, correção publicada e testada do contexto individual do DeepSeek, preços aprovados e pendências. As referências à publicação pendente abaixo descrevem o estado anterior; não representam o resultado desta verificação.

Aplicação web em português preparada para interface na Vercel e API/banco na Cloudflare Workers/D1, contas individuais isoladas, três planos configuráveis, painel administrativo e módulos de organização pessoal. Site e API publicados; DeepSeek individual homologado nos cenários descritos no relatório. Integrações externas e cobrança PicPay ainda têm pendências de implementação/configuração e homologação.

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

Publicado em 06/11/2026: [ações da Mentra por texto e áudio](docs/ACOES-DA-IA.md), com cadastro automático de tarefas, agenda, lançamentos e contas. As onze migrações foram aplicadas em produção. Áudio de despesa e tarefa foram homologados no site com Workers AI, DeepSeek e D1 reais, incluindo reenvio sem duplicação e isolamento de contas.


- Cadastro/login, recuperação por código pessoal, sessões HttpOnly, sincronização com revisão/idempotência e recuperação local de alterações.
- Agenda com séries e edição coletiva revisada; tarefas/prioridades; biblioteca privada com originais/OCR, recibos, links expiráveis por destinatário; finanças manuais e importação CSV revisada; saúde, planos Impulso e Momentos.
- Transcrição Workers AI homologada no fluxo de áudio do chat publicado. WhatsApp de entrada, Web Push e Google Agenda de leitura implementados, com pendências próprias de configuração e homologação.
- Três planos configuráveis e autorização de IA por assinatura/cota. Selecionar plano não cobra nem ativa assinatura. Não há gateway implementado; DeepSeek real com contexto individual testado localmente e via site público.
- Onze migrações D1. Backup criptografado, decriptação para restauração isolada, SQL de quarentena e preparação separada de staging/produção.

## Publicação e operação

Destino escolhido: Vercel com `vercel.app`, mantendo API, cron e D1 na Cloudflare. [Roteiro Vercel + Cloudflare](docs/VERCEL-CLOUDFLARE.md). `npm run build:vercel` gera apenas os arquivos públicos, com configuração e segredo entre serviços obrigatórios. Site em https://mentralife.vercel.app e API/D1 Cloudflare publicados. Domínio próprio ainda exige correção de DNS.

[Operação atual](docs/OPERACAO.md) · [Pendências exatas](docs/PENDENCIAS-PUBLICACAO.md) · [O que depende do proprietário](docs/DEPENDE-DO-OPERADOR.md) · [Auditoria dos 91 itens históricos](docs/AUDITORIA-FUNCIONAL.md)

[Banco de dados e isolamento por conta](docs/BANCO-DE-DADOS.md) · [Integrações](docs/INTEGRACOES.md) · [Google Agenda](docs/CALENDARIO-GOOGLE.md) · [Links privados](docs/LINKS-PRIVADOS.md) · [Importação financeira](docs/IMPORTACAO-FINANCEIRA.md) · [Backup D1](docs/BACKUP-RESTAURACAO.md) · [Restauração da conta](docs/RESTAURACAO-CONTA.md) · [QA](docs/QA.md)

Arquivos do protótipo histórico estão em `dist/handoff`, também excluídos dos assets públicos. Eles não substituem a documentação operacional atual. Não publique SQL, `.mentra-private`, `.dev.vars*`, `.env*`, banco local ou chaves.
