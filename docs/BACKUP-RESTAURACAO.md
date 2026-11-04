# Backup D1 e restauração isolada — 29/10/2026

Ferramentas de operação implementadas e ensaiadas com o D1 local. A exportação criptografada e restauração em base isolada preservaram os dados de oito tabelas conferidas, incluindo estado, partes de arquivos e concessões. Integridade SQLite e chaves estrangeiras passaram. Isso não comprova um ensaio remoto, uma política de retenção ou um RPO/RTO de produção.

## Arquivos privados e chave

A chave de recuperação já foi gerada em `.dev.vars.backup` como MENTRA_BACKUP_PASSPHRASE. Não precisa criar outra nem enviá-la no chat. Ela é usada somente pela ferramenta de backup, não pelo Worker. Guarde uma cópia segura fora dos backups e da máquina que os armazena. Perder a chave impede decifrar as cópias existentes.

`.mentra-private/` contém as cópias locais e SQL de ensaio; está excluída do Git e do pacote de código. As ferramentas recusam saídas em `dist` e, dentro do projeto, exigem `.mentra-private`. Saídas externas ao projeto exigem um diretório protegido escolhido pelo operador. A ferramenta não configura permissões/criptografia do disco do Windows.

O arquivo `.mlbk` usa gzip e AES-256-GCM com salt/IV aleatórios, chave derivada por scrypt e autenticação do cabeçalho/conteúdo. A senha também pode vir da variável de ambiente MENTRA_BACKUP_PASSPHRASE (24–1024 caracteres), sem argumento de linha de comando. Não há senha em logs ou no pacote fonte. Arquivos existentes não são sobrescritos.

## Exportar

Na raiz do projeto, depois de preparar o alvo e autenticar a Cloudflare:

```powershell
$backupStamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$backupFile=".mentra-private/backup-$backupStamp.mlbk"
npm run backup:export -- --remote --config wrangler.production.jsonc --out $backupFile
```

Para desenvolvimento, use explicitamente `--local --config wrangler.jsonc`. O comando não presume um alvo quando faltam `--local`/`--remote`. O ID do banco remoto precisa ser um UUID válido. Confira a conta e o ID escolhidos: formato válido não prova que é a base correta.

A exportação usa o Wrangler instalado no projeto, por argumentos sem shell. O SQL intermediário fica em `.mentra-private`, é criptografado por fluxo e removido ao concluir ou falhar. Uma interrupção abrupta do processo/máquina pode deixar intermediários; confira essa pasta antes de retomar e mantenha o disco protegido. O conteúdo do SQL e os valores de secrets não são impressos.

Copiar o `.mlbk` para armazenamento privado independente e definir retenção, frequência, responsável, testes periódicos e limites de tamanho/custo ainda dependem da operação. Nenhum agendamento ou cópia externa foi presumido como existente.

## Decifrar para ensaio

```powershell
npm run backup:decrypt -- --input $backupFile --out .mentra-private/restauracao-ensaio.sql
```

Escolha outro nome a cada ensaio. O SQL só recebe o nome final após autenticação criptográfica completa. Senha errada, arquivo adulterado/truncado ou conteúdo descompactado além do limite recusam a restauração e removem o parcial. O limite padrão é 500 MB de SQL; `--max-mb` permite um limite escolhido pelo operador, até 10.240 MB. O processamento é por fluxo; não carrega o banco inteiro na memória.

O SQL decifrado contém dados privados, hashes e credenciais de sessões do snapshot: não o publique, envie como asset nem inclua em pacotes. A existência do SQL não significa que a base já foi restaurada ou validada.

## Restaurar somente em base isolada

