# Importação financeira CSV — 29/10/2026

Implementada a importação revisada de entradas e saídas em reais por arquivo CSV. Não precisa de API bancária, DeepSeek ou gateway. O fluxo lê o arquivo no navegador; somente os lançamentos selecionados e confirmados são sincronizados com a conta Mentra existente.

## Uso

1. Em Meu dinheiro, escolha **Importar CSV**, uma conta manual ativa, o separador e um arquivo UTF-8 de até 200 KB/cem registros. Há modelo para download. Sem conta cadastrada, crie uma em Minhas contas.
2. Mapeie as colunas de data, descrição e valor. Colunas de tipo, categoria e identificador de origem são opcionais. Os cabeçalhos reconhecidos aparecem como sugestão, sempre sujeitos à revisão.
3. Escolha formato de data (ano-mês-dia ou dia/mês/ano), valor (vírgula decimal ou ponto decimal sem milhar), situação e forma de pagamento. Sem coluna de tipo, negativo é saída e positivo é entrada. Com coluna de tipo, use Entrada/Saída e valor positivo.
4. Confira cada registro, o destino, a situação e os totais. Erros, conflitos e registros já importados ficam indisponíveis para seleção; possíveis duplicidades começam desmarcadas. Selecione explicitamente apenas o desejado, marque a confirmação de revisão e guarde. Cancelar ou fechar não grava.

Exemplo com ponto e vírgula:

```csv
Data;Descrição;Valor;Categoria;Identificador de origem
2026-10-29;Exemplo de despesa;-25,90;Outros;exemplo-001
2026-10-29;Exemplo de entrada;100,00;Trabalho;exemplo-002
```

## Regras e limites

- Valores são tratados em centavos inteiros, sem arredondar frações de centavo, aceitar notação exponencial ou inventar datas. Saldo inicial desconhecido permanece desconhecido; previsões não alteram o resultado realizado.
- O importador aceita vírgula, ponto e vírgula ou tabulação escolhidos explicitamente; suporta aspas duplas escapadas e quebras de linha em células. Exige cabeçalhos únicos, até 25 colunas e mil caracteres por célula. Descrição vai até 300 caracteres; categoria até 80. Erros de estrutura/encoding recusam o arquivo; erros de registro são mostrados antes da seleção.
- Identificador único de origem é vinculado à conta manual escolhida. Repetir o mesmo identificador/conteúdo não duplica; alterações ou edições locais posteriores produzem conflito para conferência manual. Identificadores repetidos no arquivo invalidam ambas as linhas.
- Sem identificador, o mesmo arquivo/registro é reconhecido pelo hash. Em arquivos diferentes, semelhança de conta, data, tipo, valor e descrição produz aviso. Isso não prova duplicidade nem identifica toda repetição possível: a conferência do proprietário continua necessária.
- Lançamentos existentes não são sobrescritos. Revisão financeira alterada ou vencida após dez minutos é recusada. Todas as linhas selecionadas entram juntas na cópia da conta, seguindo o controle de conflitos e limites de armazenamento já existente. Aguarde “Alterações salvas” para confirmar a sincronização.
- Arquivo original, células não mapeadas e identificador externo em texto não são guardados. Os registros mantêm hash de origem e impressão do conteúdo para evitar repetições. Textos com fórmulas permanecem texto; a exportação CSV continua neutralizando fórmulas. Nenhum código do CSV é executado.

Importação de entradas/saídas não substitui os fluxos de transferência interna, baixa vinculada, cartões, faturas, parcelas, conversão de moeda ou restauração de backup da conta. Um relatório CSV pode perder relações que só o backup estruturado preserva. Transferências entre suas próprias contas precisam ser identificadas e excluídas do lote para não serem tratadas como renda/despesa comum.

Não há conexão bancária automática, Open Finance ou movimentação de dinheiro. Outros formatos e conectores financeiros continuam como expansão pendente do escopo histórico; a importação CSV não os certifica.

## Evidências e publicação

Testes do parser, regras financeiras, seleção/duplicidade/conflito, controladores e HTTP com D1 local e duas contas descartáveis. O teste HTTP confirma persistência do lote, revisão concorrente e isolamento entre contas. Navegador local: arquivo sintético pelo seletor real, mapeamento, revisão, confirmação e persistência; evidência em `qa/importacao-csv-revisao.png`. Conferir ainda os navegadores/aparelhos e ambiente remoto do lançamento.

Nenhuma migração nova: os campos de importação seguem no estado privado da conta; permanecem nove migrações no projeto. Roteiro geral em PENDENCIAS-PUBLICACAO.md. DeepSeek e gateway continuam nas últimas etapas.

Referência do formato de texto: [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180). As opções de separador e formato monetário desta implementação são explícitas na interface.
