// Gera as páginas públicas termos.html, privacidade.html e excluir-conta.html a partir de dist/legal.mjs.
// Uso: node scripts/legal-pages.mjs        (grava os arquivos)
//      node scripts/legal-pages.mjs --check (falha se os arquivos estiverem desatualizados)
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {COMPANY,LEGAL,LEGAL_LINKS,termsSections,privacySections,deletionSections,sectionsMarkup,legalLinksMarkup} from '../dist/legal.mjs';
import {DEFAULT_PLANS} from '../server/catalog.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

function page({title,description,heading,lead,body,script=''}){
 return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title} · Mentra Life</title><meta name="description" content="${description}"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/legal.css"></head>
<body class="legal-page"><header class="legal-header"><a class="legal-brand" href="/"><img src="/assets/mentra-logo-256.webp" width="40" height="40" alt="">Mentra Life</a>${legalLinksMarkup()}</header>
<main class="legal-main" id="conteudo"><p class="eyebrow">DOCUMENTO LEGAL</p><h1>${heading}</h1><p class="legal-lead">${lead}</p>
${body}
</main><footer class="legal-footer">${legalLinksMarkup()}<p>${COMPANY.legalName?COMPANY.legalName.replace(/[<>&]/g,''):'Mentra Life'}${COMPANY.cnpj?' · CNPJ '+COMPANY.cnpj:''}</p></footer>${script}</body></html>
`;
}

export function legalPages(){
 const plans=DEFAULT_PLANS;
 return {
  'dist/termos.html':page({title:'Termos de Uso',description:'Termos de Uso da Mentra Life: serviço, IA, planos, cobrança, cancelamento e arrependimento.',heading:'Termos de Uso',lead:`Versão ${LEGAL.termsVersion}, em vigor desde ${LEGAL.effectiveDate}. Leia junto com o <a href="${LEGAL_LINKS.privacy}">Aviso de Privacidade</a>.`,body:sectionsMarkup(termsSections({plans}))}),
  'dist/privacidade.html':page({title:'Aviso de Privacidade',description:'Como a Mentra Life trata dados pessoais conforme a LGPD.',heading:'Aviso de Privacidade',lead:`Versão ${LEGAL.privacyVersion}, em vigor desde ${LEGAL.effectiveDate}.`,body:sectionsMarkup(privacySections())}),
  'dist/excluir-conta.html':page({title:'Excluir conta',description:'Como pedir a exclusão da conta e dos dados da Mentra Life.',heading:'Excluir conta e dados',lead:'Este recurso funciona fora do aplicativo, como exigem a App Store e o Google Play.',
   body:sectionsMarkup(deletionSections())+`<section class="legal-section card" id="formulario"><h2>Excluir agora</h2><form id="deletion-form" class="form-stack" novalidate><label>E-mail da conta<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Senha<input name="password" type="password" autocomplete="current-password" required minlength="12" maxlength="128"></label><label class="check-field"><input type="checkbox" name="confirmed" required><span>Entendo que a conta e todos os dados serão excluídos de forma definitiva e que dias pagos restantes não são reembolsados fora do prazo de arrependimento.</span></label><button class="outline danger" type="submit">Excluir minha conta definitivamente</button><p id="deletion-result" role="status" class="form-help"></p></form></section>`,
   script:'<script type="module" src="/account-deletion.mjs"></script>'})
 };
}

function main(){
 const check=process.argv.includes('--check');let stale=[];
 for(const [file,content] of Object.entries(legalPages())){
  const path=resolve(root,file),current=existsSync(path)?readFileSync(path,'utf8').replace(/\r\n/g,'\n'):null;
  if(current===content)continue;
  if(check)stale.push(file);else writeFileSync(path,content);
 }
 if(stale.length){console.error('Páginas legais desatualizadas: '+stale.join(', ')+'. Rode node scripts/legal-pages.mjs.');process.exitCode=1;}
 else if(!check)console.log('Páginas legais geradas.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