1. Preserve a base atual e registre o incidente, horário do backup, versão do aplicativo e alterações/exclusões posteriores. Mantenha a restauração sem Worker público nem cron.
2. Crie um D1 remoto novo e vazio, exclusivamente para o ensaio. Prepare configuração separada: `npm run prepare:deployment -- --environment restore-test --database-id ID-REAL-DA-COPIA --worker mentra-life-restore-test`. O preparo recusa compartilhar D1 ou nome de Worker com staging/produção. Não publique um Worker usando essa configuração.
3. Confira o ID desse D1 novo. Importe o SQL privado com `npx wrangler d1 execute DB --remote --config wrangler.restore-test.jsonc --file .mentra-private/restauracao-ensaio.sql`. Não execute contra produção ou uma base com dados existentes.
4. Aplique imediatamente a quarentena: `npx wrangler d1 execute DB --remote --config wrangler.restore-test.jsonc --file scripts/restore-quarantine.sql`. O dump desta versão já inclui o schema das nove migrações. Para snapshot antigo, complete as migrações compatíveis na base isolada antes de aplicar a quarentena atual; valide a compatibilidade, sem conectá-la ao serviço público.
5. Confira contagens, FKs, revisões, partes dos arquivos e hashes/originais, incluindo duas contas isoladas. Compare com o inventário do snapshot e registre tempo de exportação/restauração e qualquer divergência. Não use dados pessoais reais em evidências públicas.

A quarentena grava o bloqueio persistente `restore_quarantine` em product_settings. Enquanto existir, todas as APIs (inclusive cadastro/login/recuperação e webhook) respondem 503; `/api/health` indica recovery/quarantine e o scheduler não processa integrações. Isso mantém a cópia bloqueada caso seja ligada a um Worker antes da liberação operacional.

Também remove sessões, autorizações de calendário, vínculos/códigos WhatsApp e dispositivos push; revoga todos os links privados; desliga lembretes e cancela os pendentes. Mensagens de integração ainda não confirmadas são marcadas como descartadas para impedir reprocessamento automático, preservando payload para conferência do operador. Transcrições em processamento passam para falha. Originais e estado dos usuários são preservados. Não se recolhem arquivos já baixados nem se revogam automaticamente permissões guardadas pelos provedores externos.

## Antes de liberar a cópia

Reconciliar contas/documentos excluídos ou alterados depois do snapshot, credenciais antigas, assinaturas/vigências e eventos externos é obrigatório. A cópia pode conter dados que o usuário já havia removido; a quarentena não sabe quais exclusões aconteceram depois do backup. Revalidar identidade/acesso, rotacionar credenciais necessárias e reconciliar dados com a política de retenção e registros do incidente são etapas do responsável. Não marque esse trabalho como concluído só porque o SQL foi importado.

Somente depois dessa reconciliação, dos testes do alvo e da decisão operacional, o responsável remove o bloqueio **na base escolhida**:

```sql
DELETE FROM product_settings WHERE key='restore_quarantine';
```

A remoção do bloqueio não reativa links revogados nem reconecta dispositivos/calendários/WhatsApp. Cada vínculo exige novo fluxo explícito. O comando não é executado automaticamente pelo deploy ou pela ferramenta de backup. Faça o smoke de leitura, login/recuperação/isolamento e homologação dos provedores antes de admitir usuários.

## Evidência desta rodada e pendências

Ensaio real local: exportação Wrangler para arquivo criptografado (202.393 bytes), decriptação de SQL com metadados (357.861 bytes), restauração em SQLite separado e comparação exata de oito tabelas contra o D1 local. Depois foi aplicada a quarentena apenas na cópia: estados/originais preservados, sessões/links/conexões/envios desativados e integridade/FKs corretas. Artefatos ficaram em `.mentra-private`, fora da hospedagem e do ZIP fonte.

Testes automatizados cobrem criptografia, senha/adulteração/truncamento, limite, caminhos/symlinks, exclusividade do arquivo, limpeza de intermediários, separação de alvos e bloqueio de API/cron na quarentena. Falhas de exportação não anunciam backup concluído.

Pendências reais: autenticação Cloudflare; D1 e configuração remotos; cópia externa e retenção; responsável; RPO/RTO; ensaio remoto; reconciliação de exclusões/credenciais e retomada após incidente. DeepSeek e gateway permanecem no final do roteiro geral.

Referências oficiais: [importação/exportação D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [comandos D1](https://developers.cloudflare.com/workers/wrangler/commands/d1/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/). Os recursos remotos disponíveis na conta precisam ser confirmados na implantação.
