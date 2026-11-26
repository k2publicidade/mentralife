import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PLANS,validateCatalog} from '../server/catalog.mjs';
import {DEFAULT_PLANS as PLANS,pricedPlans,chargeFor,loadPlans} from '../server/catalog.mjs';
import {plansMarkup,formatPlanPrice,PROMO_FINE_PRINT} from '../dist/platform.mjs';
test('catálogo aceita apenas três planos com preços e cotas válidos',()=>{
 assert.deepEqual(validateCatalog(DEFAULT_PLANS),DEFAULT_PLANS);
 for(const value of [0,-1,1.5,1000001,NaN]){const plans=structuredClone(DEFAULT_PLANS);plans[0].monthlyRequests=value;assert.throws(()=>validateCatalog(plans));}
 for(const value of [0,99,-1,2990.5,10000001,undefined,'2990']){const plans=structuredClone(DEFAULT_PLANS);plans[0].priceCents=value;assert.throws(()=>validateCatalog(plans));}
 assert.throws(()=>validateCatalog([...DEFAULT_PLANS,DEFAULT_PLANS[0]]));assert.throws(()=>validateCatalog([DEFAULT_PLANS[0],DEFAULT_PLANS[0],DEFAULT_PLANS[2]]));
});
test('painel apresenta catálogo do servidor, preço e uso, escapando conteúdo',()=>{
 const plans=structuredClone(DEFAULT_PLANS);plans[0].name='<img src=x onerror=bad>';plans[0].priceCents=2990;
 const html=plansMarkup({plan:'essencial',status:'expired'},plans,{month:'2026-10',requests:12});
 assert.match(html,/29,90/);assert.match(html,/12 de 2\.000 mensagens/);assert.match(html,/Expirado/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.equal((html.match(/data-platform-plan=/g)||[]).length,3);
 assert.equal(formatPlanPrice({priceCents:null}),'Preço em definição');
});
test('catálogo: um plano completo em três períodos, promoção menor que o regular e dias válidos',async()=>{
 assert.deepEqual(PLANS.map(p=>[p.id,p.name,p.days,p.priceCents,p.promoPriceCents,p.monthlyRequests]),
  [['essencial','Mensal',30,9990,6700,2000],['plus','Trimestral',90,19990,14700,2000],['premium','Anual',365,49990,29700,2000]]);
 for(const value of [0,731,1.5,undefined,'30']){const plans=structuredClone(PLANS);plans[1].days=value;assert.throws(()=>validateCatalog(plans));}
 for(const value of [9990,10000,50,1.5,'6700']){const plans=structuredClone(PLANS);plans[0].promoPriceCents=value;assert.throws(()=>validateCatalog(plans));}
 const noPromo=structuredClone(PLANS);noPromo[2].promoPriceCents=null;assert.equal(validateCatalog(noPromo)[2].promoPriceCents,null);
 delete noPromo[2].promoPriceCents;assert.equal(validateCatalog(noPromo)[2].promoPriceCents,null);
 assert.deepEqual(chargeFor(PLANS[0],true),{chargeCents:6700,promotional:true});
 assert.deepEqual(chargeFor(PLANS[0],false),{chargeCents:9990,promotional:false});
 assert.deepEqual(chargeFor(noPromo[2],true),{chargeCents:49990,promotional:false});
 // A catalog saved before periods existed is replaced by the new defaults.
 const legacy=[{id:'essencial',name:'Mentra Basic',monthlyRequests:100,priceCents:2700,description:'x'},{id:'plus',name:'Mentra Advanced',monthlyRequests:500,priceCents:4700,description:'x'},{id:'premium',name:'Mentra Delux',monthlyRequests:2000,priceCents:9700,description:'x'}];
 const db={prepare:()=>({first:async()=>({value:JSON.stringify(legacy),updated_at:5})})};
 const loaded=await loadPlans(db);assert.deepEqual(loaded.plans,PLANS);assert.equal(loaded.revision,5);
});
test('planos: "De/Por" para quem nunca pagou, só o regular depois, botão com o valor cobrado e letra pequena',()=>{
 const promo=plansMarkup({plan:'essencial',status:'pending'},pricedPlans(PLANS,true),{},true);
 assert.match(promo,/De <s>R\$\s99,90<\/s><\/span> <span class="plan-price-now">por <strong>R\$\s67<\/strong>/);
 assert.match(promo,/De <s>R\$\s199,90<\/s>.*por <strong>R\$\s147<\/strong>/);
 assert.match(promo,/De <s>R\$\s499,90<\/s>.*por <strong>R\$\s297<\/strong>/);
 assert.match(promo,/Pagar com PIX · R\$\s67,00/);assert.match(promo,/Pagar com PIX · R\$\s297,00/);
 for(const days of [30,90,365])assert.match(promo,new RegExp(`libera ${days} dias de acesso`));
 assert.doesNotMatch(promo,/libera 30 dias de acesso\. A renovação/);
 assert.ok(promo.includes(`<p class="plan-fineprint">${PROMO_FINE_PRINT}</p>`));
 assert.match(PROMO_FINE_PRINT,/^Valor promocional válido somente para o primeiro período contratado \(primeiro mês, trimestre ou ano\)\. Após esse período, a renovação é feita pelo valor regular do plano\.$/);
 const regular=plansMarkup({plan:'essencial',status:'active',current_period_end:Date.now()+86400000},pricedPlans(PLANS,false),{},true);
 assert.doesNotMatch(regular,/<s>|plan-price-now/);
 assert.match(regular,/R\$\s99,90<\/strong> <small>\/ mês/);assert.match(regular,/\/ trimestre/);assert.match(regular,/\/ ano/);
 assert.match(regular,/Renovar com PIX · R\$\s99,90/);assert.match(regular,/somados ao fim do seu acesso atual/);
 assert.equal((regular.match(/data-platform-plan="[^"]+" >/g)||[]).length,3,'renovação antecipada fica disponível');
 assert.equal(formatPlanPrice(PLANS[2]),'R$\u00a0499,90 / ano');
});
