import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PLANS,validateCatalog} from '../server/catalog.mjs';
import {plansMarkup,formatPlanPrice} from '../dist/platform.mjs';
test('catálogo aceita apenas três planos com preços e cotas válidos',()=>{
 assert.deepEqual(validateCatalog(DEFAULT_PLANS),DEFAULT_PLANS);
 for(const value of [0,-1,1.5,1000001,NaN]){const plans=structuredClone(DEFAULT_PLANS);plans[0].monthlyRequests=value;assert.throws(()=>validateCatalog(plans));}
 for(const value of [0,99,-1,2990.5,10000001,undefined,'2990']){const plans=structuredClone(DEFAULT_PLANS);plans[0].priceCents=value;assert.throws(()=>validateCatalog(plans));}
 assert.throws(()=>validateCatalog([...DEFAULT_PLANS,DEFAULT_PLANS[0]]));assert.throws(()=>validateCatalog([DEFAULT_PLANS[0],DEFAULT_PLANS[0],DEFAULT_PLANS[2]]));
});
test('painel apresenta catálogo do servidor, preço e uso, escapando conteúdo',()=>{
 const plans=structuredClone(DEFAULT_PLANS);plans[0].name='<img src=x onerror=bad>';plans[0].priceCents=2990;
 const html=plansMarkup({plan:'essencial',status:'expired'},plans,{month:'2026-10',requests:12});
 assert.match(html,/29,90/);assert.match(html,/12 de 100 mensagens/);assert.match(html,/Expirado/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.equal((html.match(/data-platform-plan=/g)||[]).length,3);
 assert.equal(formatPlanPrice({priceCents:null}),'Preço em definição');
});
