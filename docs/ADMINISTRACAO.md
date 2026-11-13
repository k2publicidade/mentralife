# Administração — acesso e validação em 06/11/2026

O painel público de entrada é https://mentralife.vercel.app/admin. Sem sessão, mostra o formulário de login administrativo. O papel `admin` corresponde ao ADMIN MASTER exibido na interface; não há um segundo papel de superadministrador nem senha padrão.

## Conta definitiva do proprietário

1. O proprietário cadastra sua conta no site e define pessoalmente sua senha. Deve guardar o código de recuperação exibido uma vez.
2. Após confirmar com o proprietário o e-mail exato e conferir a conta no D1 de produção, o operador concede somente a essa conta o papel `admin`, conforme OPERACAO.md. A inscrição pública nunca concede administração.
3. O proprietário abre `/admin` e entra com o mesmo e-mail e senha. Também há atalhos na barra da conta e em Meu espaço.
4. Confirmar o acesso do proprietário antes de retirar permissões de contas administrativas antigas de teste. Não alterar a senha nem dados de outras contas.

Após o proprietário concluir o cadastro e autorizar explicitamente a liberação em 06/11/2026, a conta `centralmentra@nexogestaodenegocios.com.br` foi promovida de `user` para `admin` no D1 de produção. A alteração foi confirmada por consulta e registrada em `audit_log` como `admin_role_granted_by_operator`. Nenhuma senha foi criada ou alterada pelo operador. A entrada com a senha pessoal deve ser concluída pelo proprietário em `/admin`.

## Fluxo publicado

- Login com mensagem de senha incorreta; conta comum é desconectada da tentativa administrativa e recebe explicação sobre permissão.
- Sessão comum já aberta recebe opção de sair e usar outra conta.
- Identificação do administrador conectado e botão de saída, que revoga a sessão no servidor.
- Sessão expirada durante uma operação volta ao login. Falha de carregamento oferece nova tentativa.
- Recuperação com e-mail, código pessoal e nova senha; o retorno continua em `/admin`. Não há envio automático de recuperação por e-mail.
- Todas as APIs administrativas mantêm a verificação de papel no servidor.
- Busca literal por nome/e-mail usa `instr(lower(...),lower(?))`, evitando o limite de complexidade de padrões LIKE do D1 para e-mails longos. `%`, `_` e barras são tratados como texto.

## Evidência e publicação

- 513 testes aprovados, sem falhas ou testes ignorados, com a API/D1 local; sintaxe verificada.
- `node scripts/test-admin-browser.mjs`: 15 verificações em Chromium e WebKit, com contas sintéticas locais removidas ao final. Inclui senha errada, permissão, sessão persistente/expirada, busca por e-mail longo, gravação local do catálogo, atalho no perfil, recuperação, logout, indisponibilidade e largura móvel. O script recusa origem fora de loopback.
- Nove verificações públicas somente de leitura aprovadas após publicação. O formulário de login foi confirmado no navegador do endereço público.
- Teste autenticado com administrador sintético em produção não executado: a revisão automática recusou a criação/elevação temporária de privilégios pelo risco de acesso residual. Não foi tentado por outro caminho.
- Frontend Vercel: `dpl_HG2ELLCF1pW2tL36RumUfm3cjhnu`, READY. Pacote isolado da interface anterior, com alterações no acesso administrativo e nos atalhos; os outros módulos públicos foram preservados.
- Backend: conteúdo da versão publicada obtido pela API Cloudflare e alterado somente na consulta administrativa de usuários, via endpoint de conteúdo que preserva configuração/metadata. ETag resultante `4c5ba1fe30bf2da7d25c38e62764f290a3c179905a590790c200c8958a6b3efe`. Sem migração de produção ou publicação das funcionalidades nativas ainda em desenvolvimento.
- Artefatos de revisão e fonte anterior ficam em `.mentra-private/admin-release/`; capturas e log da suíte ficam em `qa/admin/` e `qa/admin-suite.log`. Essas pastas não são publicadas.

## Painel Admin Master (versão 2 — 12/11/2026)

Layout com menu lateral (barra inferior no celular) e cinco áreas, cada uma com endereço próprio:

| Área | Endereço | O que faz |
|---|---|---|
| Visão geral | `/admin#/inicio` | Indicadores, "Precisa da sua atenção" (contas aguardando, relatos novos, acessos vencendo ou expirados), assinantes por plano, conexões e atividade recente. |
| Contas | `/admin#/contas?status=pending` | Filtros por situação (Todas, Aguardando, Ativas, Expiradas, Canceladas), busca, uso de IA no mês. "Gerenciar" abre a gaveta da conta: ativação em 1 clique por 30 dias, plano, situação e duração (7, 30, 90, 180 dias, 1 ano ou outro valor), com prévia do resultado antes de salvar. |
| Planos | `/admin#/planos` | Edição dos três planos com prévia de como aparecem no site e aviso de alterações não salvas. |
| Feedback | `/admin#/feedback` | Relatos dos testers por situação (novo, lido, resolvido). |
| Atividade | `/admin#/atividade` | As 30 ações administrativas mais recentes (liberações, catálogo, relatos). |

API nova (somente administradores): `GET /api/admin/activity`; `GET /api/admin/users` aceita `status=active|pending|canceled|expired` e devolve `requests` (uso de IA no mês); `GET /api/admin/overview` devolve `insights`.
Ensaio de navegador: `node scripts/test-admin-browser.mjs` (banco local).
