import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,unlockVault,encryptEntry,decryptEntry,changeMaster,generatePassword,passwordStrength,isVault,validateEntry} from '../dist/vault-core.mjs';
import {createVaultUI} from '../dist/vault-ui.mjs';

const FAST={iterations:1000};
const MASTER='café forte às sete';

test('cofre guarda só texto cifrado e abre apenas com a senha mestra certa',async()=>{
 const {vault,key}=await createVault(MASTER,FAST);assert.ok(isVault(vault));
 const item=await encryptEntry(key,{title:'Banco',username:'ana@exemplo.com',password:'S3gredo!Muito',url:'banco.com',note:'agência 1'},{id:'x'});
 const raw=JSON.stringify({...vault,items:[item]});
 for(const secret of ['Banco','ana@exemplo.com','S3gredo!Muito','banco.com','agência 1',MASTER])assert.ok(!raw.includes(secret),'vazou '+secret);
 await assert.rejects(unlockVault(vault,'senha errada qualquer'),/incorreta/);
 const again=await unlockVault(vault,MASTER);assert.equal((await decryptEntry(again,item)).password,'S3gredo!Muito');
});

test('item adulterado não é aceito',async()=>{
 const {key}=await createVault(MASTER,FAST);const item=await encryptEntry(key,{title:'A',password:'b'},{id:'1'});
 const bytes=Buffer.from(item.ct,'base64');bytes[0]^=1;await assert.rejects(decryptEntry(key,{...item,ct:bytes.toString('base64')}));
});

test('troca de senha mestra recifra tudo e invalida a antiga',async()=>{
 const {vault,key}=await createVault(MASTER,FAST);const items=[await encryptEntry(key,{title:'Wi-Fi',password:'casa12345'},{id:'w'})];
 const {vault:next,key:k2}=await changeMaster({...vault,items},key,'nova frase bem longa',FAST);
 await assert.rejects(unlockVault(next,MASTER),/incorreta/);await unlockVault(next,'nova frase bem longa');
 assert.equal(next.items[0].id,'w');assert.equal((await decryptEntry(k2,next.items[0])).password,'casa12345');
});

test('validação, senha mestra curta e gerador',async()=>{
 await assert.rejects(createVault('curta',FAST),/pelo menos/);
 assert.throws(()=>validateEntry({title:'',password:'x'}),/nome/);assert.throws(()=>validateEntry({title:'x',password:''}),/senha/);
 const seen=new Set();for(let i=0;i<50;i++){const pw=generatePassword();assert.equal(pw.length,20);assert.match(pw,/[A-Z]/);assert.match(pw,/[a-z]/);assert.match(pw,/\d/);assert.match(pw,/[^A-Za-z0-9]/);seen.add(pw);}
 assert.equal(seen.size,50);assert.equal(passwordStrength(generatePassword()).label,'Forte');assert.equal(passwordStrength('123').label,'Fraca');
});

function fixture(initial={}){
 let state={documents:[],...initial},saves=0,dialog='',toastMsg='';const error={textContent:''};
 globalThis.document={querySelector:sel=>sel==='#vault-error'?error:null,addEventListener(){}};
 globalThis.FormData=class{constructor(form){this.form=form;}[Symbol.iterator](){return Object.entries(this.form.values)[Symbol.iterator]();}};
 const ui=createVaultUI({getState:()=>state,setState:v=>{state=v;},save:()=>{saves++;return true;},toast:m=>{toastMsg=m;},render(){},modal:(t,b)=>{dialog=t+b;},closeModal:()=>{dialog='';}});
 const submit=async(id,values)=>{ui.handleSubmit({id,values});for(let i=0;i<200&&!ui.__idle?.();i++)await new Promise(r=>setTimeout(r,20));};
 return {ui,state:()=>state,dialog:()=>dialog,error,toast:()=>toastMsg,saves:()=>saves,submit};
}
const wait=async(cond)=>{for(let i=0;i<400;i++){if(cond())return;await new Promise(r=>setTimeout(r,25));}throw Error('timeout');};

test('interface: criar, guardar, trancar e reabrir sem expor segredos no HTML trancado',async()=>{
 const {vault}=await createVault(MASTER,FAST);const f=fixture({vault});
 assert.match(f.ui.renderPage(),/TRANCADO/);
 f.ui.handleSubmit({id:'vault-unlock-form',values:{master:'errada errada'}});await wait(()=>f.error.textContent);assert.match(f.error.textContent,/incorreta/);
 f.ui.handleSubmit({id:'vault-unlock-form',values:{master:MASTER}});await wait(()=>f.ui.isUnlocked());
 f.ui.handleClick('vault-add',{});assert.match(f.dialog(),/Guardar nova senha/);
 f.ui.handleSubmit({id:'vault-entry-form',values:{title:'<b>Email</b>',username:'eu',password:'Pa$$w0rd-longa',url:'',note:''}});await wait(()=>f.state().vault.items.length===1);
 assert.ok(!JSON.stringify(f.state()).includes('Pa$$w0rd-longa'));
 await wait(()=>/&lt;b&gt;Email/.test(f.ui.renderPage()));const html=f.ui.renderPage();assert.doesNotMatch(html,/<b>Email/);assert.doesNotMatch(html,/Pa\$\$w0rd-longa/);
 const itemId=f.state().vault.items[0].id;f.ui.handleClick('vault-reveal',{id:itemId});assert.match(f.ui.renderPage(),/Pa\$\$w0rd-longa/);
 f.ui.lock(true);const locked=f.ui.renderPage();assert.match(locked,/TRANCADO/);assert.doesNotMatch(locked,/Email|Pa\$\$w0rd/);
});

test('interface: exclusão exige confirmação do mesmo item e reset apaga o cofre',async()=>{
 const {vault,key}=await createVault(MASTER,FAST);const items=[await encryptEntry(key,{title:'A',password:'1'},{id:'a'}),await encryptEntry(key,{title:'B',password:'2'},{id:'b'})];
 const f=fixture({vault:{...vault,items}});f.ui.handleSubmit({id:'vault-unlock-form',values:{master:MASTER}});await wait(()=>f.ui.isUnlocked());
 f.ui.handleClick('vault-confirm-delete',{id:'a'});assert.equal(f.state().vault.items.length,2);
 f.ui.handleClick('vault-request-delete',{id:'a'});f.ui.handleClick('vault-confirm-delete',{id:'b'});assert.equal(f.state().vault.items.length,2);
 f.ui.handleClick('vault-confirm-delete',{id:'a'});assert.deepEqual(f.state().vault.items.map(i=>i.id),['b']);
 f.ui.handleClick('vault-confirm-reset',{});assert.ok(f.state().vault);f.ui.handleClick('vault-request-reset',{});f.ui.handleClick('vault-confirm-reset',{});
 assert.equal(f.state().vault,null);assert.match(f.ui.renderPage(),/Criar meu cofre/);
});
