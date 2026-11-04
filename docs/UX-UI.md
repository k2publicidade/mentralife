# Refinamento de UX/UI · 28/10/2026

A interface carrega `premium.css` depois dos estilos dos módulos. A camada centraliza o acabamento visual sem alterar regras de negócio. `experience.mjs` fornece Leitura ampliada, com preferência local independente dos dados da conta, acesso por teclado e estado anunciado por aria-pressed. O controle acompanha o cabeçalho após mudanças de rota.

Direção: verde profundo, marfim, dourado discreto, títulos editoriais, contraste legível, espaços generosos e ações com áreas de toque de 44–48 px. Marca e mascote originais preservados. Hovers usam movimentos curtos somente com mouse; entradas e diálogos usam transições suaves. A preferência de movimento reduzido desativa animações e rolagem suave.

Verificação: sintaxe aprovada; suíte com 330 testes aprovados, zero falhas e 2 ignorados. Inspeção no navegador da página inicial e leitura ampliada, finanças em 390 px e biblioteca em desktop. Sem transbordamento horizontal de página nas telas medidas. Testes com pessoas jovens e idosas ainda são necessários para validar usabilidade real; não foi feita certificação de acessibilidade.

Execução local: `npm run dev`, http://127.0.0.1:8787. Alterações locais, sem publicação remota.
