# Bibliotecas de leitura documental

O processamento documental usa PDF.js e Tesseract.js no navegador. Os arquivos de execução e o idioma português são copiados das dependências travadas no `package-lock.json` para `dist/vendor/` por `scripts/prepare-vendor.mjs`. O build e o pós-install executam essa preparação.

- PDF.js: `pdfjs-dist` 6.4.299, distribuição de compatibilidade `legacy`. Código e licença Apache 2.0 da Mozilla Foundation.
- Tesseract.js: 7.0.0. Código e licença em `dist/vendor/tesseract/LICENSE`.
- Tesseract.js-core: versão registrada pelo manifesto do build, com licença distribuída em `dist/vendor/tesseract/core/LICENSE`.
- Português: `@tesseract.js-data/por` 1.0.0, variante `4.0.0_best_int`; metadados do pacote (licença declarada MIT), autoria e origem acompanham a distribuição.

`dist/vendor/manifest.json` registra versões e SHA-256 dos arquivos. O navegador carrega workers, WebAssembly, fontes, mapas e idioma somente da própria origem; não usa os CDNs padrão dessas bibliotecas. A CSP permite compilação WebAssembly por `wasm-unsafe-eval`, mantendo a proibição de avaliação arbitrária de JavaScript.

O arquivo não é enviado a um serviço de OCR. Após revisão e confirmação, o texto passa a integrar o estado privado da conta no D1. Extração ou OCR não cria lançamentos, interpreta documentos como quitação, valida assinatura nem altera o original. A leitura tem limite de 20 páginas por operação e 200.000 caracteres por documento. PDFs maiores podem ser lidos em faixas, com acréscimo explicitamente escolhido ao texto anterior. Arquivos protegidos/danificados e limites do dispositivo podem impedir leitura; o original continua disponível.

Referências: [PDF.js](https://mozilla.github.io/pdf.js/examples/), [instalação local do Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [API do Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).
