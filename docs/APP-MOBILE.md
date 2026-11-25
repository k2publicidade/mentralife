# Mentra Life para Android e iOS

O foco do produto passa a ser mobile. A interface compartilhada funciona na web, como app instalado pela tela inicial (PWA) e em projetos nativos Capacitor 8. O código nativo está em `android/` e `ios/`. O identificador inicial é `app.mentralife.mobile`; confirme sua titularidade antes do primeiro envio às lojas.

## Implementado

- Interface mobile com navegação inferior, campos com tamanho de fonte adequado ao toque, áreas seguras, adaptação ao teclado e modais limitados à área visível. O app instalado abre diretamente o acesso à conta.
- PWA: instalação orientada no iPhone/iPad, botão de instalação nos navegadores que oferecem esse recurso, ícones próprios e atalhos para agenda/tarefas.
- Registro único de service worker para push e página pública de ausência de conexão. A atualização aguarda o fechamento das janelas da versão anterior. Nenhuma resposta de API ou página autenticada entra no Cache Storage.
- App nativo: interface e PDF/OCR empacotados localmente, API HTTPS, HTTP nativo com sessão gerenciada pelos cookies HttpOnly do dispositivo, sem tokens no localStorage. Origem e proteção CSRF do servidor permanecem exigidas. Nenhum segredo Vercel/Cloudflare é incluído no app.
- Compartilhamento nativo de PDFs, originais, imagens e backups; a folha do sistema permite escolher o destino. Impressão usa essa mesma folha no app nativo. Arquivos temporários ficam no cache privado e os que têm mais de 24 horas são removidos na próxima abertura.
- Notificações APNs/FCM com permissão explícita, vínculo por conta, rotação do token, cancelamento e revalidação no servidor. Envio de áudio nativo preserva bytes e tipo do arquivo.
- Botão Voltar do Android fecha a janela aberta, retorna pela navegação ou minimiza o app na página inicial. Retomar o app sinaliza tentativa de sincronização.
- Identidade visual nos ícones e telas de abertura; backup Android desabilitado; tráfego HTTP simples desabilitado; manifesto iOS da API de timestamp utilizada pelo Filesystem.

No Windows com Android físico, veja também [compilação e teste Android](ANDROID-WINDOWS.md). Para publicar nas lojas, siga [LANCAMENTO-LOJAS.md](LANCAMENTO-LOJAS.md).

## Preparar e abrir

```powershell
npm ci
npm run mobile:sync
npm run mobile:android
```

O build consulta `https://mentralife.vercel.app` por padrão. Para outro ambiente, defina uma origem HTTPS que ofereça a mesma API `/api/`, antes de executar `mobile:sync`:

```powershell
$env:MENTRA_MOBILE_API_ORIGIN='https://seu-ambiente.example'
npm run mobile:sync
```

Não use o endereço direto do Worker protegido pelo segredo Vercel. A origem pública já encaminha as chamadas para o Worker. Não existe `server.url` remoto na configuração Capacitor: a interface faz parte do binário.

Android exige Android Studio, JDK 21 e SDK 36; o app suporta Android 8/API 26 ou superior. iOS exige Mac com Xcode; neste ambiente Windows apenas o projeto iOS e seus assets foram preparados. No Mac, execute `npm ci`, `npm run mobile:sync` e `npm run mobile:ios`; configure a equipe de assinatura no Xcode.

`npm run build:mobile` gera `.mobile-public/` e atualiza também o estágio público `.vercel-public/`, sem publicar nada. `mobile:sync` copia o pacote para ambos os projetos. Alterações em `dist/` precisam desse comando antes de compilar. Os diretórios gerados e as chaves de assinatura são ignorados pelo Git. Para regenerar a identidade visual, instale Pillow e execute `python scripts/mobile-icons.py`.

## Validação executável

```powershell
npm run check
npm test
npx playwright install chromium webkit
npm run test:mobile
npm run mobile:sync
node scripts/test-mobile-browser.mjs --packaged
```

O teste de navegador usa conta sintética e API simulada, nunca grava na produção. Verifica navegação sem estouro horizontal em 320, 390, 430 e 844 pixels, erros JavaScript, fonte dos campos e fallback offline nos motores Chromium e WebKit. As capturas ficam em `qa/mobile/`. Isso não substitui testes do WebView, cookies e plugins em Android/iPhone reais.

