import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {config,sign,classify,identify,shouldHandle,isDirectChat,createQueue} from './lib.mjs';

test('configuração: exige origem, segredo e senha quando o painel é exposto',()=>{
 const ok={MENTRA_API_URL:'https://api.example.workers.dev/',WHATSAPP_GATEWAY_SECRET:'a'.repeat(64)};
 assert.deepEqual(config(ok).problems,[]);assert.equal(config(ok).api,'https://api.example.workers.dev');
 assert.equal(config({}).problems.length,2);
 assert.equal(config({...ok,HOST:'0.0.0.0'}).problems.length,1);assert.equal(config({...ok,HOST:'0.0.0.0',PANEL_PASSWORD:'uma-senha-longa'}).problems.length,0);
 assert.equal(config({...ok,HOST:'0.0.0.0',PANEL_LOOPBACK_ONLY:'1'}).problems.length,0);
 assert.equal(config({...ok,MENTRA_API_URL:'http://insecure.example.workers.dev'}).problems.length,1);
 assert.equal(config({...ok,MENTRA_API_URL:'http://127.0.0.1:8787'}).problems.length,0);
});
test('assinatura: HMAC sobre timestamp e corpo',()=>{
 const h=sign('s','{"a":1}','1700000000000');assert.equal(h['x-mentra-signature'],'sha256='+createHmac('sha256','s').update('1700000000000.{"a":1}').digest('hex'));
});
test('classificação: texto, áudio, mídia e eventos ignorados',()=>{
 assert.deepEqual(classify({conversation:' oi '}),{kind:'text',text:'oi'});
 assert.deepEqual(classify({ephemeralMessage:{message:{extendedTextMessage:{text:'olá'}}}}),{kind:'text',text:'olá'});
 assert.deepEqual(classify({audioMessage:{mimetype:'audio/ogg; codecs=opus',fileLength:1200}}),{kind:'audio',mime:'audio/ogg; codecs=opus',size:1200});
 assert.deepEqual(classify({imageMessage:{caption:'x'}}),{kind:'other'});
 assert.equal(classify({reactionMessage:{}}),null);assert.equal(classify({protocolMessage:{}}),null);
});
test('identidade: prefere telefone e mantém o lid como alternativa',async()=>{
 assert.deepEqual(await identify({remoteJid:'5511999999999@s.whatsapp.net'}),{from:'5511999999999',alt:null});
 assert.deepEqual(await identify({remoteJid:'123456789012345@lid',remoteJidAlt:'5511999999999@s.whatsapp.net'}),{from:'5511999999999',alt:'123456789012345'});
 assert.deepEqual(await identify({remoteJid:'123456789012345@lid'},async()=>'5511888888888:3@s.whatsapp.net'),{from:'5511888888888',alt:'123456789012345'});
 assert.deepEqual(await identify({remoteJid:'123456789012345@lid'},async()=>{throw Error('x');}),{from:'123456789012345',alt:null});
});
test('filtro: só conversas individuais, recentes e de terceiros',()=>{
 const now=Date.now(),base={key:{id:'1',remoteJid:'5511999999999@s.whatsapp.net'},message:{conversation:'oi'},messageTimestamp:Math.floor(now/1000)};
 assert.equal(shouldHandle(base,now),true);
 assert.equal(shouldHandle({...base,key:{...base.key,fromMe:true}},now),false);
 assert.equal(shouldHandle({...base,messageTimestamp:Math.floor(now/1000)-3600},now),false);
 for(const jid of ['120363000000000000@g.us','status@broadcast','123@broadcast','123@newsletter'])assert.equal(isDirectChat(jid),false);
 assert.equal(isDirectChat('123456789012345@lid'),true);
});
test('fila: mensagens do mesmo contato em ordem, contatos diferentes em paralelo',async()=>{
 const enqueue=createQueue(),order=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
 const a1=enqueue('a',async()=>{await wait(30);order.push('a1');}),a2=enqueue('a',async()=>{order.push('a2');}),b1=enqueue('b',async()=>{order.push('b1');});
 await Promise.all([a1,a2,b1]);assert.deepEqual(order,['b1','a1','a2']);
 await enqueue('a',async()=>{throw Error('falha');});await enqueue('a',async()=>{order.push('a3');});assert.equal(order.at(-1),'a3');
});
