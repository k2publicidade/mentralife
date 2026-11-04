import {isReceiptDocument,RECEIPTS_FOLDER} from './documents-ui.mjs';
export const CONTEXTS={personal:'Pessoal',business:'Empresa'};
export const documentContext=doc=>doc.context==='business'?'business':'personal';
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function searchableText(doc){return normalize([doc.title,doc.originalName,doc.category,doc.note,doc.extractedText,...['title','payer','payee','note','methodLabel','date'].map(k=>doc.payload?.[k])].filter(Boolean).join(' '));}
export function filterLibrary(documents,{query='',context='all',category='all',favorites=false,trashed=false,receipts=false}={}){
 const words=normalize(query).split(' ').filter(Boolean);
 return documents.filter(doc=>doc&&Boolean(doc.trashed)===trashed&&(!receipts||isReceiptDocument(doc))&&(context==='all'||documentContext(doc)===context)&&(category==='all'||doc.category===category)&&(!favorites||doc.favorite===true)&&words.every(word=>searchableText(doc).includes(word))).sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
}
export function validateDocumentMetadata(raw,existing={}){
 const title=typeof raw.title==='string'?raw.title.trim():'',note=typeof raw.note==='string'?raw.note.trim():'',category=typeof raw.category==='string'?raw.category.trim():'',context=raw.context;
 if(!title||title.length>160)throw Error('Informe um nome com até 160 caracteres.');
 if(!Object.hasOwn(CONTEXTS,context))throw Error('Escolha Pessoal ou Empresa.');
 if(!category||category.length>80)throw Error('Informe uma categoria com até 80 caracteres.');
 if(note.length>4000)throw Error('A anotação pode ter até 4.000 caracteres.');
 return {title,note,context,category:isReceiptDocument(existing)?RECEIPTS_FOLDER:category};
}
export function updateDocument(state,id,changes){const doc=state.documents.find(d=>d.id===id&&!d.trashed);if(!doc)throw Error('Este documento não está disponível.');const metadata=validateDocumentMetadata(changes,doc);return {...state,documents:state.documents.map(d=>d.id===id?{...d,...metadata,updatedAt:new Date().toISOString()}:d)};}
export function toggleDocumentFavorite(state,id){const doc=state.documents.find(d=>d.id===id&&!d.trashed);if(!doc)throw Error('Este documento não está disponível.');return {...state,documents:state.documents.map(d=>d.id===id?{...d,favorite:d.favorite!==true}:d)};}
export function trashDocument(state,id,trashed=true){const doc=state.documents.find(d=>d.id===id);if(!doc)throw Error('Este documento não está mais disponível.');return {...state,documents:state.documents.map(d=>d.id===id?{...d,trashed,trashedAt:trashed?new Date().toISOString():null}:d)};}
export function purgeDocument(state,id){const doc=state.documents.find(d=>d.id===id);if(!doc)return state;if(!doc.trashed)throw Error('Mova o documento para a lixeira antes de excluir definitivamente.');const next={...state,documents:state.documents.filter(d=>d.id!==id)};if(Array.isArray(state.health?.appointments))next.health={...state.health,appointments:state.health.appointments.map(a=>a.documentId===id?{...a,documentId:''}:a)};return next;}
export function saveExtractedText(state,id,text,source={}){const doc=state.documents.find(d=>d.id===id&&!d.trashed);if(!doc)throw Error('Este documento não está disponível.');if(typeof text!=='string'||text.length>200000)throw Error('O texto de busca pode ter até 200.000 caracteres.');return {...state,documents:state.documents.map(d=>d.id===id?{...d,extractedText:text.trim(),extraction:{method:source.method||'manual',pages:source.pages||null,totalPages:source.totalPages||null,startPage:source.startPage||null,endPage:source.endPage||null,partial:source.partial===true,reviewedAt:new Date().toISOString()}}:d)};}
