import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentSharesUI} from '../dist/document-shares-ui.mjs';
import {createSharedDocumentUI} from '../dist/shared-document.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function owner(t){
 const previous={document:globalThis.document,FormData:globalThis.FormData,location:globalThis.location};t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 const error={textContent:''};globalThis.document={querySelector:s=>s==='#share-error'?error:null,querySelectorAll:()=>[]};globalThis.FormData=class{constructor(f){this.values=f.values;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}};globalThis.location={origin:'https://mentra.test'};
 let dialog='',flush=true,failCreate=false,ui;const calls=[];
 const preview={document:{id:'doc',title:'Contrato <privado>',filename:'original.png',size:100,sha256:'a'.repeat(64)},recipient:{id:'recipient',name:'Pessoa <script>',email:'person@example.test'},hours:24,revision:1,signature:'b'.repeat(64)};
 ui=createDocumentSharesUI({getState:()=>({documents:[{id:'doc',title:'Contrato',fileData:'QQ=='}]}),flush:async()=>flush,modal:(title,body)=>{dialog=title+body;},closeModal:()=>ui.cancelPending(),api:async()=>({shares:[{id:'grant',recipient_name:'Pessoa',recipient_email:'person@example.test',expires_at:Date.now()+86400000,status:'active'}]}),send:async(path,body,method)=>{calls.push({path,body,method});if(path.endsWith('/preview'))return preview;if(path==='document-shares'){if(failCreate){failCreate=false;throw Error('Resposta perdida');}return {id:'grant',url:'https://mentra.test/share#'+body.clientToken,expiresAt:Date.now()+86400000,recipient:preview.recipient};}return {ok:true};}});
 return {ui,calls,error,dialog:()=>dialog,setFlush:v=>flush=v,failOnce:()=>failCreate=true,click:async(key,id)=>{ui.handleClick('share-'+key,{id});await tick();},submit:async()=>{ui.handleSubmit({id:'share-create-form',dataset:{id:'doc'},values:{recipientEmail:'person@example.test',hours:'24'},checkValidity:()=>true});await tick();}};
}
test('revisão identifica destinatário e original, escapa os dados e cancelar não concede acesso',async t=>{
 const c=owner(t);await c.ui.open('doc');await c.submit();assert.equal(c.calls.length,1);assert.match(c.dialog(),/person@example.test/);assert.match(c.dialog(),/Pessoa &lt;script&gt;/);assert.doesNotMatch(c.dialog(),/Pessoa <script>/);c.ui.cancelPending();await c.click('confirm');assert.equal(c.calls.length,1);
});
test('perda de resposta conserva a tentativa e dupla confirmação não cria outro link',async t=>{
 const c=owner(t);await c.ui.open('doc');await c.submit();c.failOnce();await c.click('confirm');assert.match(c.error.textContent,/Resposta perdida/);await c.click('confirm');const requests=c.calls.filter(x=>x.path==='document-shares');assert.equal(requests.length,2);assert.deepEqual(requests[0].body,requests[1].body);assert.match(c.dialog(),/Acesso criado/);await c.click('confirm');assert.equal(c.calls.filter(x=>x.path==='document-shares').length,2);
});
test('sincronização pendente não concede acesso e revogação cancelada não é enviada',async t=>{
 const c=owner(t);await c.ui.open('doc');c.setFlush(false);await c.submit();assert.equal(c.calls.length,0);c.setFlush(true);await c.click('revoke-review','grant');c.ui.cancelPending();await c.click('revoke-confirm');assert.equal(c.calls.length,0);
});

function recipient({authenticated=true,denied=false}={}){
 const events={},error={textContent:''},root={innerHTML:'',querySelector:()=>error,addEventListener:(name,fn)=>events[name]=fn};let downloads=0,reads=0;
 const ui=createSharedDocumentUI({root,token:'a'.repeat(64),api:async()=>{reads++;if(!authenticated)throw Object.assign(Error('Entre'),{status:401});return {user:{email:'recipient@example.test'}};},send:async()=>{if(denied)throw Object.assign(Error('Link indisponível.'),{status:404});return {title:'Original <script>',filename:'documento.png',size:100,ownerName:'Remetente',expiresAt:Date.now()+1000};},download:async()=>{downloads++;if(denied)throw Error('Link revogado.');}});
 return {ui,root,error,reads:()=>reads,downloads:()=>downloads,deny:()=>denied=true,click:()=>events.click({target:{closest:()=>({dataset:{shared:'download'},disabled:false,isConnected:true})}})};
}
test('destinatário sem sessão vê login, não o título nem o arquivo',async()=>{const c=recipient({authenticated:false});await c.ui.start();assert.match(c.root.innerHTML,/shared-login/);assert.ok(!c.root.innerHTML.includes('Original'));assert.equal(c.downloads(),0);});
test('abertura não baixa automaticamente; revogação posterior não anuncia download concluído',async()=>{const c=recipient();await c.ui.start();assert.match(c.root.innerHTML,/Original &lt;script&gt;/);assert.doesNotMatch(c.root.innerHTML,/Original <script>/);assert.equal(c.downloads(),0);c.deny();await c.click();assert.equal(c.downloads(),1);assert.match(c.error.textContent,/revogado/);assert.doesNotMatch(c.error.textContent,/Download solicitado/);});
test('conta incorreta recebe erro sem metadados do original',async()=>{const c=recipient({denied:true});await c.ui.start();assert.match(c.root.innerHTML,/Link indisponível/);assert.ok(!c.root.innerHTML.includes('Original &lt;script&gt;'));assert.equal(c.downloads(),0);});
