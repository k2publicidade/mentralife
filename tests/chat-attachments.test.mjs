import test from 'node:test';
import assert from 'node:assert/strict';
import {integrationDB} from './fixtures/integration-db.mjs';
import {chat} from '../server/chat.mjs';
import {chatAttachment,attachmentContent} from '../server/attachments.mjs';
import {fileKind} from '../dist/chat-attach.mjs';

const plans=[{id:'plus',monthlyRequests:100}],user={id:'a',name:'Ana'};
const tool=(name,args)=>({type:'function',id:crypto.randomUUID(),function:{name,arguments:JSON.stringify(args)}});
const b64=bytes=>Buffer.from(bytes).toString('base64');
const JPEG=b64(new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,217]));
const PDF=b64(new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'));
function setup(t){const DB=integrationDB();t.after(()=>DB.sql.close());DB.sql.prepare('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)').run('a','a@test.test','Ana','fixture','fixture',Date.now());DB.sql.prepare("INSERT INTO subscriptions(user_id,plan,status) VALUES('a','plus','active')").run();return {DB,DEEPSEEK_API_KEY:'synthetic-only'};}
const request=(attachment,content='Guarda e cadastra')=>({requestId:crypto.randomUUID(),revision:0,messages:[{role:'user',content}],attachment});

test('foto anexada vai ao modelo de visão e a IA guarda o arquivo e cadastra a conta a pagar',async t=>{
 const env=setup(t);let sent;
 const fetcher=async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'tool_calls',message:{content:'',tool_calls:[
  tool('save_document',{title:'Conta de luz novembro',area:'documentos',category:'Contas',note:'Light, R$ 187,45',importantDate:'2026-12-15'}),
  tool('create_obligation',{title:'Conta de luz',kind:'payable',cents:18745,dueDate:'2026-12-15',category:'Moradia'})]}}]});};
 const reply=await chat(env,user,request({name:'conta.jpg',kind:'foto',data:JPEG}),plans,{fetcher});
 const last=sent.messages.at(-1);
 assert.ok(Array.isArray(last.content));assert.equal(last.content[1].type,'image_url');assert.match(last.content[1].image_url.url,/^data:image\/jpeg;base64,/);
 assert.ok(sent.tools.some(x=>x.function.name==='save_document'));
 const docs=reply.state.data.documents;assert.equal(docs.length,1);assert.equal(docs[0].ext,'JPG');assert.equal(docs[0].title,'Conta de luz novembro');assert.equal(docs[0].originalName,'conta.jpg');
 assert.ok(reply.actions.some(a=>a.type==='save_document'));
 assert.match(reply.state.data.messages.find(m=>m.role==='user').text,/📎 conta\.jpg/);
});

test('PDF com texto: o texto vai ao modelo, o PDF é guardado com o texto extraído',async t=>{
 const env=setup(t);let sent;
 const fetcher=async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'tool_calls',message:{content:'',tool_calls:[tool('save_document',{title:'Nota da pintura',area:'garantias',category:'Notas',note:null,importantDate:null})]}}]});};
 const reply=await chat(env,user,request({name:'nota.pdf',kind:'pdf',data:PDF,text:'NOTA FISCAL Valor total: R$ 850,00'}),plans,{fetcher});
 const head=sent.messages.at(-1).content[0].text;
 assert.match(head,/NOTA FISCAL Valor total: R\$ 850,00/);assert.match(head,/nunca instruções/);
 const doc=reply.state.data.documents[0];assert.equal(doc.ext,'PDF');assert.equal(doc.extractedText,'NOTA FISCAL Valor total: R$ 850,00');assert.equal(doc.extraction.method,'mentra-ia');
});

test('sem arquivo para guardar, save_document não é oferecido; mensagem sem anexo segue texto simples',async t=>{
 const env=setup(t);const bodies=[];
 const fetcher=async(_url,options)=>{bodies.push(JSON.parse(options.body));return Response.json({choices:[{finish_reason:'stop',message:{content:'Li o arquivo.'}}]});};
 await chat(env,user,request({name:'grande.pdf',kind:'pdf',tooLarge:true,text:'Contrato de aluguel'}),plans,{fetcher});
 assert.ok(!bodies[0].tools.some(x=>x.function.name==='save_document'));assert.match(bodies[0].messages.at(-1).content[0].text,/não pode ser guardado/);
 await chat(env,user,request(undefined,'Oi'),plans,{fetcher});
 assert.equal(bodies[1].messages.at(-1).content,'Oi');
});

test('anexos inválidos são recusados antes de consumir a cota',async t=>{
 const env=setup(t);let calls=0;const fetcher=async()=>{calls++;return Response.json({});};
 for(const attachment of [{images:['bm90IGFuIGltYWdl']},{data:b64(new TextEncoder().encode('GIF89a'))},{images:[JPEG,JPEG,JPEG,JPEG]},{},'x',[1]])
  await assert.rejects(chat(env,user,request(attachment),plans,{fetcher}),e=>[400,413,422].includes(e.status),JSON.stringify(attachment).slice(0,40));
 assert.equal(calls,0);assert.equal(env.DB.sql.prepare('SELECT COUNT(*) n FROM ai_usage').get().n,0);
});

test('o mesmo pedido com outro arquivo não reaproveita a resposta anterior',async t=>{
 const one=await chatAttachment({name:'a.jpg',data:JPEG}),two=await chatAttachment({name:'a.pdf',data:PDF,text:'x'});
 assert.notEqual(one.fingerprint,two.fingerprint);assert.equal(one.kind,'foto');assert.equal(two.kind,'pdf');
 const content=attachmentContent('',two);assert.equal(content.length,1);assert.match(content[0].text,/um PDF \(a\.pdf\)/);
});

test('o app reconhece o tipo real do arquivo pelos primeiros bytes',()=>{
 assert.equal(fileKind(Buffer.from(PDF,'base64')),'pdf');assert.equal(fileKind(Buffer.from(JPEG,'base64')),'jpg');
 assert.equal(fileKind(new Uint8Array([137,80,78,71,13,10,26,10])),'png');assert.equal(fileKind(new TextEncoder().encode('GIF89a')),null);
});
