# Lançamento Android e iOS — roteiro de publicação

Atualizado em 13/11/2026. App: **Mentra Life**, identificador `app.mentralife.mobile`, versão em `mobile/version.json` (hoje 1.0.0, build 1). O app é o mesmo sistema web empacotado com Capacitor 8 (interface local no binário, API em `https://mentralife.vercel.app`). Ver também [APP-MOBILE.md](APP-MOBILE.md) e [ANDROID-WINDOWS.md](ANDROID-WINDOWS.md).

## O que já está pronto no código

| Item | Android | iOS |
|---|---|---|
| Projeto nativo, ícones, splash, deep link `mentralife://calendar/complete` | ✔ | ✔ |
| Sessão por cookie HttpOnly nativo, sem segredos no binário | ✔ | ✔ |
| Push nativo (FCM / APNs) com permissão explícita | ✔ (requer `google-services.json`) | ✔ (requer chave APNs no Worker) |
| Microfone para mensagens de voz | `RECORD_AUDIO` | `NSMicrophoneUsageDescription` |
| Câmera/fotos para documentos | via seletor do sistema | textos de permissão |
| Exclusão de conta dentro do app (exigência Apple 5.1.1(v) / Google) | ✔ Meu espaço › Excluir minha conta | ✔ |
| Exportação dos dados da conta | ✔ | ✔ |
| Cobrança: o app nativo **não** mostra preço nem abre checkout externo | ✔ | ✔ |
| Build de loja | `.aab` assinado com upload key | archive + TestFlight via CI |
| Versão única para as duas plataformas | `mobile/version.json` | `mobile/version.json` |
| Criptografia declarada isenta (só HTTPS) | — | `ITSAppUsesNonExemptEncryption=false` |
| Arquitetura | targetSdk 36, minSdk 26 | arm64, iOS 15+ |
| Manifesto de privacidade (API de timestamp do Filesystem) | — | `PrivacyInfo.xcprivacy` |

## Verificado em 13/11/2026 (Windows, sem aparelho)

- `npm test`: 572 testes, 566 aprovados, 0 falhas, 6 de integração pulados. Inclui `tests/mobile-store-readiness.test.mjs` (cobrança fora do app nativo, permissões, arm64, versão sincronizada).
- `node scripts/test-mobile-browser.mjs`: 100 verificações (web) e `--packaged`: 102 verificações do pacote nativo com adaptador simulado, em Chromium e WebKit (OCR real, PDF, admin, larguras de 320 a 844 px). O teste foi atualizado para a rota `#/arquivos/documentos`, para o novo cabeçalho do admin e para o carregamento sob demanda das fontes do PDF.
- `npm run android:debug`: APK `app.mentralife.mobile` 1.0.0 (1), assinatura conferida, 336 assets conferidos byte a byte; `RECORD_AUDIO` e `POST_NOTIFICATIONS` presentes no manifesto final.
- `npm run android:release` (com chave descartável, binários apagados depois): AAB e APK assinados, 336 assets conferidos em cada um, sem `debuggable`. Sem upload key, o Gradle recusa o build de release com uma mensagem clara.
- **Não verificado aqui:** compilação e assinatura do iOS (exigem macOS; use o workflow) e execução em aparelhos reais.

## Comandos

```powershell
npm run mobile:version -- --bump        # novo build da mesma versão (cada envio às lojas precisa de um build maior)
npm run mobile:version -- --set 1.0.1   # nova versão pública (+1 no build)
npm run android:debug                   # APK de teste, instala por ADB
npm run android:upload-key              # UMA vez: cria a upload key em .mentra-private/android-signing/
npm run android:release                 # .aab assinado para a Play Console + APK release, ambos verificados
```

Saídas: `android/app/build/outputs/bundle/release/app-release.aab` e `qa/mobile/android-app-release.json` (hash e assets verificados).

iOS, sem Mac: GitHub Actions › **Mobile release** › *Run workflow* (marque "Enviar build iOS ao TestFlight" depois de cadastrar os secrets abaixo). O mesmo workflow também gera o `.aab`. Com um Mac: `npm ci`, `npm run mobile:sync`, `npm run mobile:ios`, depois *Product › Archive* no Xcode.

## Depende do proprietário (não é possível fazer por aqui)

### 1. Contas de desenvolvedor
- **Google Play Console**: taxa única de US$ 25. Conta **pessoal** criada após nov/2023 exige **teste fechado com pelo menos 12 testadores por 14 dias seguidos** antes de liberar produção. A fase de testes a partir de 16/11 cobre esse prazo para o lançamento no início de dezembro, desde que o teste fechado comece até ~18/11. Conta de **organização** (requer D-U-N-S) não tem essa exigência.
- **Apple Developer Program**: US$ 99/ano. Para publicar como empresa, é necessário D-U-N-S (a emissão leva alguns dias). A revisão da Apple costuma levar de 1 a 3 dias; reserve margem para uma rejeição.

