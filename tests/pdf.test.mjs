import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecordPdf,createReceiptPdf,createPaymentDocumentPdf,createReportPdf} from '../dist/pdf.mjs';

const sample={title:'Descrição fictícia com acentuação',cents:13000,date:'2026-10-14',accountName:'Itaú manual',methodLabel:'Pix',category:'Projetos',status:'actual',payer:'Pessoa Exemplo',payee:'Recebedor Exemplo'};
const text=bytes=>Buffer.from(bytes).toString('latin1');
const normalize=value=>value.replace(/\s+/g,' ').trim();

// Inspect byte offsets and stream lengths, including binary TrueType font streams.
function inspectPdf(bytes){
 assert.ok(bytes instanceof Uint8Array);
 const buffer=Buffer.from(bytes),s=text(bytes);
 assert.ok(s.startsWith('%PDF-1.4'));
 assert.ok(s.endsWith('%%EOF\n'));
 assert.ok(s.includes('/FontFile2'));
 assert.ok(!s.includes('/JavaScript'));
 const xref=Number(s.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
 assert.equal(buffer.subarray(xref,xref+4).toString('ascii'),'xref');
 const xrefText=buffer.subarray(xref).toString('ascii');
 const offsets=[...xrefText.matchAll(/^(\d{10}) 00000 n/gm)].map(m=>Number(m[1]));
 assert.equal(Number(xrefText.match(/^xref\n0 (\d+)/)[1]),offsets.length+1);
 const objects=offsets.map((off,i)=>{
  assert.ok(buffer.subarray(off,off+20).toString('ascii').startsWith(String(i+1)+' 0 obj\n'));
  const object=buffer.subarray(off,offsets[i+1]??xref).toString('latin1');
  const marker=object.indexOf('\nstream\n');
  if(marker>=0){
   const length=Number(object.slice(0,marker).match(/\/Length (\d+)/)[1]);
   const end=marker+'\nstream\n'.length+length;
   assert.match(object.slice(end),/^\n?endstream\nendobj\n$/);
  }
  return object;
 });
 const streams=objects.filter(object=>object.includes('\nstream\n')&&!object.includes('/Length1'));
 const visibleText=streams.flatMap(stream=>[...stream.matchAll(/<([0-9A-F]*)> Tj/g)].map(match=>new TextDecoder('windows-1252').decode(Buffer.from(match[1],'hex')))).join('\n');
 return {source:s,objects,streams,visibleText,pages:Number(s.match(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/)[1])};
}

test('all exports produce actual PDF bytes with embedded fonts and valid xref and stream lengths',()=>{
 const results=[createRecordPdf(sample),createReceiptPdf(sample),createPaymentDocumentPdf({...sample,documentType:'receipt'}),createPaymentDocumentPdf({...sample,documentType:'payment_record'}),createReportPdf({from:'2026-10-01',to:'2026-10-31',summary:{income:13000,expense:0,categories:[]},records:[{...sample,type:'income'}]})];
 for(const bytes of results){
  const pdf=inspectPdf(bytes);
  assert.equal(pdf.objects.filter(object=>object.includes('/FontFile2')).length,2);
  const fontStreams=pdf.objects.filter(object=>object.includes('/Length1'));
  assert.equal(fontStreams.length,2);
  for(const font of fontStreams){
   const start=font.indexOf('\nstream\n')+'\nstream\n'.length;
   assert.deepEqual([...Buffer.from(font.slice(start,start+4),'latin1')],[0,1,0,0]);
  }
 }
});

test('standalone payment record contains informed parties, value, date, reason and optional details',()=>{
 const data=Object.freeze({...sample,documentType:'payment_record',note:'Serviço de manutenção informado pelas partes.'});
 const pdf=inspectPdf(createPaymentDocumentPdf(data)),visible=normalize(pdf.visibleText);
 for(const expected of ['Registro de pagamento','DECLARAÇÃO PARA CONTROLE · NÃO É COMPROVANTE BANCÁRIO','PAGADOR INFORMADO Pessoa Exemplo','RECEBEDOR INFORMADO Recebedor Exemplo','VALOR INFORMADO R$ 130,00','DATA INFORMADA 14/10/2026','MOTIVO Descrição fictícia com acentuação','FORMA DE PAGAMENTO INFORMADA Pix','OBSERVAÇÃO Serviço de manutenção informado pelas partes.','Assinatura do recebedor','Declaração gerada localmente','Não é documento fiscal nem comprovante bancário e não valida pagamento ou quitação'])assert.ok(visible.includes(expected),expected);
 for(const forbidden of ['Pagamento confirmado','Quitado','Registrado como realizado','Itaú manual','PROJETOS'])assert.ok(!visible.includes(forbidden),forbidden);
 assert.ok(!pdf.source.includes('/AcroForm'));
 assert.ok(pdf.streams.some(stream=>/46 [\d.]+ m 385 [\d.]+ l S/.test(stream)),'blank signature line');
});

test('standalone receipt delegates to the existing draft and includes an optional observation',()=>{
 const data={...sample,documentType:'receipt',note:'Assinar somente após revisar os dados.'};
 assert.deepEqual(createPaymentDocumentPdf(data),createReceiptPdf(data));
 const visible=normalize(inspectPdf(createPaymentDocumentPdf(data)).visibleText);
 assert.ok(visible.includes('Rascunho de recibo de pagamento'));
 assert.ok(visible.includes('OBSERVAÇÃO Assinar somente após revisar os dados.'));
 assert.ok(visible.includes('Assinatura de quem recebeu'));
 assert.ok(visible.includes('não confirma automaticamente pagamento ou quitação'));
});

test('standalone record supports paymentMethod and motivo fallbacks without ledger data',()=>{
 const pdf=inspectPdf(createPaymentDocumentPdf({documentType:'payment_record',payer:'Pagador',payee:'Recebedor',cents:123456,date:'2026-12-01',motivo:'Reembolso informado',paymentMethod:'Transferência'}));
 const visible=normalize(pdf.visibleText);
 assert.ok(visible.includes('VALOR INFORMADO R$ 1.234,56'));
 assert.ok(visible.includes('DATA INFORMADA 01/12/2026'));
 assert.ok(visible.includes('MOTIVO Reembolso informado'));
 assert.ok(visible.includes('FORMA DE PAGAMENTO INFORMADA Transferência'));
 assert.ok(!visible.includes('OBSERVAÇÃO'));
 assert.ok(!visible.includes('CONTA'));
});

test('optional method and note are omitted and missing parties are visibly incomplete',()=>{
 const visible=normalize(inspectPdf(createPaymentDocumentPdf({documentType:'payment_record',cents:0})).visibleText);
 assert.ok(visible.includes('PAGADOR INFORMADO A preencher'));
 assert.ok(visible.includes('RECEBEDOR INFORMADO A preencher'));
 assert.ok(visible.includes('VALOR INFORMADO R$ 0,00'));
 assert.ok(visible.includes('DATA INFORMADA Não informado'));
 assert.ok(visible.includes('MOTIVO A preencher'));
 assert.ok(!visible.includes('FORMA DE PAGAMENTO INFORMADA'));
 assert.ok(!visible.includes('OBSERVAÇÃO'));
});

test('unsupported document types fail rather than silently producing the wrong document',()=>{
 for(const data of [undefined,null,{}, {documentType:'record'}, {documentType:'invoice'}])assert.throws(()=>createPaymentDocumentPdf(data),/Tipo de documento inválido/);
});

test('standalone documents preserve Portuguese and WinAnsi punctuation without exposing PDF operators',()=>{
 const hostile='João (PJ) \\ ação – “revisão” € ) /JavaScript ( \u0000\u0007🙂';
 for(const documentType of ['receipt','payment_record']){
  const pdf=inspectPdf(createPaymentDocumentPdf({...sample,documentType,title:hostile,payer:hostile,payee:hostile,methodLabel:hostile,note:hostile}));
  const visible=normalize(pdf.visibleText);
  assert.ok(visible.includes('João (PJ) \\ ação – “revisão” € ) /JavaScript ( ?'));
  assert.ok(!pdf.source.includes(') /JavaScript ('));
  assert.ok(!pdf.visibleText.includes('\u0000'));
  assert.ok(!pdf.visibleText.includes('\u0007'));
  for(const stream of pdf.streams)assert.ok(!/[\u0080-\uffff]/.test(stream),'content operators remain ASCII');
 }
});

test('long standalone fields paginate without clipping content below the footer or dropping endings',()=>{
 const long=label=>label+' '+('Informação extensa com acentuação. '.repeat(140))+' '+('W'.repeat(1100))+' '+label+'FIM';
 for(const documentType of ['receipt','payment_record']){
  const pdf=inspectPdf(createPaymentDocumentPdf({...sample,documentType,payer:long('PAGADOR'),payee:long('RECEBEDOR'),title:long('MOTIVO'),methodLabel:long('FORMA'),note:long('NOTA')}));
  assert.ok(pdf.pages>5);
  const visible=normalize(pdf.visibleText);
  for(const label of ['PAGADOR','RECEBEDOR','MOTIVO','FORMA','NOTA'])assert.ok(visible.includes(label+'FIM'),label+' ending preserved');
  assert.ok(visible.includes('Assinatura'));
  for(const stream of pdf.streams){
   for(const match of stream.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)){
    const y=Number(match[2]);
    assert.ok(y===34||y>=76.89,'text baseline '+y+' overlaps the footer');
    assert.ok(y<=841.89,'text baseline is outside the page');
   }
  }
 }
});

test('report still paginates large input and encodes strings rather than PDF operators',()=>{
 const rows=Array.from({length:50},(_,i)=>({...sample,title:'Item '+i+' ) /JavaScript (',type:'expense'}));
 const pdf=inspectPdf(createReportPdf({from:'2026-10-01',to:'2026-10-31',summary:{income:0,expense:650000},records:rows}));
 assert.ok(pdf.pages>1);
 assert.ok(!pdf.source.includes(') /JavaScript ('));
});
