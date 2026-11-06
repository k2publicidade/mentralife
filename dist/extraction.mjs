const aborted=()=>new DOMException('Leitura cancelada.','AbortError');
const assertLive=signal=>{if(signal?.aborted)throw aborted();};
export function originalBytes(doc){const encoded=doc.fileData||doc.pdfData;if(!encoded)throw Error('Este documento não tem arquivo original.');return Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}
export function originalFingerprint(doc){return doc.sha256||doc.fileData||doc.pdfData||null;}
export async function extractDocumentText(doc,{ocr=true,startPage=1,pageLimit=20,signal,onProgress=()=>{}}={}){
 if(!Number.isInteger(startPage)||startPage<1||!Number.isInteger(pageLimit)||pageLimit<1||pageLimit>20)throw Error('Escolha uma página inicial e no máximo 20 páginas por leitura.');
 assertLive(signal);const bytes=originalBytes(doc);let worker,workerPromise,pdf,loadingTask,renderTask;
 let rejectAbort;const cancellation=new Promise((_,reject)=>{rejectAbort=reject;});
 const stop=()=>{rejectAbort(aborted());renderTask?.cancel();if(loadingTask)void loadingTask.destroy();if(worker)void worker.terminate();};
 signal?.addEventListener('abort',stop,{once:true});
 const timer=setTimeout(()=>{rejectAbort(Object.assign(Error('Tempo de leitura excedido.'),{name:'TimeoutError'}));renderTask?.cancel();if(loadingTask)void loadingTask.destroy();if(worker)void worker.terminate();},180000);
 const job=async()=>{
  const recognize=async image=>{
   assertLive(signal);
   if(!workerPromise){const {default:Tesseract}=await import('./vendor/tesseract/tesseract.mjs');assertLive(signal);workerPromise=Tesseract.createWorker('por',1,{workerPath:new URL('./vendor/tesseract/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/tesseract/core/',import.meta.url).href,langPath:new URL('./vendor/tesseract/lang/',import.meta.url).href,gzip:!globalThis.mentraNative,workerBlobURL:false,cacheMethod:'none',errorHandler:()=>rejectAbort(Error('O reconhecimento de texto não pôde ser concluído.')),logger:message=>{if(!signal?.aborted&&message.status==='recognizing text')onProgress(`Reconhecendo texto: ${Math.round(message.progress*100)}%`);}});worker=await workerPromise;assertLive(signal);}
   return (await worker.recognize(image)).data.text;
  };
  if(doc.mime==='application/pdf'||String(doc.ext).toUpperCase()==='PDF'){
   onProgress('Abrindo PDF…');const pdfjs=await import('./vendor/pdfjs/pdf.mjs');assertLive(signal);pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
   const base=new URL('./vendor/pdfjs/',import.meta.url).href;
   loadingTask=pdfjs.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',iccUrl:base+'iccs/',maxImageSize:12000000});pdf=await loadingTask.promise;if(signal?.aborted){void pdf.destroy();throw aborted();}
   assertLive(signal);if(startPage>pdf.numPages)throw Object.assign(Error(`Este PDF tem ${pdf.numPages} páginas. Ajuste a página inicial.`),{code:'PAGE_RANGE'});const endPage=Math.min(pdf.numPages,startPage+pageLimit-1),parts=[];let usedOcr=false,partial=startPage>1||pdf.numPages>endPage;
   for(let number=startPage;number<=endPage;number++){
    assertLive(signal);onProgress(`Lendo página ${number} de ${pdf.numPages}…`);const page=await pdf.getPage(number),content=await page.getTextContent();let text=content.items.filter(item=>typeof item.str==='string').map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();
    if(ocr&&text.replace(/\s/g,'').length<20){usedOcr=true;const initial=page.getViewport({scale:1.8}),ratio=Math.min(1,Math.sqrt(4000000/(initial.width*initial.height))),viewport=page.getViewport({scale:1.8*ratio}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const context=canvas.getContext('2d',{alpha:false});renderTask=page.render({canvasContext:context,viewport});await renderTask.promise;renderTask=null;text=await recognize(canvas);canvas.width=canvas.height=0;}
    parts.push(`Página ${number}\n${text}`);page.cleanup();if(parts.join('\n\n').length>=200000){partial=true;break;}
   }
   return {text:parts.join('\n\n').slice(0,200000),method:usedOcr?'pdf+ocr':'pdf',pages:parts.length,totalPages:pdf.numPages,startPage,endPage:startPage+parts.length-1,partial};
  }
  if(!['image/png','image/jpeg'].includes(doc.mime))throw Error('A extração aceita PDF, PNG ou JPEG.');
  if(!ocr)throw Error('Para ler texto de uma imagem, ative o reconhecimento OCR.');
  onProgress('Preparando o reconhecimento em português…');const text=await recognize(new Blob([bytes],{type:doc.mime}));return {text:text.slice(0,200000),method:'ocr',pages:1,totalPages:1,partial:text.length>200000};
 };
 try{return await Promise.race([job(),cancellation]);}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);if(workerPromise)void workerPromise.then(w=>w.terminate()).catch(()=>{});if(loadingTask)void loadingTask.destroy();}
}