### 2. Chaves e arquivos (nunca no Git nem no chat)
- Android: rodar `npm run android:upload-key` e guardar backup privado de `.mentra-private/android-signing/`. Na Play Console, ativar **Play App Signing** (padrão).
- Push Android: criar projeto Firebase com o pacote `app.mentralife.mobile`, baixar `google-services.json` para `android/app/` e cadastrar a conta de serviço FCM no Worker ([NOTIFICACOES-NATIVAS.md](NOTIFICACOES-NATIVAS.md)).
- Push iOS: criar chave APNs (.p8) no portal Apple e cadastrá-la no Worker.
- CI iOS (secrets do repositório): `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_B64` (chave da API do App Store Connect, papel *App Manager*, em base64).
- CI Android (opcional): `ANDROID_UPLOAD_KEYSTORE_B64`, `ANDROID_UPLOAD_STORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD`, `ANDROID_GOOGLE_SERVICES_JSON_B64`.
- Confirmar a titularidade do identificador `app.mentralife.mobile`. Depois do primeiro envio ele não muda mais.

### 3. Decisão sobre cobrança (importante)
Apple (diretriz 3.1.1) e Google Play (política de pagamentos) exigem a cobrança da própria loja para assinaturas digitais vendidas **dentro** do app. Por isso o app nativo agora não mostra preço, botão "Pagar" nem link de pagamento. Quem tem assinatura ativa usa normalmente, e a web continua vendendo como antes.
- **Lançamento agora (recomendado para dezembro):** manter assim. Risco: a Apple pode questionar um app cujo recurso de IA depende de assinatura que não se compra no app (3.1.3(b) pede que o item também exista como compra no app). Na revisão, explique que o app inclui os módulos de organização para qualquer conta.
- **Depois:** implementar compras no app (StoreKit + Google Play Billing, por exemplo via RevenueCat) com validação no servidor. É um projeto próprio, fora deste pacote.

### 4. Fichas das lojas
- **Política de privacidade** em URL pública (obrigatória nas duas lojas) e URL de suporte.
- **Google Play:** formulário *Segurança dos dados* (conta: nome/e-mail; conteúdo do usuário: documentos, fotos, áudio; finanças pessoais informadas; saúde informada; tudo criptografado em trânsito; exclusão disponível), declaração de *Recursos financeiros* (gestão de finanças pessoais, sem empréstimos), declaração de *Apps de saúde* se o bem-estar for destacado, classificação de conteúdo, público-alvo 18+, ícone 512×512, gráfico de destaque 1024×500 e pelo menos 2 capturas de celular.
- **App Store:** rótulos de privacidade equivalentes, categoria (Produtividade), capturas de iPhone 6,9" (1320×2868) e, como o app também roda em iPad, capturas de iPad 13" (ou limite o app a iPhone: `TARGETED_DEVICE_FAMILY = 1`).
- **Conta de revisão (as duas lojas):** criar uma conta dedicada em produção e **ativá-la no /admin**. Sem assinatura ativa a Mentra IA não responde e o revisor vai reprovar. Informe e-mail e senha só nos campos de acesso de revisão das lojas.

### 5. Homologação em aparelhos (antes de enviar à produção)
Com a conta de teste, em pelo menos um Android e um iPhone reais: cadastro/login e sessão após fechar o app; Voltar do Android; teclado e rotação; gravação de voz (aceitar e negar a permissão); anexar foto/PDF e OCR; compartilhar PDF para outro app; push com app fechado; Google Agenda (ida e volta pelo navegador); perda de rede e retorno; logout, troca de conta e exclusão de conta; TalkBack/VoiceOver e fonte ampliada.

## Ordem sugerida até o lançamento
1. Criar as contas Play Console e Apple Developer (hoje, por causa do D-U-N-S e do teste de 14 dias).
2. `npm run android:upload-key` → `npm run android:release` → enviar o `.aab` para **Teste interno** e em seguida para **Teste fechado** com os testadores de 16/11.
3. Cadastrar os secrets da Apple → rodar o workflow com upload → TestFlight para os testadores iOS.
4. Fichas, privacidade, conta de revisão ativa.
5. Corrigir o que os testes em aparelhos revelarem, rodar `npm run mobile:version -- --bump`, gerar de novo e enviar para produção nas duas lojas.