Validação em 06/11/2026: 515 testes aprovados, 6 testes de integração não executados, 92 verificações da interface web e 96 verificações do pacote em Chromium/WebKit com adaptador nativo simulado. Estas últimas executam OCR português real e extração real de PDF usando os arquivos destinados ao app. Também cobrem a entrada administrativa empacotada e os fallbacks necessários ao iOS 15.0. Não substituem testes dos plugins nos aparelhos.

O APK de desenvolvimento foi compilado e assinado: `android/app/build/outputs/apk/debug/app-debug.apk` (36.559.164 bytes), SHA-256 `7e5dc5ba1a5f2c5d89e3eda915d8e022ba822834ef13c2357fc7c89cb7b21e87`. A verificação confere os 304 assets públicos, incluindo os dois loaders gerados pelo Capacitor, e rejeita diferenças, arquivos inesperados ou áreas privadas. A assinatura foi validada pelo apksigner.

A verificação do APK revelou que o AAPT descompacta e renomeia `.gz`. O build nativo agora fornece `por.traineddata` sem compressão interna e configura o OCR para esse formato; a web continua usando o `.gz`. Cópias de recuperação e a prévia de cards usam o compartilhamento nativo. O painel administrativo usa a mesma sessão nativa no arquivo `admin.html`, com revogação de avisos no logout.

A branch isolada `codex/mobile-ios-validation-20261106` foi publicada com autorização do proprietário para verificar compilação e inicialização em simulador macOS. A primeira execução compilou com Xcode 26.6 e parou no limite de espera do primeiro boot do simulador, antes da instalação do app. A [execução ajustada](https://github.com/k2publicidade/mentralife/actions/runs/42273656281) amplia esse limite e exibe o progresso. A compilação está comprovada; o resultado de inicialização ainda precisa ser conferido no job. A branch principal não foi alterada.

## Limites e critérios de liberação

A adaptação não certifica que todos os recursos funcionam perfeitamente em aparelhos. A compilação e homologação dos binários precisam de evidência específica. JDK 21 e Android SDK 36 foram preparados neste Windows em pasta privada após a concordância do operador. O APK de desenvolvimento Android foi compilado com sucesso e teve sua assinatura v2 verificada. A compilação e assinatura do iOS continuam exigindo Mac com Xcode.

- Notificações nativas APNs/FCM implementadas, com testes de registro, isolamento, JWT e fila. Ainda exigem credenciais, configuração dos projetos e homologação real. Consulte [Notificações nativas](NOTIFICACOES-NATIVAS.md). Web Push permanece na PWA compatível.
- Google Agenda: autorização no navegador do sistema e retorno ao app implementados. O código é trocado pela sessão que iniciou o fluxo, com PKCE e nonce de uso único. A conexão real ainda precisa ser homologada com o cliente OAuth configurado. Consulte [Google Agenda](CALENDARIO-GOOGLE.md).
- Abertura da conta exige internet. Alterações em uma sessão já aberta seguem a recuperação local existente; a página offline não exibe dados privados e não promete acesso completo à conta sem internet.
- Cobrança continua sem gateway homologado. Antes de vender assinaturas nas lojas, implementar e homologar o fluxo de compra aplicável e sua validação no servidor. Selecionar plano não efetua cobrança.
- Antes da distribuição: validar cadastro/login, persistência da sessão depois de encerrar o app, logout, recuperação e exclusão de conta; upload pela galeria/Arquivos, PDF/OCR; compartilhamento real para outro app; agenda e fusos; sincronização após queda de rede, conflito e retorno do segundo plano; teclado, rotação, TalkBack/VoiceOver e tamanhos de texto. Testar acesso de duas contas para conferir isolamento.
- Concluir a política de privacidade, declarações de dados de saúde/documentos/finanças, ficha das lojas, assinatura e testes internos/TestFlight. O manifesto de API incluído não substitui a declaração completa de coleta de dados da loja.

Referências de implementação: [Capacitor: requisitos](https://capacitorjs.com/docs/getting-started/environment-setup), [HTTP nativo](https://capacitorjs.com/docs/apis/http), [cookies](https://capacitorjs.com/docs/apis/cookies), [manifesto de privacidade iOS](https://capacitorjs.com/docs/ios/privacy-manifest).
