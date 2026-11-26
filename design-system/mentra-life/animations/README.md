# Mentra viva · animações do rosto

Loop de 10 s (piscadas, sorriso leve com olhar suave e piscada dupla), gerado a partir do PNG aprovado `dist/assets/mentra-face.png`, sem redesenhar o rosto.

| Arquivo | Uso |
| --- | --- |
| `mentra-viva-loop-verde.gif` / `.webp` | Loop perfeito, fundo verde-floresta (480 × 480, 20 fps) |
| `mentra-viva-loop-creme.gif` / `.webp` | Loop perfeito, fundo creme |
| `mentra-piscadinha.gif` / `.webp` | Piscadinha com sorriso (1,6 s) |

Prefira o `.webp` animado: mesma animação com cerca de um terço do tamanho do GIF.

No app a animação não usa esses arquivos: `dist/face-alive.mjs` aplica uma camada SVG sobre cada imagem do rosto (nítida em qualquer tamanho, poucos KB). A piscadinha acontece ao passar o mouse ou tocar no rosto. Respeita "reduzir movimento" do sistema e os botões "Pausar movimento".

Para regerar os quadros: `npm run dev` e depois `node scripts/render-face-animation.mjs <pasta> "#173e32" loop 20 540`.
