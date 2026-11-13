# Compilar e testar Android no Windows

O projeto permite usar ferramentas portáteis na pasta ignorada `.mentra-private/android-tools/`, sem alterar o PATH permanente do Windows. O preparo baixa arquivos oficiais com SHA-256 conferido: Microsoft OpenJDK 21 e Android Command-Line Tools. O SDK Manager instala platform-tools, plataforma Android 36 e build-tools 35.0.0 e 36.0.0.

Depois de revisar e concordar com os termos do SDK, execute:

```powershell
./scripts/prepare-android-tools.ps1 -AcceptSdkLicense
./scripts/build-android.ps1
```

A opção `-AcceptSdkLicense` é uma declaração explícita de concordância do operador. Não a use antes de revisar os [termos do Android SDK](https://developer.android.com/studio#command-line-tools-only). O projeto mantém o ambiente e as dependências de build na pasta privada; não os publica nem inclui no pacote fonte.

`build-android.ps1` lê os caminhos preparados, sincroniza os assets e plugins do Capacitor e executa o Gradle `assembleDebug`. O resultado esperado é `android/app/build/outputs/apk/debug/app-debug.apk`, com assinatura de desenvolvimento. O log fica em `qa/mobile/android-build.log`. O comando também verifica a assinatura e compara os assets do APK com o build mobile; grava tamanho, hash e evidência em `qa/mobile/android-apk.json`. Isso gera um APK de teste, não uma versão assinada para publicação na Play Store.

## Resultado verificado em 06/11/2026

Compilação `assembleDebug` concluída com Gradle 8.14.3, JDK 21 e SDK 36. O APK foi verificado pelo apksigner (assinatura v2 válida), exige Android 8/API 26 e tem `targetSdkVersion` 36. O pacote atualizado tem SHA-256 `7e5dc5ba1a5f2c5d89e3eda915d8e022ba822834ef13c2357fc7c89cb7b21e87`; consulte `qa/mobile/android-apk.json` após cada build para conferir a versão atual. O aparelho ainda não estava conectado ao ADB; essa compilação não comprova execução ou entrega de notificações no telefone.

## Aparelho físico

Ative Opções do desenvolvedor e Depuração USB no Android, conecte o cabo de dados e autorize a chave do computador no aparelho. Se necessário, instale o driver USB oficial do fabricante. Consulte as [instruções oficiais para aparelhos físicos](https://developer.android.com/studio/run/device).

Na raiz do projeto:

```powershell
$androidConfig = Get-Content .mentra-private/android-tools/environment.json -Raw | ConvertFrom-Json
$env:ANDROID_USER_HOME = $androidConfig.androidUserHome
$adbPath = Join-Path $androidConfig.sdkRoot 'platform-tools/adb.exe'
& $adbPath devices -l
```

Somente um aparelho em estado `device` está pronto para receber comandos. `unauthorized` exige confirmação no aparelho. Com um único aparelho de teste autorizado conectado:

```powershell
& $adbPath install -r android/app/build/outputs/apk/debug/app-debug.apk
& $adbPath shell am start -n app.mentralife.mobile/.MainActivity
```

O APK usa a origem HTTPS definida no build por `MENTRA_MOBILE_API_ORIGIN`; o padrão é o site público. Para testar mudanças novas da API, publique primeiro o backend e o callback compatíveis em um ambiente próprio de teste e defina essa origem antes de compilar. O pacote não inclui secrets do backend. Sem o arquivo Firebase cliente e as credenciais dos provedores no servidor, notificações reais não são ativadas.

## Verificação no aparelho

Validar login e permanência da sessão após encerrar/reabrir o app; navegação e Voltar; teclado e rotação; criação, alteração e sincronização de um registro sintético; recuperação após perder conexão; seleção e compartilhamento de PDF/imagem/áudio; retorno do Google Agenda; permissão e entrega real de avisos; logout e troca de conta. Usar uma conta de teste. Um APK que compila não comprova esses resultados.

O iOS continua exigindo Mac com Xcode, assinatura e aparelho/simulador compatíveis; o SDK Android não compila o projeto iOS.
