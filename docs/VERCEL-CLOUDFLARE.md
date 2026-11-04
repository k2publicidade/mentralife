# Vercel + Cloudflare D1 — 29/10/2026

Decisão do proprietário: hospedar o site na Vercel e começar com `vercel.app`. Ainda não existe projeto remoto, URL definitiva ou banco remoto confirmado. O cadastro do administrador aguarda o e-mail do proprietário. DeepSeek permanece na penúltima etapa e gateway na última.

## Arquitetura preparada

- **Vercel:** interface estática, páginas de administração/compartilhamento/retorno OAuth, PWA e encaminhamento nativo de `/api/*`.
- **Cloudflare Worker:** autenticação, permissões, D1, APIs privadas, webhook assinado Meta, Workers AI e cron de lembretes. O banco fica ligado ao Worker por binding, sem token de administração do D1 no navegador ou na Vercel.
- **Mesmo endereço para o usuário:** cookies HttpOnly/Secure/SameSite, chamadas `/api`, links de documentos e retorno Google usam a origem pública estável da Vercel. A API valida a origem original do navegador; o proxy não a substitui.

O Worker exige um segredo entre os serviços antes de aceitar as APIs privadas pela Vercel. Comparação por hashes em tempo constante; cabeçalhos de IP encaminhados só são aceitos depois dessa autenticação. O cabeçalho de segredo é sobrescrito pela camada de roteamento Vercel, não fornecido pelo visitante. O endpoint de saúde e o webhook Meta continuam acessíveis diretamente; o webhook mantém sua própria autenticação.

## Configurações e segredo

| Onde | Nome | Valor/origem |
| --- | --- | --- |
| Worker, `vars` | `PUBLIC_ORIGIN` | Origem HTTPS definitiva `https://<projeto>.vercel.app` |
| Worker, secret | `VERCEL_ORIGIN_SECRET` | Valor já gerado em `.dev.vars.vercel` |
| Vercel, variável privada | `VERCEL_ORIGIN_SECRET` | Exatamente o mesmo valor, sem prefixo de variável pública |
| Vercel, variável | `MENTRA_WORKER_ORIGIN` | Origem HTTPS real do Worker, sem `/api` ou barra final |
| Vercel, variável | `PUBLIC_ORIGIN` | Mesma origem pública estável configurada no Worker |
| Worker, `vars` | `GOOGLE_CALENDAR_REDIRECT_URI` | Origem pública + `/calendar-callback` |

O arquivo privado não é copiado para os assets, upload Vercel ou pacote fonte. Não envie seu conteúdo pelo chat. As outras chaves já preparadas continuam separadas; a chave de backup não deve ir para nenhuma das hospedagens.

## Sequência de implantação

1. Autenticar as contas Cloudflare e Vercel. As autorizações nas páginas dos fornecedores são concluídas pelo proprietário.
2. Vincular/criar o projeto Vercel e obter o endereço estável `vercel.app`. Se houver mais de uma equipe/conta, selecionar a do proprietário. Confirmar o plano e as condições para o uso comercial pretendido.
3. Criar um D1 remoto dedicado à produção; criar também staging/restauração em bases separadas para a homologação. Não copiar dados de QA ou promover o banco local automaticamente.
4. Preparar a configuração usando o ID real e o endereço Vercel. Exemplo com campos a substituir (não é configuração já publicada):

```powershell
npm run prepare:deployment -- --environment production --database-id <UUID-real> --worker <nome-real-do-worker-e-banco> --hosting vercel --origin https://<projeto-real>.vercel.app
```

5. Aplicar as nove migrações no alvo correto, cadastrar `VERCEL_ORIGIN_SECRET` no Worker, publicar o backend e obter a URL real. Usar os comandos com `--config wrangler.production.jsonc`; nunca migrar/publicar usando o alvo local por engano.
6. Cadastrar as três variáveis Vercel da tabela em **Production**. Deploys de preview devem ter backend, banco e variáveis próprios; não liberar domínios arbitrários nem compartilhar dados de produção com previews.
7. Publicar pela CLI Vercel autenticada ou pelo projeto vinculado. `vercel.json` usa `npm run build:vercel`; a saída é `.vercel-public`. O build exige as origens HTTPS e o segredo válido. Ausência de variáveis interrompe o build.
8. Conferir cadastro, login/logout/recuperação, duas contas isoladas, upload/estado perto de 5 MB, exportação, originais, links privados, retorno OAuth e cookies na URL Vercel. Conferir preservação de corpos e cabeçalhos no proxy real. Executar `smoke:release` nessa URL. Não usar a suíte que remove contas contra clientes reais.
9. Homologar backup/restauração remotos, alertas e provedores/aparelhos. Cadastrar o webhook Meta diretamente no Worker, sem depender da proteção de previews Vercel. O cron continua na Cloudflare, não é duplicado na Vercel.
10. Configurar/testar DeepSeek; depois escolher, implementar e homologar o adaptador do gateway. Somente então liberar cobrança real.

## Publicação dos arquivos

`build:vercel` usa somente Node.js, prepara as bibliotecas locais de PDF/OCR, verifica sintaxe e copia os arquivos públicos permitidos. Não executa o empacotador Python nem publica a pasta `dist` inteira. `downloads`, `handoff`, dumps, diretórios privados, arquivos de ambiente e links simbólicos são excluídos/recusados. `.vercelignore` protege o upload do projeto e `.gitignore` exclui estados e saída locais da Vercel.

As rotas explícitas preservam `/admin`, `/share` e `/calendar-callback`; caminhos desconhecidos respondem 404. Respostas de API e páginas usam política sem cache, sem referrer e cabeçalhos de proteção. O `_headers` da Cloudflare não é presumido válido na Vercel; as políticas equivalentes estão em `vercel.json`.

## Evidência e limites

463 testes locais passaram, zero falhas e zero ignorados, com API/D1 local. Oito testes novos cobrem autenticação do proxy, tentativa de acesso direto, CSRF, corpo, URL pública, IP, cookie Secure, cadastro/sessão/logout, preparação do alvo e exclusão dos arquivos privados. Build público ensaiado com origens sintéticas; não representa um destino remoto existente.

O primeiro ensaio da suíte encontrou o servidor local desligado; foi iniciado novamente e a suíte completa passou. A saída pública é conferida contra o manifesto das dependências PDF/OCR e contra os segredos locais, sem exibir seus valores. As provas estão em `qa/`, fora dos pacotes.

Ainda dependem de acesso/autorização: criar D1/Worker/projeto Vercel, cadastrar variáveis e publicar. Os testes não certificam o encaminhamento real entre provedores, limites/custos, OAuth, Meta, IA ou entrega push. A documentação Vercel estabelece timeout de 120 segundos para proxy externo; homologar as operações longas na versão publicada.

Referências oficiais consultadas em 29/10/2026: [rewrites e proteção da origem](https://vercel.com/docs/routing/rewrites), [variáveis em rotas](https://vercel.com/docs/project-configuration/vercel-json), [limites Vercel](https://vercel.com/docs/limits), [Cloudflare D1](https://developers.cloudflare.com/d1/get-started/).
