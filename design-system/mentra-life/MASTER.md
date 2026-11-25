# Design system do Mentra Life

O Mentra Life funciona como uma agenda pessoal. Quem chega a Hoje deve encontrar a agenda, as tarefas e os atalhos para os documentos. Nas áreas de trabalho, o nome da seção, o estado atual e a próxima ação orientam a navegação.

## Identidade

| Token | Valor | Uso |
| --- | --- | --- |
| Floresta | #173E32 | Navegação desktop, ação principal e abertura de Hoje |
| Papel | #FFFEFA | Cartões, navegação móvel e diálogos |
| Fundo | #F7F6F1 | Área de trabalho |
| Tinta | #203B32 | Texto principal |
| Seleção | #DFEBD9 | Destino ativo no celular |
| Foco | #27644E | Contorno de teclado em superfícies claras |
| Borda de ação | #849A83 | Limite visível de ações secundárias e campos |

Outfit é a família da interface, dos rótulos e dos dados. Fraunces identifica títulos e momentos editoriais. As fontes são locais e usam WOFF2. Use algarismos tabulares para valores comparáveis e mantenha as descrições em uma medida de até 65 caracteres.

## Componentes

- Ação principal preenchida em verde. Nomeie o resultado, como “Salvar tarefa”.
- Ação secundária com fundo claro e contorno. Use a mesma forma para ação textual e ação só com ícone. Ícones sem texto precisam de nome acessível.
- Link de texto sublinhado para navegação contextual. Links apresentados como cartões usam título claro, limite visível e feedback.
- Controles principais com pelo menos 44 px de altura. Em listas, permita que grupos de ações quebrem linha.
- Cartões comuns com raio de 16 px e borda leve. Reserve o verde em área ampla para a abertura de Hoje e a navegação desktop.
- Campos com rótulo visível, erro associado e valor preservado na revisão. Diálogos mantêm a interação no conteúdo aberto e devolvem o foco ao controle de origem.

## Estrutura

Desktop usa navegação lateral e conteúdo alinhado à esquerda. No celular, a barra inferior mantém Hoje, Vida, Impulso, Dinheiro e Mais. Destinos ativos têm contraste visual e indicação programática. Em Hoje, a ordem é abertura, atalhos, tarefas e agenda, bem-estar e detalhes das demais áreas.

## Verificação

Inspecione desktop e larguras de 320 a 430 px, incluindo texto ampliado, títulos longos e áreas seguras. Percorra formulários com teclado, teste retorno do foco, revisão, cancelamento e navegação pelo histórico. Confirme contraste, alvos de toque e comportamento com movimento reduzido.

O gerador UI/UX Pro Max foi usado como ponto de partida. Sua sugestão de vitrine com vídeo, vidro e azul escuro foi substituída pela estrutura operacional e pela paleta existente da Mentra. Os tokens de implementação ficam em dist/styles.css e dist/ux.css.
