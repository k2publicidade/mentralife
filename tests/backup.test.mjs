import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAccountBackup,accountRecoveryJson} from '../dist/backup.mjs';
import {accountState} from '../dist/account-state.mjs';
import {readUpload} from '../dist/uploads.mjs';
import {readFileSync} from 'node:fs';
const user={id:'owner-a',name:'Conta A'},envelope=data=>({format:'mentra-life-account-v1',ownerId:user.id,data});
test('restauração preserva todos os módulos, originais e exclusões sem importar assinatura',async()=>{const data=accountState(null,user),bytes=readFileSync(new URL('fixtures/document-scan.png',import.meta.url));const file={size:bytes.length,name:'scan.png',arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};data.documents.push({id:'doc1',title:'Original',category:'Pessoal',trashed:true,...await readUpload(file)});data.tasks.push({id:'task1',title:'Tarefa concluída',category:'Pessoal',done:true});const source=envelope(data);source.subscription={status:'active'};const restored=await parseAccountBackup(JSON.stringify(source),user);assert.deepEqual(restored,data);assert.equal(restored.documents[0].trashed,true);assert.equal(restored.subscription,undefined);assert.equal(data.documents.length,1);});
test('cópia de outra conta, corrupção, identidade duplicada e payload perigoso são rejeitados',async()=>{const data=accountState(null,user);await assert.rejects(parseAccountBackup(JSON.stringify({...envelope(data),ownerId:'owner-b'}),user));await assert.rejects(parseAccountBackup('null',user));await assert.rejects(parseAccountBackup('{',user));const duplicated=structuredClone(data);duplicated.tasks=[{id:'a',title:'A'},{id:'a',title:'B'}];await assert.rejects(parseAccountBackup(JSON.stringify(envelope(duplicated)),user),/duplicado/);await assert.rejects(parseAccountBackup(JSON.stringify(envelope(data)).replace('"profile":{','"profile":{"__proto__":{},'),user),/Chave/);const corrupt=structuredClone(data);corrupt.documents=[{id:'d',title:'Documento',category:'Pessoal',ext:'PNG',fileData:'QUJD',fileSize:3,sha256:'invalid'}];await assert.rejects(parseAccountBackup(JSON.stringify(envelope(corrupt)),user),/integridade/);});

test('restauração rejeita coleções malformadas antes de afetar a conta',async()=>{for(const [key,row] of [['events',{id:'e',title:'A',date:'inválida',time:'9h',duration:30}],['tasks',{id:'t',title:{html:'x'},category:'Pessoal',done:false}],['journeys',{id:'j',title:'Plano',goal:'Objetivo',steps:[{id:'<x>',title:'A',description:'B',status:'todo'}]}]]){const data=accountState(null,user);data[key]=[row];await assert.rejects(parseAccountBackup(JSON.stringify(envelope(data)),user));}});

test('exportação de conta ainda sem estado é restaurada como organização vazia, sem dados de demonstração',async()=>{const restored=await parseAccountBackup(JSON.stringify(envelope(null)),user);for(const key of ['tasks','events','documents','records','journeys','inbox'])assert.deepEqual(restored[key],[]);assert.equal(restored.profile.name,user.name);});
test('PDF próprio preserva original legado; tamanho, tipo e hash informado são conferidos',async()=>{
 const bytes=Buffer.from('%PDF-1.4\nOriginal sintetico\n%%EOF'),data=accountState(null,user);data.documents=[{id:'pdf',title:'Recibo',category:'Recibos',ext:'PDF',mime:'application/pdf',pdfData:bytes.toString('base64'),fileSize:bytes.length}];
 assert.deepEqual((await parseAccountBackup(JSON.stringify(envelope(data)),user)).documents,data.documents);
 data.documents[0].sha256=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');assert.deepEqual((await parseAccountBackup(JSON.stringify(envelope(data)),user)).documents,data.documents);
 for(const patch of [{fileSize:bytes.length+1},{mime:'text/html'},{sha256:'0'.repeat(64)},{pdfData:'not valid base64'},{pdfData:Buffer.from('Not a PDF').toString('base64'),fileSize:9}]){const invalid=structuredClone(data);Object.assign(invalid.documents[0],patch);await assert.rejects(parseAccountBackup(JSON.stringify(envelope(invalid)),user),/integridade/);}
});
test('PDF acima de 500 KB e original com MIME divergente não entram pela restauração',async()=>{
 const data=accountState(null,user),bytes=Buffer.alloc(512001,65);bytes.write('%PDF-1.4');data.documents=[{id:'large',title:'PDF',category:'Recibos',ext:'PDF',pdfData:bytes.toString('base64'),fileSize:bytes.length}];await assert.rejects(parseAccountBackup(JSON.stringify(envelope(data)),user),/integridade/);
 const png=readFileSync(new URL('fixtures/document-scan.png',import.meta.url)),uploaded=await readUpload({name:'scan.png',size:png.length,arrayBuffer:async()=>png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength)});data.documents=[{id:'png',title:'Scan',category:'Pessoal',...uploaded,mime:'text/html'}];await assert.rejects(parseAccountBackup(JSON.stringify(envelope(data)),user),/integridade/);
});
test('cópia para restauração permanece compacta mesmo com grande histórico externo na exportação completa',async()=>{
 const data=accountState(null,user),snapshot={revision:20,data,integrations:{inbox:'external-history'.repeat(600000)},subscription:{status:'active'}};
 const raw=accountRecoveryJson(snapshot,user),envelope=JSON.parse(raw);assert.equal(envelope.ownerId,user.id);assert.equal(envelope.baseRevision,20);assert.equal(envelope.integrations,undefined);assert.equal(envelope.subscription,undefined);assert.ok(raw.length<10000);assert.deepEqual(await parseAccountBackup(raw,user),data);
 assert.throws(()=>accountRecoveryJson({data:{payload:'a'.repeat(5000001)},revision:1},user),/5 MB/);
});
