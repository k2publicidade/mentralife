import {isReceiptDocument,RECEIPTS_FOLDER} from './documents-ui.mjs';
export const CONTEXTS={personal:'Pessoal',business:'Empresa'};
export const documentContext=doc=>doc.context==='business'?'business':'personal';
export const AREAS=Object.freeze({
 documentos:Object.freeze({label:'Documentos',emoji:'📄',eyebrow:'IDENTIDADE E COMPROVANTES',title:'Documentos sempre à mão.',hint:'Identidade, CNH, comprovantes e certificados.',singular:'documento',categories:Object.freeze(['Identidade','CNH','Comprovantes','Certificados']),dateLabels:Object.freeze(['Validade do documento','Renovação','Outra data']),example:'Ex.: CNH, RG, certificado do curso'}),
 contratos:Object.freeze({label:'Contratos',emoji:'📝',eyebrow:'ACORDOS E COMPROMISSOS',title:'Contratos sem surpresa no vencimento.',hint:'Aluguel, prestação de serviços, escola e outros acordos.',singular:'contrato',categories:Object.freeze(['Aluguel','Prestação de serviços','Escola','Outros acordos']),dateLabels:Object.freeze(['Vencimento do contrato','Renovação','Reajuste','Outra data']),example:'Ex.: contrato de aluguel do apartamento'}),
 garantias:Object.freeze({label:'Garantias',emoji:'🛡️',eyebrow:'COMPRAS E PRODUTOS',title:'Garantias que você não perde.',hint:'Nota de compra, garantia e manual de produtos.',singular:'garantia',categories:Object.freeze(['Nota de compra','Garantia','Manual']),dateLabels:Object.freeze(['Fim da garantia','Revisão do produto','Outra data']),example:'Ex.: nota fiscal da geladeira'})
});
export const REMIND_DAYS=Object.freeze([0,1,3,7,15,30,60,90]);
export const documentArea=doc=>Object.hasOwn(AREAS,doc?.area)&&!isReceiptDocument(doc)?doc.area:'documentos';
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const shift=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export const reminderDay=doc=>validDate(doc?.importantDate)?shift(doc.importantDate,-(REMIND_DAYS.includes(doc.remindDaysBefore)?doc.remindDaysBefore:0)):null;
export const daysUntil=(date,today)=>Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
export function importantDates(documents,today,{area='all',horizon=Infinity}={}){
 return (documents||[]).filter(d=>d&&!d.trashed&&validDate(d.importantDate)&&(area==='all'||documentArea(d)===area)).map(d=>({doc:d,area:documentArea(d),date:d.importantDate,label:d.dateLabel||AREAS[documentArea(d)].dateLabels[0],days:daysUntil(d.importantDate,today)})).filter(x=>x.days<=horizon&&x.days>=-30).sort((a,b)=>a.date.localeCompare(b.date));
}
export function describeDays(days){if(days<0)return days===-1?'venceu ontem':`venceu há ${-days} dias`;if(days===0)return 'é hoje';if(days===1)return 'amanhã';if(days<60)return `em ${days} dias`;const months=Math.round(days/30);return `em cerca de ${months} meses`;}
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function searchableText(doc){return normalize([doc.title,doc.originalName,doc.category,doc.note,doc.dateLabel,doc.extractedText,...['title','payer','payee','note','methodLabel','date'].map(k=>doc.payload?.[k])].filter(Boolean).join(' '));}
export function filterLibrary(documents,{query='',context='all',category='all',favorites=false,trashed=false,receipts=false,area='all'}={}){
 const words=normalize(query).split(' ').filter(Boolean);
 return documents.filter(doc=>doc&&Boolean(doc.trashed)===trashed&&(!receipts||isReceiptDocument(doc))&&(area==='all'||documentArea(doc)===area)&&(context==='all'||documentContext(doc)===context)&&(category==='all'||doc.category===category)&&(!favorites||doc.favorite===true)&&words.every(word=>searchableText(doc).includes(word))).sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
}
export function validateDocumentMetadata(raw,existing={}){
 const title=typeof raw.title==='string'?raw.title.trim():'',note=typeof raw.note==='string'?raw.note.trim():'',category=typeof raw.category==='string'?raw.category.trim():'',context=raw.context;
 if(!title||title.length>160)throw Error('Informe um nome com até 160 caracteres.');
 if(!Object.hasOwn(CONTEXTS,context))throw Error('Escolha Pessoal ou Empresa.');
 if(!category||category.length>80)throw Error('Informe uma categoria com até 80 caracteres.');
 if(note.length>4000)throw Error('A anotação pode ter até 4.000 caracteres.');
 const receipt=isReceiptDocument(existing),area=receipt?'documentos':raw.area===undefined?documentArea(existing):raw.area;
 if(!Object.hasOwn(AREAS,area))throw Error('Escolha Documentos, Contratos ou Garantias.');
 const importantDate=typeof raw.importantDate==='string'?raw.importantDate.trim():'',dateLabel=typeof raw.dateLabel==='string'?raw.dateLabel.trim():'';
 if(importantDate&&!validDate(importantDate))throw Error('Informe uma data importante válida.');
 if(dateLabel.length>80)throw Error('O nome da data pode ter até 80 caracteres.');
 const remind=importantDate!==''&&(raw.remind===true||raw.remind==='on'||raw.remind==='true'),days=Number(raw.remindDaysBefore??0);
 if(remind&&!REMIND_DAYS.includes(days))throw Error('Escolha com quantos dias de antecedência a Mentra deve lembrar.');
 return {title,note,context,area,category:receipt?RECEIPTS_FOLDER:category,importantDate,dateLabel:importantDate?dateLabel||AREAS[area].dateLabels[0]:'',remind,remindDaysBefore:remind?days:0};
}
export function updateDocument(state,id,changes){const doc=state.documents.find(d=>d.id===id&&!d.trashed);if(!doc)throw Error('Este documento não está disponível.');const metadata=validateDocumentMetadata(changes,doc);return {...state,documents:state.documents.map(d=>d.id===id?{...d,...metadata,updatedAt:new Date().toISOString()}:d)};}
export function toggleDocumentFavorite(state,id){const doc=state.documents.find(d=>d.id===id&&!d.trashed);if(!doc)throw Error('Este documento não está disponível.');return {...state,documents:state.documents.map(d=>d.id===id?{...d,favorite:d.favorite!==true}:d)};}
export function trashDocument(state,id,trashed=true){const doc=state.documents.find(d=>d.id===id);if(!doc)throw Error('Este documento não está mais disponível.');return {...state,documents:state.documents.map(d=>d.id===id?{...d,trashed,trashedAt:trashed?new Date().toISOString():null}:d)};}
export function purgeDocument(state,id){const doc=state.documents.find(d=>d.id===id);if(!doc)return state;if(!doc.trashed)throw Error('Mova o documento para a lixeira antes de excluir definitivamente.');const next={...state,documents:state.documents.filter(d=>d.id!==id)};if(Array.isArray(state.health?.appointments))next.health={...state.health,appointments:state.health.appointments.map(a=>a.documentId===id?{...a,documentId:''}:a)};return next;}
export function saveExtractedText(state,id,text,source={}){const doc=state.documents.find(d=>d.id===id&&!d.trashed);if(!doc)throw Error('Este documento não está disponível.');if(typeof text!=='string'||text.length>200000)throw Error('O texto de busca pode ter até 200.000 caracteres.');return {...state,documents:state.documents.map(d=>d.id===id?{...d,extractedText:text.trim(),extraction:{method:source.method||'manual',pages:source.pages||null,totalPages:source.totalPages||null,startPage:source.startPage||null,endPage:source.endPage||null,partial:source.partial===true,reviewedAt:new Date().toISOString()}}:d)};}
