// Leitura de fotos e PDFs enviados pelo WhatsApp: DeepSeek (visão e PDF escaneado) com o Workers AI da Cloudflare como reserva.
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

// DeepSeek (deepseek-flash) lê imagens desde 10/09/2026 e PDFs escaneados pela API de arquivos.
const DEEPSEEK='https://api.deepseek.com',EMPTY_READ=/^VAZIO.?$|file content (begin|end)|conteúdo d[oe] arquivo .{0,40}vazio|não há (nenhum )?texto/i;
export const PDF_RETRY={ms:1500};const PDF_RETRY_MS_GET=()=>PDF_RETRY.ms;
async function deepseekRead(env,content,timeoutMs){
 const response=await timed(fetch(DEEPSEEK+'/chat/completions',{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${env.DEEPSEEK_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.DEEPSEEK_MODEL||'deepseek-flash',thinking:{type:'disabled'},temperature:0,max_tokens:1800,messages:[{role:'user',content}]})}),timeoutMs);
 if(!response.ok)throw Error('deepseek_read_'+response.status);
 const result=await response.json();return clean(result?.choices?.[0]?.message?.content).replace(/^=+ Page \d+ =+\s*$/gm,'').trim();
}
async function deepseekImage(env,bytes,kind,timeoutMs){
 return deepseekRead(env,[{type:'text',text:PROMPT},{type:'image_url',image_url:{url:`data:${kind.mime};base64,${base64(bytes)}`}}],timeoutMs);
}
/** PDF escaneado (só imagem): envia à API de arquivos do DeepSeek, lê e apaga o arquivo de lá em seguida. */
async function deepseekPdf(env,bytes,timeoutMs){
 const auth={Authorization:`Bearer ${env.DEEPSEEK_API_KEY}`},form=new FormData();
 form.append('purpose','text_recognition');form.append('file',new Blob([bytes],{type:'application/pdf'}),'documento.pdf');
 const upload=await timed(fetch(DEEPSEEK+'/files',{method:'POST',redirect:'manual',headers:auth,body:form}),timeoutMs);
 if(!upload.ok)throw Error('deepseek_upload_'+upload.status);
 const id=(await upload.json())?.id;if(typeof id!=='string'||!/^file-[A-Za-z0-9-]{1,100}$/.test(id))throw Error('deepseek_upload_id');
 // Logo após o envio o conteúdo às vezes ainda chega vazio ao modelo: tenta de novo em instantes (até 3 vezes).
 try{
  for(let attempt=0;;attempt++){
   const text=await deepseekRead(env,[{type:'file',file_id:id},{type:'text',text:'Transcreva todo o texto deste documento, página por página, exatamente como aparece. Não resuma nem interprete. Se o conteúdo vier vazio, responda apenas VAZIO.'}],timeoutMs);
   if(text&&!EMPTY_READ.test(text))return text;
   if(attempt>=2)return '';
   await new Promise(resolve=>setTimeout(resolve,PDF_RETRY_MS_GET()));
  }
 }
 finally{try{await fetch(DEEPSEEK+'/files/'+encodeURIComponent(id),{method:'DELETE',redirect:'manual',headers:auth});}catch{console.error('deepseek_file_delete_failed');}}
}

export async function readMedia(env,bytes,{timeoutMs=40000}={}){
 if(!env.AI&&!env.DEEPSEEK_API_KEY)problem('A leitura de fotos aguarda a configuração da IA.',503);
 if(!(bytes instanceof Uint8Array)||!bytes.length)problem('Arquivo vazio.',422);
 if(bytes.length>READ_LIMIT)problem('O arquivo passa de 2 MB. Envie uma foto menor.',413);
 const kind=mediaKind(bytes);if(!kind)problem('Envie uma foto (JPEG ou PNG) ou um PDF.',415);
 if(kind.ext==='pdf'){
  let text='';
  if(env.AI){
   try{
    const result=await timed(env.AI.toMarkdown({name:'arquivo.pdf',blob:new Blob([bytes],{type:kind.mime})}),timeoutMs),item=Array.isArray(result)?result[0]:result;
    const data=item?.format==='error'?'':String(item?.data||''),start=data.indexOf('## Contents');text=clean((start>=0?data.slice(start+11):data).replace(/^###? Page \d+\s*$/gm,''));
   }catch{console.error('media_pdf_markdown_failed');}
  }
  if(text.replace(/\s/g,'').length<40&&env.DEEPSEEK_API_KEY){try{text=await deepseekPdf(env,bytes,timeoutMs)||text;}catch(error){console.error('media_pdf_deepseek_failed',error.message);}}
  if(!text)problem('Não consegui ler este PDF agora. Envie uma foto da página ou tente de novo em instantes.',422);
  return {text,...kind};
 }
 let failure;
 if(env.DEEPSEEK_API_KEY){
  try{const text=await deepseekImage(env,bytes,kind,timeoutMs);if(text)return {text,...kind};}
  catch(error){failure=error;console.error('media_read_deepseek_failed',error.message);}
 }
 if(!env.AI)problem(failure?'Não consegui ler esta foto agora. Tente de novo em instantes.':'Não encontrei nada legível nesta foto.',failure?502:422);
 const input={messages:[{role:'user',content:[{type:'text',text:PROMPT},{type:'image_url',image_url:{url:`data:${kind.mime};base64,${base64(bytes)}`}}]}],max_tokens:1800,temperature:0};
 for(const model of MODELS){
  try{
   const result=await timed(env.AI.run(model,input),timeoutMs),text=clean(result?.response??result?.choices?.[0]?.message?.content);
   if(text)return {text,...kind};
  }catch(error){failure=error;console.error('media_read_model_failed',model);}
 }
 problem(failure?'Não consegui ler esta foto agora. Tente de novo em instantes.':'Não encontrei nada legível nesta foto.',failure?502:422);
}
