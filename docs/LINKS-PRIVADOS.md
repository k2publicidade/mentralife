# Links privados de documentos — 29/10/2026

Implementação local do requisito F41. A publicação remota e sua homologação continuam pendentes; DeepSeek e gateway não são necessários para este recurso.

## Uso

Na biblioteca, escolha **Links privados**, informe o e-mail de uma conta Mentra cadastrada e o prazo (uma hora, um dia ou sete dias). Revise nome/e-mail do destinatário e o arquivo antes de confirmar. Copie o endereço e entregue-o por seu canal de confiança. Nenhuma mensagem é enviada automaticamente. O endereço só é exibido na criação; se perdê-lo, revogue e crie outro.

O destinatário abre `/share#...`, entra na conta indicada e confirma o download. A posse da URL por outra conta não autoriza acesso. Compartilha-se somente o original PDF/PNG/JPEG de até 500 KB; OCR, notas e outros dados permanecem privados. O limite é vinte links ativos por proprietário. O cadastro ainda não verifica titularidade do e-mail: confira a identidade da conta na revisão.

## Proteções e limites

- Tokens aleatórios de 256 bits no fragmento da URL; somente hash SHA-256 armazenado no banco. Listagem e exportação da conta não contêm tokens nem endereços reutilizáveis.
- Sessão, destinatário, expiração, revogação, original e revisão da conta revalidados antes do download. Respostas privadas sem cache e sem referrer; entrada sem indexação e com CSP.
- Revogação, lixeira, exclusão, substituição do original e troca/recuperação da senha do proprietário invalidam acessos. Restaurar o original não reativa o link. Exclusão de conta remove concessões por chave estrangeira.
- Gravação do estado e revogação na mesma transação com controle de revisão. Se a criação de um link concorrer com a gravação da conta, o acesso novo pode ser revogado por precaução; gere outro após sincronizar.
- Repetir a mesma confirmação após perda de resposta recupera a operação sem duplicar concessões. Cancelar a revisão antes da confirmação não cria acesso.
- Revogar impede downloads futuros. Cópias já baixadas não podem ser recolhidas. Não existe confirmação de leitura nem compartilhamento anônimo.

## Evidência e publicação

Vinte novos testes: treze do backend, seis dos controladores e um HTTP com D1 local e duas contas descartáveis. Cobrem isolamento, original idêntico, expiração, revogação, concorrência, restauração sem reativação, limite e cancelamento. Revisão e cancelamento conferidos no navegador com dados sintéticos, sem conceder acesso a terceiros. Evidência visual local em `qa/links-privados-revisao.png` (fora do pacote público).

Aplicar as nove migrações atuais, incluindo `0008_document_shares.sql` e `0009_calendar.sql`, no D1 remoto. Homologar em staging HTTPS com contas de teste, inclusive login do destinatário, troca de conta, original, revogação e expiração. O endpoint de saúde exige a nova tabela. As evidências locais não certificam a operação remota.

Conectores externos de calendário/finanças e Mentra Empresas permanecem pendentes no escopo histórico. A implementação deste requisito não conclui o sistema inteiro. Pendências operacionais completas em PENDENCIAS-PUBLICACAO.md; DeepSeek e cobrança permanecem nas últimas etapas.
