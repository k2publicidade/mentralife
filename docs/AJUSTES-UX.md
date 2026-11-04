# Revisão de UX/UI — 29/10/2026

## Correções entregues

- Conexões separadas em abas WhatsApp, Áudio e Lembretes, com estados claros de configuração, privacidade em detalhes expansíveis e formulários agrupados. As abas funcionam com setas, Home e End. Rascunhos permanecem ao alternar abas e atualizar as conexões.
- Caixa de entrada com composição e revisão alinhadas, ações claras e estados vazios compactos. Perfil com preferências agrupadas, cartões laterais independentes e segurança/restauração em seções expansíveis.
- Controles, espaçamentos e títulos padronizados. Biblioteca com busca sem borda duplicada, filtros alinhados e cartões legíveis. Planos se empilham quando não há espaço para comparação e destacam a seleção atual.
- Conversa com campo e botão de envio acessíveis na área útil do celular, mensagens roláveis e sem bordas duplicadas. Rótulos de demonstração removidos da conversa e das tarefas na conta operacional.
- Criação de recibos com um título principal específico e retorno à biblioteca. Campos estreitos e formulários de modais passam para uma coluna em celulares.
- Administração com atalhos para visão geral, planos e contas, tipografia compartilhada, métricas compactas e controles de acesso legíveis em celular. Removido o redirecionamento que criava um ciclo entre `/admin` e `/admin.html`; ambos os endereços abrem o painel.
- Entrada pública conduz ao login; escolher um plano conduz ao cadastro com esse plano selecionado. Recuperação fica junto ao formulário. Navegação móvel destaca Mais nas áreas complementares. Barra da conta permanece visível durante a rolagem.

## Verificação realizada

**349 testes passaram, zero falhas e zero testes ignorados**, com `MENTRA_TEST_URL=http://127.0.0.1:8787`. Incluem teste de HTTP real para os dois endereços da administração e navegação de todas as telas principais no modo operacional sem alterar os dados da conta. Build e sintaxe verificados.

No navegador integrado, foram feitas **63 checagens de layout**: 21 rotas a 360 × 800, 768 × 1024 e 1280 × 900. Leitura ampliada ativada nas duas menores larguras e restaurada ao padrão ao terminar. Nenhuma página transbordou horizontalmente; os itens financeiros usam uma faixa de navegação com rolagem própria no celular. Não houve novos erros de JavaScript nessa rodada final.

Rotas: Hoje, Mentra IA, agenda, tarefas, biblioteca, criação de recibos, cinco áreas financeiras, três áreas de saúde, Impulso, formulário de ideia, Momentos, assinatura, perfil, menu e caixa de entrada. Administração e acesso público também foram inspecionados separadamente em desktop e celular.

Interações conferidas com conta sintética local:

- Abas das conexões por teclado, foco acompanhando a seleção, horário `11:15` preservado ao alternar e atualizar; rascunho devolvido a `09:00` sem salvar.
- Agenda: modal adaptado ao celular, Escape fecha e devolve foco ao botão que abriu o formulário.
- Login/cadastro: alternância e escolha de Plus preencheram o seletor corretamente; nenhum cadastro ou credencial foi enviado nessa inspeção.
- Chat: campo sem borda duplicada e botão de 44 px acima da navegação móvel; rascunho visual limpo sem envio.

Medições locais: `qa/ux-layout-2026-10-29.json`. Capturas de referência: `qa/ux-admin-desktop-2026-10-29.png`, `qa/ux-conexoes-mobile-2026-10-29.png`, `qa/ux-chat-mobile-2026-10-29.png`, `qa/ux-cadastro-mobile-2026-10-29.png` e `qa/ux-agenda-modal-mobile-2026-10-29.png`. Esses arquivos de QA ficam no workspace e são excluídos da hospedagem/pacote de código.

## Limites da verificação

Os tamanhos foram simulados no navegador integrado. Isso não certifica aparelhos Android/iOS, leitor de tela, zoom de 200%, entrega push, recebimento Meta, Workers AI ou fluxos de pagamento em produção. A matriz de publicação continua em `PENDENCIAS-PUBLICACAO.md`; as credenciais DeepSeek e o gateway continuam para o final. Nenhuma publicação remota foi realizada nesta revisão.

O ciclo da administração foi identificado no navegador e validado por HTTP após a correção. A configuração de URLs HTML dos assets segue o comportamento documentado pela [Cloudflare](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).


## Atalho de conteúdo e contraste — complemento de 29/10/2026

Reproduzida no navegador uma falha do link “Pular para o conteúdo”: a ativação por Enter substituía a rota por #main-content; recarregar levava à Home. Na tela de documento privado, o mesmo comportamento substituía o token no fragmento. O novo controlador preserva o endereço, resolve o marco atual após cada troca de tela, move o foco e rola sem animação; a margem considera a barra fixa da conta. Também corrigida a etiqueta da Home operacional que ainda chamava a caixa de entrada de demonstração.

Verificado com teclado na tela de planos: foco no conteúdo, URL #/planos mantida antes/depois de recarregar. Na página privada, um token sintético inexistente foi preservado antes/depois de recarregar; isso testa o atalho, não concede acesso nem comprova um compartilhamento válido. Três testes de regressão cobrem preservação do fragmento, ausência de destino e substituição do marco. Suíte com API/D1 local: 455 passaram, zero falhas e zero ignorados (qa/tests-accessibility-final.log). Evidência: qa/atalho-conteudo-planos.png.

Leitura das cores computadas em dez telas principais (perfil, Hoje, IA, Vida, dinheiro, saúde, Impulso, Momentos, conexões e planos): nenhum contraste de texto abaixo de 4,5:1 (ou 3:1 em texto grande) no subconjunto com fundos sólidos opacos verificados. Gradientes, imagens, opacidade, controles desabilitados e elementos ocultos foram excluídos; não é certificação de contraste de toda a interface. Medições: qa/contraste-texto-local.json. O atalho de zoom enviado pelo navegador integrado não mudou a escala medida; zoom 200%, leitor de tela e aparelhos continuam pendentes.
