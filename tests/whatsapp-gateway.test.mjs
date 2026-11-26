import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {whatsappText} from '../server/whatsapp-gateway.mjs';
import {readState} from '../server/state.mjs';

const origin='https://mentra.test',secret='a'.repeat(64);

async function environment(){
 const DB=integrationDB(),env={DB,WHATSAPP_GATEWAY_SECRET:secret,DEEPSEEK_API_KEY:'synthetic-key'};
 async function call(path,{method='GET',data,cookie}={}){const r=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined}),env);let body;try{body=await r.json();}catch{body=null;}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const users=[];for(const name of ['Ana','Bia']){const r=await call('register',{method:'POST',data:{name,email:name+'@gateway.test',password:'synthetic-gateway-password',plan:'plus',acceptTerms:true}});assert.equal(r.status,200);users.push({...r.body.user,cookie:r.cookie,recoveryCode:r.body.recoveryCode});}
 DB.sql.prepare("UPDATE subscriptions SET status='active'").run();
 let n=0;
 async function gateway(body,{key=secret,timestamp=String(Date.now())}={}){const raw=JSON.stringify(body),r=await worker.fetch(new Request(origin+'/api/whatsapp/gateway',{method:'POST',headers:{'Content-Type':'application/json','x-mentra-timestamp':timestamp,'x-mentra-signature':'sha256='+createHmac('sha256',key).update(timestamp+'.'+raw).digest('hex')},body:raw}),env);return {status:r.status,body:await r.json()};}
 const message=(from,text,extra={})=>gateway({event:'message',id:'msg-'+(++n),from,timestamp:Date.now(),kind:'text',text,...extra});
 async function link(user,phone){const code=await call('whatsapp/link',{method:'POST',cookie:user.cookie,data:{consent:true}});assert.equal(code.status,200);return {code,reply:await message(phone,code.body.command)};}
 return {DB,env,call,users,gateway,message,link};
}
function deepseek(answer){const prior=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://api.deepseek.com/chat/completions');const body=JSON.parse(options.body);calls.push(body);return Response.json({choices:[{finish_reason:answer.tool_calls?'tool_calls':'stop',message:typeof answer==='function'?answer(body):answer}]});};return {calls,restore(){globalThis.fetch=prior;}};}

test('gateway: assinatura HMAC, janela de tempo e configuração são exigidas',async()=>{const c=await environment();try{
 assert.equal((await c.gateway({event:'status',state:'open',number:'5511900000000'},{key:'b'.repeat(64)})).status,401);
 assert.equal((await c.gateway({event:'status',state:'open'},{timestamp:String(Date.now()-600000)})).status,401);
 assert.equal((await c.gateway({event:'nope'})).status,400);
 delete c.env.WHATSAPP_GATEWAY_SECRET;assert.equal((await c.gateway({event:'status',state:'open'})).status,503);
 }finally{c.DB.sql.close();}});

test('gateway: número desconhecido recebe orientação uma vez por dia e nunca aciona a IA',async()=>{const c=await environment(),ai=deepseek({content:'não deveria'});try{
 const first=await c.message('5511911111111','Oi');assert.equal(first.status,200);assert.match(first.body.reply,/Conectar meu WhatsApp/);
 assert.equal((await c.message('5511911111111','Oi de novo')).body.reply,null);assert.equal(ai.calls.length,0);
 }finally{ai.restore();c.DB.sql.close();}});

test('gateway: vínculo por código, resposta individual por conta, histórico no app e PARAR',async()=>{const c=await environment(),[a,b]=c.users;
 const ai=deepseek(body=>({content:'**Resposta** para '+(body.messages.find(m=>m.content.startsWith('Contexto individual'))?'conta':'?')+' — '+body.messages.at(-1).content}));try{
 await c.gateway({event:'status',state:'open',number:'5511900000000'});
 const la=await c.link(a,'5511911111111');assert.match(la.code.body.url,/^https:\/\/wa\.me\/5511900000000\?text=VINCULAR%20[a-f0-9]{32}$/);assert.match(la.reply.body.reply,/Tudo certo, Ana/);
 const lb=await c.link(b,'5511922222222');assert.match(lb.reply.body.reply,/Tudo certo, Bia/);
 // Código de outra conta não toma um número já conectado.
 const steal=await c.call('whatsapp/link',{method:'POST',cookie:b.cookie,data:{consent:true}});assert.match((await c.message('5511911111111',steal.body.command)).body.reply,/outra conta/);
 assert.match((await c.message('5511911111111','VINCULAR '+'0'.repeat(32))).body.reply,/inválido ou já expirou/);
 const ra=await c.message('5511911111111','O que tenho hoje?');assert.equal(ra.body.reply,'*Resposta* para conta — O que tenho hoje?');
 await c.message('5511922222222','Pergunta da Bia');
 const sa=await readState(c.DB,a.id),sb=await readState(c.DB,b.id);
 assert.deepEqual(sa.data.messages.map(m=>[m.role,m.text,m.channel]),[['user','O que tenho hoje?','whatsapp'],['assistant','**Resposta** para conta — O que tenho hoje?','whatsapp']]);
 assert.deepEqual(sb.data.messages.map(m=>m.text),['Pergunta da Bia','**Resposta** para conta — Pergunta da Bia']);
 // O histórico da própria conta acompanha a próxima pergunta; o da outra conta nunca.
 await c.message('5511911111111','E amanhã?');const sent=ai.calls.at(-1).messages.map(m=>m.content);assert.ok(sent.includes('O que tenho hoje?'));assert.ok(!sent.some(t=>t.includes('Bia')));
 assert.match(ai.calls.at(-1).messages[0].content,/pelo WhatsApp/);
 assert.equal(c.DB.sql.prepare('SELECT requests FROM ai_usage WHERE user_id=?').get(a.id).requests,2);
 // Reenvio da mesma mensagem devolve a mesma resposta sem nova cobrança nem duplicar histórico.
 const again=await c.gateway({event:'message',id:'msg-repeat',from:'5511911111111',timestamp:Date.now(),kind:'text',text:'Repetida'}),calls=ai.calls.length;
 assert.deepEqual((await c.gateway({event:'message',id:'msg-repeat',from:'5511911111111',timestamp:Date.now(),kind:'text',text:'Repetida'})).body,again.body);assert.equal(ai.calls.length,calls);
 assert.equal((await readState(c.DB,a.id)).data.messages.filter(m=>m.text==='Repetida').length,1);
 // O app vê o vínculo e o modo conversa.
 const inbox=await c.call('integrations/inbox',{cookie:a.cookie});assert.equal(inbox.body.chat,true);assert.equal(inbox.body.number,'5511900000000');assert.equal(inbox.body.linked.phone,'••••1111');
 // Mensagem antiga (fila de reconexão) é ignorada.
 assert.equal((await c.gateway({event:'message',id:'old',from:'5511911111111',timestamp:Date.now()-3600000,kind:'text',text:'antiga'})).body.reply,null);
 assert.match((await c.message('5511911111111','PARAR')).body.reply,/desconectado/);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM whatsapp_links').get().n,1);
 assert.match((await c.message('5511911111111','Oi')).body.reply,/conecte este número/);
 }finally{ai.restore();c.DB.sql.close();}});

test('gateway: pedido com ação grava na conta certa e confirma pelo servidor',async()=>{const c=await environment(),[a,b]=c.users;
 const ai=deepseek({content:null,tool_calls:[{id:'t1',type:'function',function:{name:'create_task',arguments:JSON.stringify({title:'Ligar para o contador',category:'Pessoal',dueDate:null})}}]});try{
 await c.link(a,'5511911111111');const r=await c.message('5511911111111','Me lembra de ligar para o contador');
 assert.equal(r.body.reply,'Tarefa cadastrada: Ligar para o contador.');
 const state=await readState(c.DB,a.id);assert.equal(state.data.tasks.at(-1).title,'Ligar para o contador');assert.deepEqual(state.data.messages.map(m=>m.role),['user','assistant']);
 assert.equal((await readState(c.DB,b.id)).data,null);
 }finally{ai.restore();c.DB.sql.close();}});

test('gateway: assinatura inativa, limite do plano, tipo não suportado e áudio',async()=>{const c=await environment(),[a]=c.users,ai=deepseek({content:'ok'});try{
 await c.link(a,'5511911111111');
 assert.match((await c.message('5511911111111','',{kind:'other'})).body.reply,/texto e áudios/);
 const wav=new Uint8Array(48);wav.set(new TextEncoder().encode('RIFF'),0);wav.set(new TextEncoder().encode('WAVE'),8);const audio=Buffer.from(wav).toString('base64');
 assert.match((await c.message('5511911111111','',{kind:'audio',audio,mime:'audio/wav'})).body.reply,/não consigo ouvir áudios/);
 c.env.AI={run:async()=>({text:'Quanto gastei este mês?'})};
 assert.equal((await c.message('5511911111111','',{kind:'audio',audio,mime:'audio/wav'})).body.reply,'ok');assert.equal(ai.calls.at(-1).messages.at(-1).content,'Quanto gastei este mês?');
 c.DB.sql.prepare('UPDATE ai_usage SET requests=1000000 WHERE user_id=?').run(a.id);assert.match((await c.message('5511911111111','mais uma')).body.reply,/Limite mensal/);
 c.DB.sql.prepare("UPDATE subscriptions SET status='pending' WHERE user_id=?").run(a.id);
 assert.match((await c.message('5511911111111','Oi')).body.reply,/não está ativa/);assert.equal((await c.message('5511911111111','Oi')).body.reply,null);
 }finally{ai.restore();c.DB.sql.close();}});

test('gateway: painel admin vê QR Code, estado e envia o comando de desconexão uma única vez',async()=>{const c=await environment(),[a,b]=c.users;try{
 c.DB.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(a.id);
 assert.equal((await c.call('admin/whatsapp',{cookie:b.cookie})).status,403);
 assert.equal((await c.call('admin/whatsapp',{cookie:a.cookie})).body.state,'offline');
 const qr='data:image/png;base64,AAAA';await c.gateway({event:'status',state:'qr',qr});
 let view=(await c.call('admin/whatsapp',{cookie:a.cookie})).body;assert.equal(view.state,'qr');assert.equal(view.qr,qr);assert.equal(view.configured,true);
 await c.gateway({event:'status',state:'open',number:'5511900000000'});view=(await c.call('admin/whatsapp',{cookie:a.cookie})).body;assert.equal(view.state,'open');assert.equal(view.qr,null);assert.equal(view.number,'5511900000000');
 assert.equal((await c.call('admin/whatsapp',{cookie:a.cookie,method:'POST',data:{action:'logout'}})).status,200);
 assert.equal((await c.call('admin/activity',{cookie:a.cookie})).body.items[0].kind,'whatsapp_gateway_logout');
 assert.equal((await c.gateway({event:'status',state:'open',number:'5511900000000'})).body.command,'logout');
 assert.equal((await c.gateway({event:'status',state:'open',number:'5511900000000'})).body.command,null);
 c.DB.sql.prepare("UPDATE product_settings SET updated_at=? WHERE key='whatsapp_gateway'").run(Date.now()-600000);
 assert.equal((await c.call('admin/whatsapp',{cookie:a.cookie})).body.state,'offline');
 }finally{c.DB.sql.close();}});

test('formatação: Markdown da IA vira texto nativo do WhatsApp',()=>{
 assert.equal(whatsappText('## Hoje\n\n**Reunião** às 14h\n- item um\n* item dois\n\n\n\n[site](https://mentra.test/x)'),'*Hoje*\n\n*Reunião* às 14h\n• item um\n• item dois\n\nsite: https://mentra.test/x');
});

test('cérebro: orientações do admin entram no app e no WhatsApp sem vazar a parte exclusiva do WhatsApp',async()=>{const c=await environment(),[a,b]=c.users,ai=deepseek({content:'ok'});try{
 c.DB.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(a.id);
 assert.equal((await c.call('admin/brain',{cookie:b.cookie})).status,403);
 const empty=await c.call('admin/brain',{cookie:a.cookie});assert.deepEqual([empty.body.general,empty.body.whatsapp,empty.body.revision],['','',0]);
 assert.equal((await c.call('admin/brain',{cookie:a.cookie,method:'PUT',data:{general:'x'.repeat(3001),whatsapp:'',revision:0}})).status,400);
 const saved=await c.call('admin/brain',{cookie:a.cookie,method:'PUT',data:{general:' Fale com acolhimento. ',whatsapp:'No máximo um emoji.',revision:0}});assert.equal(saved.status,200);assert.equal(saved.body.general,'Fale com acolhimento.');
 assert.equal((await c.call('admin/brain',{cookie:a.cookie,method:'PUT',data:{general:'outra',whatsapp:'',revision:0}})).status,409);
 assert.equal((await c.call('chat',{cookie:b.cookie,method:'POST',data:{messages:[{role:'user',content:'Oi'}]}})).status,200);
 let system=ai.calls.at(-1).messages[0].content;assert.match(system,/Fale com acolhimento\./);assert.doesNotMatch(system,/um emoji/);assert.match(system,/nunca anulam as regras anteriores/);
 await c.link(b,'5511922222222');await c.message('5511922222222','Oi');system=ai.calls.at(-1).messages[0].content;assert.match(system,/Fale com acolhimento\.\nNo máximo um emoji\./);
 assert.equal((await c.call('admin/activity',{cookie:a.cookie})).body.items[0].kind,'brain_guidance_updated');
 }finally{ai.restore();c.DB.sql.close();}});

test('segurança: troca de senha e recuperação de conta revogam vínculos e códigos de WhatsApp',async()=>{const c=await environment(),[a,b]=c.users,ai=deepseek({content:'segredo'});try{
 await c.link(a,'5511933333333');
 assert.equal((await c.call('account/password',{cookie:a.cookie,method:'POST',data:{currentPassword:'synthetic-gateway-password',password:'new-synthetic-gateway-password'}})).status,200);
 assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM whatsapp_links WHERE user_id=?').get(a.id).n,0);
 const r1=await c.message('5511933333333','Oi');assert.match(r1.body.reply,/conecte este número/i);assert.equal(ai.calls.length,0);
 await c.link(b,'5511944444444');
 assert.equal((await c.call('recover',{method:'POST',data:{email:b.email,recoveryCode:b.recoveryCode,password:'recovered-gateway-password'}})).status,200);
 assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM whatsapp_links WHERE user_id=?').get(b.id).n,0);
 }finally{ai.restore();c.DB.sql.close();}});

test('agente externo: gate, contexto por conta, ação gravada e registro da conversa',async()=>{const c=await environment(),[a,b]=c.users;try{
 await c.gateway({event:'status',state:'open',number:'5511900000000'});
 const unknown=await c.gateway({event:'gate',id:'g-1',from:'5511911111111',text:'Oi'});assert.equal(unknown.body.allow,false);assert.match(unknown.body.reply,/Conectar meu WhatsApp/);
 assert.equal((await c.gateway({event:'gate',id:'g-2',from:'5511911111111',text:'Oi'})).body.reply,null);
 assert.deepEqual((await c.gateway({event:'context',id:'t-0',from:'5511911111111',question:'oi',charge:true})).body,{block:'Este número não está conectado a uma conta ativa da Mentra.'});
 assert.match((await c.gateway({event:'act',id:'a-0',from:'5511911111111',calls:[{name:'create_task',arguments:{title:'Invasão',category:'Pessoal',dueDate:null}}]})).body.error,/não está conectado/);
 const code=await c.call('whatsapp/link',{method:'POST',cookie:a.cookie,data:{consent:true}});
 const linked=await c.gateway({event:'gate',id:'g-3',from:'5511911111111',text:code.body.command});assert.equal(linked.body.allow,false);assert.match(linked.body.reply,/Tudo certo, Ana/);
 assert.deepEqual((await c.gateway({event:'gate',id:'g-4',from:'5511911111111',text:''})).body,{allow:true,name:'Ana'});
 const ctx=await c.gateway({event:'context',id:'t-1',from:'5511911111111',question:'o que tenho hoje?',charge:true});
 assert.match(ctx.body.context,/Pessoa: Ana\./);assert.match(ctx.body.context,/dados_conta_somente_leitura/);assert.match(ctx.body.brief,/consultar_mentra/);
 assert.equal(c.DB.sql.prepare('SELECT requests FROM ai_usage WHERE user_id=?').get(a.id).requests,1);
 await c.gateway({event:'context',id:'t-1b',from:'5511911111111',question:'x'});assert.equal(c.DB.sql.prepare('SELECT requests FROM ai_usage WHERE user_id=?').get(a.id).requests,1);
 const act={event:'act',id:'a-1',from:'5511911111111',calls:[{name:'create_task',arguments:{title:'Comprar pão',category:'Pessoal',dueDate:null}}]};
 const done=await c.gateway(act);assert.match(done.body.text,/Tarefa cadastrada: Comprar pão/);
 assert.match((await c.gateway(act)).body.text,/Comprar pão/);
 const sa=(await readState(c.DB,a.id)).data,sb=(await readState(c.DB,b.id)).data;
 assert.equal(sa.tasks.filter(t=>t.title==='Comprar pão').length,1);assert.ok(!(sb?.tasks||[]).some(t=>t.title==='Comprar pão'));
 assert.match((await c.gateway({event:'act',id:'a-2',from:'5511911111111',calls:[{name:'delete_everything',arguments:{}}]})).body.error,/não permitida/);
 assert.equal((await c.gateway({event:'log',id:'t-1',from:'5511911111111',question:'Anota comprar pão',answer:'Anotado!'})).body.ok,true);
 const messages=(await readState(c.DB,a.id)).data.messages.filter(m=>m.channel==='whatsapp');assert.deepEqual(messages.map(m=>m.text),['Anota comprar pão','Anotado!']);
 assert.equal((await c.gateway({event:'log',id:'t-9',from:'5511922222222',question:'x',answer:'y'})).body.ok,false);
 }finally{c.DB.sql.close();}});

test('agente externo: foto lida por OCR, conta a pagar, recibo e documento guardado na conta certa',async()=>{const c=await environment(),[a,b]=c.users,from='5511911111111';try{
 const jpeg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(300,7)]),photo=jpeg.toString('base64'),seen=[];
 delete c.env.DEEPSEEK_API_KEY;// este teste cobre a leitura pelo Workers AI; a do DeepSeek está em vision.test.mjs
 c.env.AI={run:async(model,input)=>{seen.push({model,input});return {response:'BANCO AURORA\nComprovante de pagamento Pix\nValor: R$ 187,45\nData: 18/11/2026'};},toMarkdown:async()=>({format:'markdown',data:'# a.pdf\n## Metadata\n- x\n## Contents\n### Page 1\nContrato de aluguel'})};
 assert.match((await c.gateway({event:'read',id:'r-0',from,data:photo})).body.error,/não está conectado/);assert.equal(seen.length,0);
 const code=await c.call('whatsapp/link',{method:'POST',cookie:a.cookie,data:{consent:true}});await c.gateway({event:'gate',id:'g-1',from,text:code.body.command});
 const read=await c.gateway({event:'read',id:'r-1',from,data:photo});assert.match(read.body.text,/R\$ 187,45/);assert.equal(read.body.mime,'image/jpeg');
 assert.match(seen[0].model,/mistral/);assert.match(seen[0].input.messages[0].content[1].image_url.url,/^data:image\/jpeg;base64,/);
 assert.match((await c.gateway({event:'read',id:'r-2',from,data:Buffer.from('%PDF-1.4 conteudo').toString('base64')})).body.text,/^Contrato de aluguel$/);
 assert.match((await c.gateway({event:'read',id:'r-3',from,data:Buffer.from('texto qualquer').toString('base64')})).body.error,/foto \(JPEG ou PNG\) ou um PDF/);
 assert.match((await c.gateway({event:'read',id:'r-4',from,data:'@@@'})).body.error,/inválido/);
 const bill=await c.gateway({event:'act',id:'a-1',from,calls:[{name:'create_obligation',arguments:{title:'Conta de luz novembro',kind:'payable',cents:18745,dueDate:'2026-12-20',category:'Moradia'}}]});
 assert.match(bill.body.text,/Conta a pagar cadastrada: Conta de luz novembro, R\$\s187,45, vencimento em 20\/12\/2026/);
 const receipt=await c.gateway({event:'act',id:'a-2',from,calls:[{name:'create_receipt',arguments:{title:'Pintura da sala',type:'income',cents:25000,date:'2026-11-18',payer:'João Lima',payee:'Ana',category:'Serviços',accountName:null,paymentMethod:'pix'}}]});
 assert.match(receipt.body.text,/Recibo gerado: Pintura da sala, R\$\s250,00, pago por João Lima a Ana em 18\/11\/2026/);
 assert.match((await c.gateway({event:'act',id:'a-3',from,calls:[{name:'save_document',arguments:{title:'Comprovante luz',area:'documentos',category:'Comprovantes',note:null,importantDate:null}}]})).body.error,/não permitida/);
 const save={event:'act',id:'a-4',from,attachment:{data:photo,name:'img_123.jpeg',text:'Valor: R$ 187,45'},calls:[{name:'save_document',arguments:{title:'Comprovante luz',area:'documentos',category:'Comprovantes',note:'Pix de R$ 187,45 em 18/11/2026',importantDate:null}}]};
 assert.match((await c.gateway(save)).body.text,/Documento guardado: Comprovante luz, em Documentos/);
 assert.match((await c.gateway(save)).body.text,/Documento guardado/);
 assert.match((await c.gateway({...save,id:'a-5'})).body.error,/já está guardado/);
 assert.match((await c.gateway({...save,id:'a-6',attachment:{data:Buffer.alloc(600*1024,1).toString('base64'),name:'x'}})).body.error,/500 KB/);
 const sa=(await readState(c.DB,a.id)).data,sb=(await readState(c.DB,b.id)).data;
 assert.equal(sa.obligations.length,1);assert.equal(sa.obligations[0].status,'open');assert.equal(sa.obligations[0].cents,18745);
 assert.equal(sa.records.length,1);assert.equal(sa.records[0].type,'income');assert.equal(sa.records[0].cents,25000);
 const draft=sa.documents.find(d=>d.kind==='receipt_draft'),file=sa.documents.find(d=>d.title==='Comprovante luz');
 assert.equal(draft.recordId,sa.records[0].id);assert.equal(draft.payload.payer,'João Lima');assert.equal(draft.payload.methodLabel,'Pix');assert.equal(draft.payload.cents,25000);
 assert.equal(sa.documents.length,2);assert.equal(file.mime,'image/jpeg');assert.equal(file.originalName,'img_123.jpg');assert.equal(file.fileData,photo);assert.equal(file.extractedText,'Valor: R$ 187,45');assert.equal(file.area,'documentos');
 assert.ok(!sb?.documents?.length&&!sb?.records?.length);
 }finally{c.DB.sql.close();}});

test('recibo gerado pela IA abre como PDF no aplicativo',async()=>{
 const {prepareActions}=await import('../server/ai-actions.mjs'),{createReceiptPdf}=await import('../dist/pdf.mjs');
 const call={type:'function',function:{name:'create_receipt',arguments:JSON.stringify({title:'Aula particular',type:'income',cents:12000,date:'2026-11-19',payer:'Carla',payee:'Ana',category:'Serviços',accountName:null,paymentMethod:'cash'})}};
 const prepared=prepareActions(null,{id:'a',name:'Ana'},[call],'req-recibo-1','whatsapp'),doc=prepared.state.documents[0];
 assert.equal(doc.kind,'receipt_draft');assert.equal(Buffer.from(createReceiptPdf(doc.payload)).subarray(0,5).toString(),'%PDF-');
 assert.throws(()=>prepareActions(null,{id:'a',name:'Ana'},[{type:'function',function:{name:'save_document',arguments:'{}'}}],'req-doc-1','whatsapp'),{status:422});
});
