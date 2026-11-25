import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {integrationBody} from '../server/integration-utils.mjs';

const origin='https://mentra.test';
function streamed(bytes,chunkSize=65536){
 let offset=0,cancelled=false;
 const body=new ReadableStream({pull(controller){if(offset===bytes.length){controller.close();return;}const next=Math.min(bytes.length,offset+chunkSize);controller.enqueue(bytes.subarray(offset,next));offset=next;},cancel(){cancelled=true;}});
 const request=new Request(origin+'/api/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body,duplex:'half'});
 return {request,cancelled:()=>cancelled,read:()=>offset};
}
const registration=name=>JSON.stringify({name,email:'request-limit@example.test',password:'synthetic-request-password-2026',plan:'plus'});

test('JSON sem Content-Length respeita limite em bytes e interrompe fluxo excedente',async()=>{
 const DB=integrationDB();try{
  const bytes=new TextEncoder().encode(registration('é'.repeat(3200000))),s=streamed(bytes);
  assert.equal(s.request.headers.get('content-length'),null);
  const response=await worker.fetch(s.request,{DB});assert.equal(response.status,413);assert.equal(s.cancelled(),true);assert.ok(s.read()<bytes.length);assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
 }finally{DB.sql.close();}
});

test('UTF-8 inválido não é substituído silenciosamente ao salvar JSON',async()=>{
 const DB=integrationDB();try{
  const prefix=new TextEncoder().encode('{"name":"'),suffix=new TextEncoder().encode('","email":"invalid-utf8@example.test","password":"synthetic-request-password-2026","plan":"plus"}');
  const bytes=new Uint8Array(prefix.length+2+suffix.length);bytes.set(prefix);bytes.set([0xc3,0x28],prefix.length);bytes.set(suffix,prefix.length+2);
  assert.equal((await worker.fetch(streamed(bytes).request,{DB})).status,400);assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
 }finally{DB.sql.close();}
});

test('JSON UTF-8 válido dividido entre chunks conserva acentos e comportamento do cadastro',async()=>{
 const DB=integrationDB();try{
  const response=await worker.fetch(streamed(new TextEncoder().encode(registration('José QA')),1).request,{DB});assert.equal(response.status,200);assert.equal((await response.json()).user.name,'José QA');
 }finally{DB.sql.close();}
});

test('rotas das integrações também recusam UTF-8 inválido antes de aplicar dados',async()=>{
 const bytes=new Uint8Array([123,34,120,34,58,34,195,40,34,125]);
 await assert.rejects(integrationBody(streamed(bytes,1).request),error=>error.status===400);
});
