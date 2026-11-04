import test from 'node:test';
import assert from 'node:assert/strict';
import {documentContext,filterLibrary,updateDocument,toggleDocumentFavorite,trashDocument,purgeDocument,saveExtractedText} from '../dist/library-core.mjs';
const state=()=>({documents:[{id:'personal',title:'scan_004.pdf',category:'Casa',context:'personal',note:'Referência',fileData:'BYTES',extractedText:'Contrato de locação número 4812',trashed:false},{id:'business',title:'Empresa',category:'Trabalho',context:'business',note:'Reunião',favorite:true,trashed:false},{id:'receipt',title:'Recibo',category:'Recibos e comprovantes',folder:'receipts',pdfData:'PDF-ORIGINAL',payload:{payer:'Ana',payee:'Fornecedor',title:'Serviço'},trashed:false}],records:[{id:'movement',cents:1000}],health:{appointments:[{id:'consultation',documentId:'personal'}]},tasks:[{id:'task'}]});
test('busca por conteúdo é insensível a acentos e respeita contexto, favoritos, pasta e lixeira',()=>{
 const docs=state().documents;
 assert.equal(documentContext({}),'personal');assert.deepEqual(filterLibrary(docs,{query:'locacao 4812'}).map(d=>d.id),['personal']);
 assert.deepEqual(filterLibrary(docs,{context:'business'}).map(d=>d.id),['business']);assert.deepEqual(filterLibrary(docs,{favorites:true}).map(d=>d.id),['business']);
 assert.deepEqual(filterLibrary(docs,{receipts:true,query:'Ana fornecedor'}).map(d=>d.id),['receipt']);assert.equal(filterLibrary(docs,{context:'business',query:'locacao'}).length,0);
 const trashed=trashDocument(state(),'personal');assert.equal(filterLibrary(trashed.documents,{query:'4812'}).length,0);assert.equal(filterLibrary(trashed.documents,{query:'4812',trashed:true}).length,1);
});
test('editar organização ou favorito preserva bytes, dados financeiros e fotografia do recibo',()=>{
 const original=state(),updated=updateDocument(original,'receipt',{title:'Nome novo',category:'Trabalho',context:'business',note:'Encontrar depois'}),doc=updated.documents.find(d=>d.id==='receipt');
 assert.equal(doc.pdfData,'PDF-ORIGINAL');assert.equal(doc.category,'Recibos e comprovantes');assert.equal(doc.context,'business');assert.deepEqual(doc.payload,original.documents[2].payload);assert.deepEqual(updated.records,original.records);assert.equal(original.documents[2].title,'Recibo');
 const favorite=toggleDocumentFavorite(updated,'receipt');assert.equal(favorite.documents[2].favorite,true);assert.equal(toggleDocumentFavorite(favorite,'receipt').documents[2].favorite,false);
 assert.throws(()=>updateDocument(original,'personal',{title:'A',category:'Casa',context:'public'}));
});
test('lixeira restaura o original e exclusão definitiva exige lixeira e desvincula consultas',()=>{
 const original=state();assert.throws(()=>purgeDocument(original,'personal'),/lixeira/);const trashed=trashDocument(original,'personal');assert.equal(trashed.documents[0].fileData,'BYTES');assert.ok(trashed.documents[0].trashedAt);
 const restored=trashDocument(trashed,'personal',false);assert.equal(restored.documents[0].fileData,'BYTES');assert.equal(restored.documents[0].trashed,false);
 const purged=purgeDocument(trashed,'personal');assert.ok(!purged.documents.some(d=>d.id==='personal'));assert.equal(purged.health.appointments[0].documentId,'');assert.equal(original.health.appointments[0].documentId,'personal');assert.deepEqual(purged.records,original.records);assert.deepEqual(purged.tasks,original.tasks);assert.equal(purgeDocument(purged,'personal'),purged);
});
test('texto de OCR só entra na busca após salvar revisão, com limite e original preservado',()=>{
 const original=state();assert.equal(filterLibrary(original.documents,{query:'jabuticaba'}).length,0);const next=saveExtractedText(original,'personal',' Texto revisado: jabuticaba ',{method:'ocr',pages:1,totalPages:2,partial:true});
 assert.equal(filterLibrary(next.documents,{query:'jabuticaba'}).length,1);assert.equal(next.documents[0].fileData,'BYTES');assert.equal(next.documents[0].extraction.partial,true);assert.ok(next.documents[0].extraction.reviewedAt);assert.equal(original.documents[0].extractedText,'Contrato de locação número 4812');
 assert.throws(()=>saveExtractedText(original,'personal','x'.repeat(200001)),/200.000/);assert.throws(()=>saveExtractedText(trashDocument(original,'personal'),'personal','texto'),/disponível/);
});
