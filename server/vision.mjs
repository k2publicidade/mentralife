// Leitura (OCR) de fotos e PDFs enviados pelo WhatsApp, usando o Workers AI da Cloudflare.
// Devolve somente o texto encontrado: quem decide o que gravar é o agente, com as ferramentas da conta.
import {problem} from './integration-utils.mjs';

export const READ_LIMIT=2*1024*1024,READ_TEXT_LIMIT=6000;
const MODELS=['@cf/mistralai/mistral-small-3.1-24b-instruct','@cf/meta/llama-4-scout-17b-16e-instruct'];
const PROMPT='Você lê fotos de documentos, contas, boletos, notas e comprovantes brasileiros. Transcreva todo o texto visível, linha por linha, exatamente como aparece, incluindo valores, datas, nomes, CPF/CNPJ, vencimento e linha digitável. Não resuma, não interprete e não acrescente nada. Se não houver texto legível, descreva em uma frase curta o que aparece na imagem.';

/** Tipo real do arquivo pelos primeiros bytes; null quando não é PDF, PNG, JPEG ou WebP. */
export function mediaKind(bytes){
 const ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 if(ascii(0,5)==='%PDF-')return {mime:'application/pdf',ext:'pdf'};
 if(bytes[0]===137&&ascii(1,4)==='PNG')return {mime:'image/png',ext:'png'};
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:'image/jpeg',ext:'jpg'};
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return {mime:'image/webp',ext:'webp'};
 return null;
}
export function fromBase64(value){
 if(typeof value!=='string'||!value||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))return null;
 try{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{return null;}
}
const base64=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);};
const clean=text=>String(text||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,READ_TEXT_LIMIT);
const timed=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('read_timeout')),ms);})]).finally(()=>clearTimeout(timer));};

export async function readMedia(env,bytes,{timeoutMs=40000}={}){
 if(!env.AI)problem('A leitura de fotos aguarda ativação do Workers AI na Cloudflare.',503);
 if(!(bytes instanceof Uint8Array)||!bytes.length)problem('Arquivo vazio.',422);
 if(bytes.length>READ_LIMIT)problem('O arquivo passa de 2 MB. Envie uma foto menor.',413);
 const kind=mediaKind(bytes);if(!kind)problem('Envie uma foto (JPEG ou PNG) ou um PDF.',415);
 if(kind.ext==='pdf'){
  const result=await timed(env.AI.toMarkdown({name:'arquivo.pdf',blob:new Blob([bytes],{type:kind.mime})}),timeoutMs),item=Array.isArray(result)?result[0]:result;
  const data=item?.format==='error'?'':String(item?.data||''),start=data.indexOf('## Contents'),text=clean((start>=0?data.slice(start+11):data).replace(/^###? Page \d+\s*$/gm,''));
  if(!text)problem('Este PDF não tem texto legível (parece uma imagem escaneada). Envie uma foto da página.',422);
  return {text,...kind};
 }
 const input={messages:[{role:'user',content:[{type:'text',text:PROMPT},{type:'image_url',image_url:{url:`data:${kind.mime};base64,${base64(bytes)}`}}]}],max_tokens:1800,temperature:0};
 let failure;
 for(const model of MODELS){
  try{
   const result=await timed(env.AI.run(model,input),timeoutMs),text=clean(result?.response??result?.choices?.[0]?.message?.content);
   if(text)return {text,...kind};
  }catch(error){failure=error;console.error('media_read_model_failed',model);}
 }
 problem(failure?'Não consegui ler esta foto agora. Tente de novo em instantes.':'Não encontrei nada legível nesta foto.',failure?502:422);
}
