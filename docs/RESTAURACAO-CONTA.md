# Cópia e restauração da conta — 29/10/2026

Fluxo local conferido pelo navegador real, com conta e arquivos sintéticos. Publicação, aparelhos e ambiente remoto continuam no roteiro de homologação. Este documento descreve o JSON de uma conta; o backup completo do D1 e sua quarentena estão em BACKUP-RESTAURACAO.md.

## Baixar os dados

Em Meu espaço → Sua cópia, com você:

- **Baixar cópia para restauração** espera a sincronização e baixa a organização confirmada no servidor, com seus originais, identificador da conta e revisão. O JSON compacto não inclui o histórico separado das integrações; isso evita que esse histórico ultrapasse o limite do restaurador.
- **Exportar meus dados** baixa a exportação completa, com organização e metadados/histórico da conta. Arquivos completos de até 7 MB também podem ser lidos pelo restaurador, mas somente o campo de organização será aplicado.

Os arquivos são JSON legível e não criptografado pelo aplicativo. Guarde-os em local privado. A exportação completa não inclui senha nem código de recuperação, mas pode conter saúde, documentos, conversas e outros dados pessoais. Não publique o arquivo como asset ou evidência de QA.

## Restaurar com revisão

1. Abra Restaurar uma cópia e selecione um JSON desta mesma conta. O arquivo pode ter até 7 MB; a organização continua limitada a 5 MB e cada original a 500 KB.
2. A comparação recebe foco e fica visível automaticamente. Confira adições, remoções e campos substituídos. Perfil, saúde e Momentos também mostram os campos alterados, incluindo opções de IA e conteúdo cristão. Resumos extensos são marcados como abreviados; baixe as duas cópias para conferir o conteúdo completo antes de decidir.
3. **Cancelar restauração** mantém os dados atuais. **Confirmar restauração** aplica a organização escolhida com controle de revisão do servidor. Se outra gravação ocorrer, o conflito exige nova comparação; não há substituição silenciosa.
4. Aguarde a confirmação do servidor. Falha depois da confirmação mantém uma cópia pendente para reenvio; não troca o conteúdo escolhido pela versão antiga. Em erro de rede/sessão/armazenamento, siga o painel de recuperação.

JSON inválido ou de outra conta é recusado antes da gravação. Um erro de arquivo não bloqueia uma conta sincronizada nem anuncia cópias pendentes inexistentes. Escolher outro arquivo ou sair da tela invalida leituras antigas; uma resposta atrasada não reabre a revisão nem troca o arquivo escolhido depois.

Originais carregados em fileData têm base64, conteúdo/extensão, MIME, tamanho e SHA-256 conferidos. PDFs próprios em pdfData também passam por verificação de formato/MIME/tamanho e hash quando informado. PDFs legados sem hash continuam aceitos se os demais dados forem consistentes; não há garantia criptográfica da origem de um JSON editável pelo proprietário. Bytes dos arquivos não são mostrados no resumo da comparação.

A restauração aplica somente organização e preferências da cópia. Assinatura, senha, sessões, dispositivos push, vínculos WhatsApp/Google e fila separada das integrações não são restaurados. Alterar/retirar um original na restauração também segue a revogação permanente dos links privados; restaurar o documento depois não reativa concessões revogadas.

## Evidência desta rodada

Pelo navegador: exportação real, alteração de objetivo sintético, seleção da cópia, cancelamento sem gravar, recusa de JSON inválido, revisão detalhada, confirmação e reload. Nova exportação após restaurar foi comparada: organização completa e assinatura idênticas à cópia inicial; quatro documentos originais, dois lançamentos e três compromissos preservados. A cópia compacta também foi baixada pelo navegador, aceita pelo parser e comparada exatamente com a organização inicial; seu envelope não contém assinatura nem histórico separado de integrações.

Falhas encontradas e corrigidas: leitura antiga substituindo arquivo recente; revisão que reaparecia após sair da tela; bloqueio indevido após JSON inválido; mudanças de configuração sem detalhamento; comparação fora da área visível. Testes de regressão reproduziram as falhas de concorrência antes da correção. Evidência visual sintética em `qa/restauracao-conta-revisao.png`, fora da hospedagem/pacote.

Ainda pendente: repetir em staging HTTPS e nos navegadores/aparelhos do lançamento, junto das condições de rede e recuperação operacional. DeepSeek e gateway seguem por último.
