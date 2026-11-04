import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFinancialCsv,readFinancialCsv,reviewFinancialCsv,applyFinancialCsv} from '../dist/finance-import.mjs';
import {migrateFinanceState,toCsv,financialSummary} from '../dist/finance.mjs';
const state=()=>migrateFinanceState({version:5,records:[],documents:[{id:'private',note:'kept'}],events:[]});
const config={accountId:'itau',date:'0',title:'1',amount:'2',externalId:'3',amountFormat:'brl',dateFormat:'iso',paymentMethod:'other',status:'actual'};
const csv='Data;Descrição;Valor;ID\r\n2026-10-29;Mercado;-25,90;a\r\n2026-10-29;Serviço;100,00;b';
test('parser preserva delimitadores, aspas escapadas e quebras de linha dentro de células',async()=>{
 const parsed=await parseFinancialCsv('\uFEFFData;Descrição;Valor\r\n2026-10-29;"Compra; com ""aspas""\nsegunda linha";-10,00\r\n');assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0][1],'Compra; com "aspas"\nsegunda linha');
 assert.equal((await parseFinancialCsv('Date,Description,Amount\n2026-10-29,"CSV, vírgula",12.50',',')).rows[0][1],'CSV, vírgula');
 assert.equal((await parseFinancialCsv('Data\tDescrição\tValor\n2026-10-29\tA\t1,00','\t')).rows.length,1);
});
test('estrutura inválida, células excessivas, UTF-8 inválido e limites são recusados',async()=>{
 for(const source of ['Data;Descrição;Valor\n2026-10-29;"aberta;1','Data;Descrição;Valor\n2026-10-29;"fechada"a;1','Data;Descrição;Valor\n2026-10-29;A;1;x','Data;Data;Valor\n2026-10-29;A;1','Data;;Valor\n2026-10-29;A;1','Data;Descrição;Valor\n2026-10-29;A\0;1','Data;Descrição;Valor\n2026-10-29;'+ 'a'.repeat(1001)+';1','x'.repeat(205000)])await assert.rejects(parseFinancialCsv(source));
 await assert.rejects(parseFinancialCsv('A;B;C\n'+'a;b;c\n'.repeat(101)),/cem/);
 await assert.rejects(readFinancialCsv({name:'test.csv',size:2,arrayBuffer:async()=>new Uint8Array([255,255]).buffer},';'),/UTF-8/);
 await assert.rejects(readFinancialCsv({name:'test.exe',size:1},';'),/csv/);
});
test('revisão não altera dados; confirmação importa centavos e saldo sem movimentação externa',async()=>{
 const s=state(),before=structuredClone(s),review=await reviewFinancialCsv(s,await parseFinancialCsv(csv),config);assert.deepEqual(s,before);assert.equal(review.items[0].draft.cents,2590);assert.equal(review.items[0].draft.type,'expense');const next=applyFinancialCsv(s,review,[0,1]);assert.equal(next.records.length,2);assert.deepEqual(next.documents,s.documents);assert.equal(financialSummary(next,{from:'2026-10-01',to:'2026-10-31'}).net,7410);
 assert.equal(s.records.length,0);await assert.rejects(reviewFinancialCsv(s,await parseFinancialCsv(csv),{...config,accountId:'missing'}));
});
test('repetir mesmo arquivo/IDs não duplica; origem alterada exige conferência manual',async()=>{
 const parsed=await parseFinancialCsv(csv),s=state(),review=await reviewFinancialCsv(s,parsed,config),next=applyFinancialCsv(s,review,[0,1]),again=await reviewFinancialCsv(next,parsed,config);assert.ok(again.items.every(i=>i.status==='duplicate'));assert.throws(()=>applyFinancialCsv(next,again,[0]),/indisponíveis/);
 const changed=await parseFinancialCsv(csv.replace('-25,90','-30,00')),conflict=await reviewFinancialCsv(next,changed,config);assert.equal(conflict.items[0].status,'conflict');
 next.records[0].title='Editado manualmente';assert.equal((await reviewFinancialCsv(next,parsed,config)).items[0].status,'conflict');
});
test('identificadores de origem repetidos bloqueiam ambas as linhas',async()=>{
 const parsed=await parseFinancialCsv(csv.replace(';b',';a')),review=await reviewFinancialCsv(state(),parsed,config);assert.ok(review.items.every(i=>i.status==='invalid'));assert.throws(()=>applyFinancialCsv(state(),review,[0]),/indisponíveis/);
});
test('sem ID reconhece o mesmo arquivo e avisa semelhanças em arquivos diferentes',async()=>{
 const c={...config,externalId:''},s=state(),review=await reviewFinancialCsv(s,await parseFinancialCsv(csv),c),next=applyFinancialCsv(s,review,[0]);assert.equal((await reviewFinancialCsv(next,await parseFinancialCsv(csv),c)).items[0].status,'duplicate');const alternate=await parseFinancialCsv(csv+'\n');assert.equal((await reviewFinancialCsv(next,alternate,c)).items[0].status,'possible');
 const same=await reviewFinancialCsv(s,await parseFinancialCsv(csv.replace('Serviço;100,00','Mercado;-25,90')),c);assert.equal(same.items[1].status,'possible');
});
test('seleção é atômica e revisão fica inválida após editar finanças ou vencer',async()=>{
 const s=state(),review=await reviewFinancialCsv(s,await parseFinancialCsv(csv),config);for(const selected of [[],[0,0],[0,99]])assert.throws(()=>applyFinancialCsv(s,review,selected));assert.equal(s.records.length,0);assert.throws(()=>applyFinancialCsv(s,review,[0],{now:review.createdAt+600001}),/expirou/);
 const changed=structuredClone(s);changed.accounts[0].archived=true;assert.throws(()=>applyFinancialCsv(changed,review,[0]),/mudou/);
 s.events.push({id:'unrelated'});assert.equal(applyFinancialCsv(s,review,[0]).events.length,1);
});
test('mapeamento explícito, datas reais, tipo e valores não são inventados',async()=>{
 const s=state(),c={...config,externalId:'',type:'3',dateFormat:'br',amountFormat:'decimal'},p=await parseFinancialCsv('Data;Descrição;Valor;Tipo\n29/10/2026;A;12.34;Saída\n30/02/2026;B;1.00;Entrada\n29/10/2026;C;-1.00;Entrada\n29/10/2026;D;1e3;Entrada\n29/10/2026;E;1.001;Entrada\n29/10/2026;F;1.00;Transferência interna'),r=await reviewFinancialCsv(s,p,c);assert.equal(r.items[0].status,'new');assert.equal(r.items[0].draft.cents,1234);assert.equal(r.items[0].draft.type,'expense');assert.ok(r.items.slice(1).every(i=>i.status==='invalid'));
 await assert.rejects(reviewFinancialCsv(s,p,{...c,date:'1',title:'1'}),/diferente/);
});
test('saldo desconhecido permanece desconhecido e previsão não altera realizado',async()=>{
 const s=state(),review=await reviewFinancialCsv(s,await parseFinancialCsv(csv),{...config,status:'estimated'}),next=applyFinancialCsv(s,review,[0,1]);assert.equal(next.accounts[0].openingBalanceCents,null);assert.equal(financialSummary(next,{from:'2026-10-01',to:'2026-10-31'}).net,0);
});
test('conteúdo de fórmula continua texto e exportação mantém proteção',async()=>{
 const s=state(),parsed=await parseFinancialCsv(csv.replace('Mercado','=HYPERLINK("x")').replace('=HYPERLINK("x")','"=HYPERLINK(""x"")"')),r=await reviewFinancialCsv(s,parsed,config),next=applyFinancialCsv(s,r,[0]);assert.equal(next.records[0].title,'=HYPERLINK("x")');assert.match(toCsv([{Descrição:next.records[0].title}]),/'=HYPERLINK/);
});
