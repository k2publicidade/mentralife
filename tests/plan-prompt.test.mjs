import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planActive,needsPlanPrompt,planPromptState,planPromptMarkup,installPlanPrompt} from '../dist/plan-prompt.mjs';

const now=Date.UTC(2026,10,26,12),DAY=86400000;
const user={id:'u1',name:'Ana Souza',role:'user'};

test('o popup aparece para toda conta sem plano ativo e some quando o plano está ativo',()=>{
 for(const subscription of [{status:'pending',plan:'essencial'},{status:'expired'},{status:'canceled'},{status:'active',current_period_end:now-1},{},undefined])
  assert.equal(needsPlanPrompt({user,subscription},now),true,JSON.stringify(subscription));
 assert.equal(needsPlanPrompt({user,subscription:{status:'active',current_period_end:now+DAY}},now),false);
 assert.equal(needsPlanPrompt({user,subscription:{status:'active',current_period_end:null}},now),false);
 assert.equal(needsPlanPrompt({user:{...user,role:'admin'},subscription:{status:'pending'}},now),false);
 assert.equal(needsPlanPrompt(null,now),false);
 assert.equal(planActive({status:'active',current_period_end:now},now),false);
 assert.equal(planPromptState({status:'active',current_period_end:now-1},now),'expired');
 assert.equal(planPromptState({status:'pending'},now),'pending');
});

test('o texto explica o próximo passo; no app nativo não há preço, PIX nem link de compra',()=>{
 const web=planPromptMarkup({subscription:{status:'pending'},name:'Ana <b>Souza</b>',now});
 assert.match(web,/Ana, ative seu plano para começar/);assert.match(web,/PIX/);assert.match(web,/Ativar meu plano/);assert.match(web,/Agora não/);
 assert.doesNotMatch(web,/<b>/);
 assert.match(planPromptMarkup({subscription:{status:'expired'},now}),/Renovar meu plano/);
 const app=planPromptMarkup({subscription:{status:'pending'},native:true,now});
 assert.match(app,/Ver meu plano/);
 assert.doesNotMatch(app,/PIX|R\$|href=|pague|pagar|comprar|site/i);
});

function fakeDom(hash=''){
 const listeners={},body={children:[],append(node){this.children.push(node);node.parent=this;}};
 const doc={body,querySelector:sel=>body.children.find(n=>'#'+n.id===sel)||null,createElement:()=>({
  attrs:{},open:false,returnValue:'',
  setAttribute(k,v){this.attrs[k]=v;},
  addEventListener(type,fn){(listeners[type]||=[]).push(fn);},
  querySelector(sel){const m=/data-plan-prompt="(\w+)"/.exec(sel);return m&&this.innerHTML.includes(`data-plan-prompt="${m[1]}"`)?{focus:()=>{doc.focused=m[1];}}:null;},
  showModal(){this.open=true;},
  close(value){this.open=false;this.returnValue=value;for(const fn of listeners.close||[])fn();},
  remove(){body.children=body.children.filter(n=>n!==this);}
 })};
 const loc={hash};
 const click=(dialog,action)=>{for(const fn of listeners.click||[])fn({target:action?{closest:sel=>sel.includes(action)?{}:null}:dialog});};
 return {doc,loc,click};
}

test('o popup abre em toda entrada sem plano e o botão leva à tela de planos',()=>{
 const {doc,loc,click}=fakeDom('#/hoje');
 const dialog=installPlanPrompt({user,subscription:{status:'pending'}},{doc,loc,native:false});
 assert.equal(dialog.open,true);assert.equal(doc.focused,'activate');assert.equal(doc.body.children.length,1);
 assert.equal(dialog.attrs['aria-labelledby'],'plan-prompt-title');
 click(dialog,'activate');
 assert.equal(loc.hash,'#/planos');assert.equal(dialog.open,false);assert.equal(doc.body.children.length,0);
 // Próxima entrada (novo login ou reabertura): aparece de novo.
 const again=fakeDom('');assert.equal(installPlanPrompt({user,subscription:{status:'pending'}},{doc:again.doc,loc:again.loc}).open,true);
 // Clicar fora fecha, sem trocar de tela.
 // Agora não fecha sem trocar de tela (botão comum, não envio de formulário).
 const later=fakeDom('#/hoje');const l=installPlanPrompt({user,subscription:{status:'pending'}},{doc:later.doc,loc:later.loc});later.click(l,'later');assert.equal(l.open,false);assert.equal(l.returnValue,'later');assert.equal(later.loc.hash,'#/hoje');
 assert.doesNotMatch(l.innerHTML,/<form|type="submit"/);
 const outside=fakeDom('#/hoje');const d=installPlanPrompt({user,subscription:{status:'expired'}},{doc:outside.doc,loc:outside.loc});outside.click(d);assert.equal(d.open,false);assert.equal(outside.loc.hash,'#/hoje');
});

test('sem popup com plano ativo, para administradores ou quando a conta abre direto em Planos',()=>{
 const {doc,loc}=fakeDom('#/hoje');
 assert.equal(installPlanPrompt({user,subscription:{status:'active',current_period_end:Date.now()+DAY}},{doc,loc}),null);
 assert.equal(installPlanPrompt({user:{...user,role:'admin'},subscription:{}},{doc,loc}),null);
 const plans=fakeDom('#/planos');assert.equal(installPlanPrompt({user,subscription:{status:'pending'}},{doc:plans.doc,loc:plans.loc}),null);
 assert.equal(doc.body.children.length,0);
});

test('o app chama o popup ao abrir a conta e o estilo está carregado',()=>{
 const boot=readFileSync(new URL('../dist/bootstrap.mjs',import.meta.url),'utf8');
 assert.match(boot,/import \{installPlanPrompt\} from '\.\/plan-prompt\.mjs'/);
 assert.ok(boot.indexOf('installPlanPrompt(platform)')>boot.indexOf("await import('./app.js')"));
 assert.match(readFileSync(new URL('../dist/platform.css',import.meta.url),'utf8'),/\.plan-prompt::backdrop/);
 assert.match(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),/href="platform\.css"/);
});
