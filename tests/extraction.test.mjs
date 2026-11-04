import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createWorker} from 'tesseract.js';
import {createRecordPdf} from '../dist/pdf.mjs';
import {readUpload} from '../dist/uploads.mjs';
import {extractDocumentText,originalFingerprint} from '../dist/extraction.mjs';
test('PDF real tem texto extraído sem OCR e sem alterar os bytes originais',async()=>{
 const bytes=createRecordPdf({title:'Contrato privado numero 7319',cents:2990,date:'2026-10-28',category:'Teste',note:'Palavra pesquisável: jabuticaba'}),original=await readUpload(new File([bytes],'contrato.pdf',{type:'application/pdf'})),fingerprint=originalFingerprint(original);
 const result=await extractDocumentText(original,{ocr:false});assert.equal(result.method,'pdf');assert.equal(result.pages,1);assert.equal(result.partial,false);assert.match(result.text,/jabuticaba/);assert.match(result.text,/7319/);assert.equal(originalFingerprint(original),fingerprint);
});
test('OCR real em português reconhece imagem sintética usando somente arquivos locais',{timeout:45000},async()=>{
 const worker=await createWorker('por',1,{langPath:resolve('node_modules/@tesseract.js-data/por/4.0.0_best_int'),cacheMethod:'none'});
 try{const {data}=await worker.recognize(resolve('tests/fixtures/document-scan.png'));assert.match(data.text,/4812/);assert.match(data.text,/Pagamento confirmado/i);}finally{await worker.terminate();}
});
test('cancelamento antes da leitura não inicializa OCR nem abre arquivo',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(extractDocumentText({},{signal:controller.signal}),{name:'AbortError'});
});
test('PDFs longos aceitam outra faixa de páginas e rejeitam página inexistente',async()=>{
 const bytes=createRecordPdf({title:'Teste de várias páginas',cents:1000,date:'2026-10-28',note:'Registro de teste para paginação. '.repeat(400)}),original=await readUpload(new File([bytes],'longo.pdf',{type:'application/pdf'}));
 const result=await extractDocumentText(original,{ocr:false,startPage:2,pageLimit:1});assert.equal(result.pages,1);assert.equal(result.startPage,2);assert.equal(result.endPage,2);assert.equal(result.partial,true);assert.ok(result.totalPages>2);assert.match(result.text,/Página 2/);
 await assert.rejects(extractDocumentText(original,{ocr:false,startPage:999}),error=>error.code==='PAGE_RANGE');
});
test('PDFs da operação usam dados informados e mantêm os avisos de documento não fiscal',async()=>{
 globalThis.mentraProduction=true;
 try{const bytes=createRecordPdf({title:'Registro da operação',cents:2990,date:'2026-10-28'}),original=await readUpload(new File([bytes],'registro.pdf',{type:'application/pdf'})),result=await extractDocumentText(original,{ocr:false});assert.doesNotMatch(result.text,/demonstração|DEMONSTRAÇÃO/);assert.match(result.text,/DADOS INFORMADOS/);assert.match(result.text,/Não é nota fiscal/);
 const declared=createRecordPdf({title:'Frase que a pessoa informou na demonstração',cents:100,date:'2026-10-28'}),data=await readUpload(new File([declared],'declarado.pdf',{type:'application/pdf'})),text=await extractDocumentText(data,{ocr:false});assert.match(text.text,/a pessoa informou na demonstração/);
 }finally{delete globalThis.mentraProduction;}
});
