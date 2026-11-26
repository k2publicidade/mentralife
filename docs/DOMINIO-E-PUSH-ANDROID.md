# Domínio e notificações Android — 05/11/2026

## DNS do domínio

A consulta autenticada da configuração da Vercel para `mentralife.com.br` retornou `misconfigured: true`, nenhum endereço A/CNAME ativo e servidores `a.auto.dns.br` / `b.auto.dns.br`. O proprietário confirmou acesso ao Registro.br.

Valores de primeira preferência retornados pela Vercel nesta consulta:

| Tipo | Nome na zona | Valor |
| --- | --- | --- |
| A | raiz / campo em branco | 216.198.79.1 |
| A | raiz / campo em branco | 64.29.17.1 |

No Registro.br, abra o domínio, a configuração de DNS e a edição da zona. Adicione os dois registros da raiz, mantendo os servidores DNS e os registros de e-mail existentes. A forma de representar a raiz varia conforme o editor; não use `www` nesses dois registros. Se o editor estiver no modo básico, consulte a opção de edição avançada antes de alterar a zona.

O CNAME recomendado pela Vercel foi `af4b576b9ed2b8e4.vercel-dns-017.com.`. Isso não significa que `www` já esteja associado ao projeto: esse subdomínio precisa ser adicionado/verificado no projeto antes de configurar seu CNAME.

Após salvar, avise no chat. A verificação técnica deve confirmar resolução, domínio válido na Vercel e certificado HTTPS; só então alinhar origem pública da API, configuração Vercel e retorno Google. Até essa conclusão, use https://mentralife.vercel.app. Não basta mudar o nome no navegador: a API valida a origem.

Fonte dos valores: API autenticada Vercel, configuração do domínio no projeto Mentra. Conferência operacional no [painel de domínios](https://vercel.com/k2publicidade2-9832s-projects/mentralife/settings/domains). Reconsultar antes de uma alteração futura, pois recomendações podem mudar.

## Preparar teste no Android com Chrome

1. Abra https://mentralife.vercel.app no Chrome do Android.
2. Crie sua conta por “Quero criar uma conta”. Guarde o código pessoal de recuperação mostrado uma única vez.
3. Informe no chat apenas o e-mail cadastrado. Não envie senha nem código de recuperação. A conta precisa estar elegível para ativar notificações; o operador pode conceder acesso temporário de QA enquanto PicPay não estiver integrado.
4. Na conta, abra “Caixa de entrada” e a aba “Lembretes”. Confira o fuso, o horário silencioso e quais avisos deseja receber.
5. Ative os avisos e permita as notificações quando o Chrome solicitar. O teste precisa dessa decisão no próprio aparelho; ela não foi executada remotamente.
6. Para um ensaio controlado, escolha uma tarefa sintética pendente e um horário futuro fora do silêncio. Salve as preferências e confirme que o dispositivo aparece conectado. Evite dados pessoais na tarefa de QA.
7. Saia da tela do site e bloqueie a tela sem forçar a parada do Chrome nas configurações do Android. Observe se o aviso genérico aparece e se tocar nele abre a Mentra.
8. Registre no chat se chegou, o horário aproximado e o modelo/versão do Android/Chrome. Depois será testado se concluir a tarefa ou desligar os avisos impede novas entregas.

As chaves VAPID, o cron e o contato `mailto:contato@mentralife.com.br` já estão configurados. Aceite do serviço push não comprova apresentação no aparelho. O teste com tela bloqueada, silêncio e cancelamento continua pendente até observar o Android.
