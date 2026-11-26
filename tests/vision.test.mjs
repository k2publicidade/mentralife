import test from 'node:test';
import assert from 'node:assert/strict';
import {readMedia,PDF_RETRY} from '../server/vision.mjs';

PDF_RETRY.ms=0;
const JPEG=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,217]);
const PDF=new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const reply=text=>Response.json({choices:[{message:{content:text}}]});

test('foto: lida pelo DeepSeek (visão) sem tocar no Workers AI',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(url);assert.equal(options.redirect,'manual');const body=JSON.parse(options.body);assert.equal(body.model,'deepseek-flash');assert.match(body.messages[0].content[1].image_url.url,/^data:image\/jpeg;base64,/);return reply('CONTA DE LUZ\nTotal: R$ 187,45');});
 const AI={run:async()=>{throw Error('não deveria ser chamado');}};
 const result=await readMedia({DEEPSEEK_API_KEY:'k',AI},JPEG);
 assert.equal(result.text,'CONTA DE LUZ\nTotal: R$ 187,45');assert.equal(result.mime,'image/jpeg');assert.deepEqual(calls,['https://api.deepseek.com/chat/completions']);
});

test('foto: DeepSeek fora do ar cai no Workers AI',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('{}',{status:503}));
 const result=await readMedia({DEEPSEEK_API_KEY:'k',AI:{run:async()=>({response:'Texto pela Cloudflare'})}},JPEG);
 assert.equal(result.text,'Texto pela Cloudflare');
});

test('PDF escaneado: envia ao DeepSeek, tenta de novo se vier vazio e apaga o arquivo de lá',async t=>{
 const calls=[];let reads=0;
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  calls.push((options.method||'GET')+' '+url.replace('https://api.deepseek.com',''));
  if(url.endsWith('/files')){assert.equal(options.body.get('purpose'),'text_recognition');return Response.json({id:'file-api-abc-123'});}
  if(url.endsWith('/chat/completions')){const body=JSON.parse(options.body);assert.deepEqual(body.messages[0].content[0],{type:'file',file_id:'file-api-abc-123'});reads++;return reply(reads===1?'VAZIO':'BOLETO\nValor: R$ 99,00');}
  if(options.method==='DELETE')return Response.json({deleted:true});
  return new Response('{}',{status:404});
 });
 const result=await readMedia({DEEPSEEK_API_KEY:'k',AI:{toMarkdown:async()=>({format:'markdown',data:'## Contents\n\n'})}},PDF);
 assert.equal(result.text,'BOLETO\nValor: R$ 99,00');
 assert.deepEqual(calls,['POST /files','POST /chat/completions','POST /chat/completions','DELETE /files/file-api-abc-123']);
});

test('PDF com texto: usa o Workers AI e não envia o arquivo ao DeepSeek',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw Error('não deveria ser chamado');});
 const result=await readMedia({DEEPSEEK_API_KEY:'k',AI:{toMarkdown:async()=>({format:'markdown',data:'## Contents\n\nNOTA FISCAL DE SERVIÇO Valor total R$ 850,00 Prestador João'})}},PDF);
 assert.match(result.text,/NOTA FISCAL/);
});

test('PDF ilegível e sem DeepSeek: pede foto, sem inventar conteúdo',async()=>{
 await assert.rejects(readMedia({AI:{toMarkdown:async()=>({format:'error'})}},PDF),e=>e.status===422&&/foto/.test(e.message));
 await assert.rejects(readMedia({},JPEG),e=>e.status===503);
});
