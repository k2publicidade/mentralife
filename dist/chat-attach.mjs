// Prepara a foto ou o PDF anexado na conversa com a Mentra IA.
// Foto: reduzida para JPEG de até ~480 KB (vai para a leitura do DeepSeek e pode ser guardada nos documentos).
// PDF: o texto é extraído aqui; PDF escaneado (sem texto) vira imagens das primeiras páginas.
export const CHAT_FILE_ACCEPT='image/jpeg,image/png,image/webp,application/pdf';
export const CHAT_FILE_LIMIT=10*1024*1024;
const STORE_LIMIT=490*1024,IMAGE_LIMIT=1100*1024,MIN_PDF_TEXT=60;

export const toBase64=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);};
const baseName=name=>String(name||'arquivo').replace(/\.[a-z0-9]{1,5}$/i,'').slice(0,120)||'arquivo';

export function fileKind(bytes){
 const ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 if(ascii(0,5)==='%PDF-')return 'pdf';
 if(bytes[0]===137&&ascii(1,4)==='PNG')return 'png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'webp';
 return null;
}

async function canvasJpeg(canvas,limit){
 for(const quality of [0.85,0.75,0.65,0.55]){
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
  if(blob&&blob.size<=limit)return new Uint8Array(await blob.arrayBuffer());
 }
 return null;
}
function drawScaled(source,width,height,side){
 const ratio=Math.min(1,side/Math.max(width,height)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
 return canvas;
}
async function photoJpeg(file){
 let bitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('Não consegui abrir esta foto. Envie em JPEG ou PNG.');}
 try{
  for(const side of [1600,1300,1000,800]){const bytes=await canvasJpeg(drawScaled(bitmap,bitmap.width,bitmap.height,side),STORE_LIMIT);if(bytes)return bytes;}
 }finally{bitmap.close?.();}
 throw Error('Não consegui reduzir esta foto. Tente outra imagem.');
}

async function loadPdf(bytes){
 const pdfjs=await import('./vendor/pdfjs/pdf.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
 const base=new URL('./vendor/pdfjs/',import.meta.url).href;
 return pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,enableXfa:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',iccUrl:base+'iccs/'});
}
async function pdfParts(bytes){
 const task=await loadPdf(bytes),pdf=await task.promise;
 try{
  const pages=Math.min(pdf.numPages,10),parts=[];
  for(let n=1;n<=pages;n++){const page=await pdf.getPage(n),content=await page.getTextContent();parts.push(content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('').replace(/[ \t]+\n/g,'\n').trim());}
  const text=parts.filter(Boolean).map((t,i)=>(pdf.numPages>1?`[Página ${i+1}]\n`:'')+t).join('\n\n').slice(0,20000);
  const images=[];
  if(text.replace(/\s|\[Página \d+\]/g,'').length<MIN_PDF_TEXT){
   for(let n=1;n<=Math.min(pdf.numPages,3);n++){
    const page=await pdf.getPage(n),first=page.getViewport({scale:1}),scale=Math.min(2,1600/Math.max(first.width,first.height)),viewport=page.getViewport({scale});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport}).promise;
    const jpeg=await canvasJpeg(canvas,IMAGE_LIMIT);if(jpeg)images.push(toBase64(jpeg));
   }
  }
  return {text,images,pages:pdf.numPages};
 }finally{void task.destroy();}
}

/** Lê o arquivo escolhido e devolve o anexo no formato aceito por POST /api/chat. */
export async function prepareChatFile(file){
 if(!file||!file.size)throw Error('Arquivo vazio.');
 if(file.size>CHAT_FILE_LIMIT)throw Error('Envie um arquivo de até 10 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),kind=fileKind(bytes),name=baseName(file.name);
 if(!kind)throw Error('Envie uma foto (JPEG, PNG ou WebP) ou um PDF.');
 if(kind==='pdf'){
  const parts=await pdfParts(bytes);
  if(!parts.text&&!parts.images.length)throw Error('Não consegui ler este PDF. Envie uma foto do documento.');
  const store=bytes.length<=STORE_LIMIT;
  return {attachment:{name:name+'.pdf',kind:'pdf',...(store?{data:toBase64(bytes)}:{tooLarge:true}),...(parts.text?{text:parts.text}:{}),...(parts.images.length?{images:parts.images}:{})},label:name+'.pdf',kind:'pdf',stored:store};
 }
 const jpeg=kind==='jpg'&&bytes.length<=STORE_LIMIT?bytes:await photoJpeg(file);
 return {attachment:{name:name+'.jpg',kind:'foto',data:toBase64(jpeg)},label:file.name||name+'.jpg',kind:'foto',stored:true};
}
