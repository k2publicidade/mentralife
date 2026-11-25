import {operationDate} from './time.mjs';

const income=['Salário','Renda extra','Benefícios','Rendimentos','Outras receitas'];
const expense=['Moradia','Alimentação','Transporte','Saúde','Educação','Serviços e contas','Compras pessoais','Lazer','Viagens','Pets','Dívidas','Outras despesas'];
const categories=[...income,...expense];
const months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const currency={pattern:'"R$" #,##0.00;-"R$" #,##0.00'};
const date={pattern:'dd/mm/yyyy'};
const base={ff:'Arial',fs:11,cl:{rgb:'#233B32'}};
const title={...base,fs:21,bl:1,bg:{rgb:'#174638'},cl:{rgb:'#FFFFFF'},vt:2};
const subtitle={...base,bg:{rgb:'#EAF1EB'},vt:2};
const header={...base,bl:1,bg:{rgb:'#246652'},cl:{rgb:'#FFFFFF'},vt:2};
const input={...base,bg:{rgb:'#FFF2CA'}};
const total={...base,bl:1,bg:{rgb:'#DEEEE4'}};
const monetary=style=>({...style,n:currency});
const cell=(value,style=base)=>typeof value==='number'?{v:value,t:2,s:style}:{v:value,t:1,s:style};
const formula=(expression,style=base)=>({f:expression,s:style});
const range=(startRow,startColumn,endRow,endColumn)=>({startRow,startColumn,endRow,endColumn});
const titles=[range(0,0,0,3),range(1,0,1,3)];
const rowCells=values=>Object.fromEntries(values.map((value,index)=>[index,value]));
const rowText=(values,style)=>rowCells(values.map(value=>cell(value,style)));
const last=1004;
const baseRow=15;
const tx=column=>"'Lançamentos'!$"+column+"$5:$"+column+"$"+last;
const windowCriteria=`${tx('A')},">="&DATE($B$5,$B$4,1),${tx('A')},"<"&DATE($B$5,$B$4+1,1)`;

function validation(type,ranges,options){
 return {uid:crypto.randomUUID(),type,ranges,showErrorMessage:true,errorStyle:1,...options};
}

export function monthlyBudgetTemplate(today=operationDate()){
 const [year,month]=today.split('-').map(Number);
 const panel={
  0:{0:cell('ORÇAMENTO MENSAL',title)},
  1:{0:cell('Preencha as células amarelas. As demais mostram os resultados do mês.',subtitle)},
  3:rowCells([cell('Mês (1–12)'),cell(month,input)]),
  4:rowCells([cell('Ano'),cell(year,input)]),
  5:rowCells([cell('Saldo inicial do mês'),{s:monetary(input)},cell('Saldo final'),formula('=SUM(B6,C9)-C10',monetary(total))]),
  7:rowText(['Indicador','Planejado','Realizado','Diferença favorável'],header),
  8:rowCells([cell('Receitas',total),formula('=SUM(B16:B20)',monetary(total)),formula('=SUM(C16:C20)',monetary(total)),formula('=C9-B9',monetary(total))]),
  9:rowCells([cell('Despesas',total),formula('=SUM(B21:B32)',monetary(total)),formula('=SUM(C21:C32)',monetary(total)),formula('=B10-C10',monetary(total))]),
  10:rowCells([cell('Resultado do mês',total),formula('=B9-B10',monetary(total)),formula('=C9-C10',monetary(total)),formula('=C11-B11',monetary(total))]),
  12:rowCells([cell('Valores sem categoria válida'),formula(`=SUMIFS(${tx('D')},${windowCriteria})-SUM(C16:C32)`,monetary(total))]),
  14:rowText(['Categoria','Planejado','Realizado','Diferença favorável'],header)
 };
 for(const [index,category] of categories.entries()){
  const row=baseRow+index+1;
  panel[row-1]=rowCells([
   cell(category,index<income.length?subtitle:base),
   formula(`=IFERROR(INDEX('Planejado'!$B$${index+5}:$M$${index+5},1,$B$4),0)`,monetary(base)),
   formula(`=SUMIFS(${tx('D')},${tx('B')},A${row},${windowCriteria})`,monetary(base)),
   formula(index<income.length?`=C${row}-B${row}`:`=B${row}-C${row}`,monetary(base))
  ]);
 }
 const planned={
  0:{0:cell('METAS POR MÊS',title)},
  1:{0:cell('Digite valores positivos em reais. Use as colunas do mês para cada categoria.',subtitle)},
  3:rowText(['Categoria',...months],header)
 };
 for(const [index,category] of categories.entries()){
  planned[index+4]=rowCells([cell(category,index<income.length?subtitle:base),...months.map(()=>({s:monetary(input)}))]);
 }
 const transactions={
  0:{0:cell('LANÇAMENTOS',title)},
  1:{0:cell('Use uma linha por entrada ou saída, com data e valor positivo. A categoria define o tipo.',subtitle)},
  2:{0:cell('Registre apenas valores já recebidos ou pagos. Capacidade do modelo: 1.000 lançamentos.',subtitle)},
  3:rowText(['Data','Categoria','Descrição','Valor','Conta ou meio','Observações'],header)
 };
 for(let row=4;row<last;row++){
  transactions[row]={0:{s:{...input,n:date}},1:{s:input},2:{s:input},3:{s:monetary(input)},4:{s:input},5:{s:input}};
 }
 const sheet=(id,name,cellData,rowCount,widths,mergeData,frozen=0)=>({
  id,name,cellData,rowCount,columnCount:Math.max(13,widths.length),mergeData,
  columnData:Object.fromEntries(widths.map((w,index)=>[index,{w}])),
  rowData:{0:{h:40},1:{h:27},2:{h:27}},
  ...(frozen?{freeze:{xSplit:0,ySplit:frozen,startRow:frozen,startColumn:-1}}:{})
 });
 const validationData={
  painel:[
   validation('whole',[range(3,1,3,1)],{operator:'between',formula1:'1',formula2:'12',error:'Informe um mês de 1 a 12.'}),
   validation('whole',[range(4,1,4,1)],{operator:'between',formula1:'1901',formula2:'9998',error:'Informe um ano de 1901 a 9998.'})
  ],
  planejado:[validation('decimal',[range(4,1,categories.length+3,12)],{operator:'greaterThanOrEqual',formula1:'0',allowBlank:true})],
  lancamentos:[
   validation('list',[range(4,1,last-1,1)],{formula1:JSON.stringify(categories),showDropDown:true,allowBlank:true,error:'Escolha uma categoria da lista.'}),
   validation('decimal',[range(4,3,last-1,3)],{operator:'greaterThan',formula1:'0',allowBlank:true,error:'Informe um valor positivo.'})
  ]
 };
 const sheets={
  painel:sheet('painel','Resumo',panel,45,[240,145,170,165],titles),
  planejado:sheet('planejado','Planejado',planned,40,[185,...months.map(()=>94)],[range(0,0,0,12),range(1,0,1,12)],4),
  lancamentos:sheet('lancamentos','Lançamentos',transactions,last,[105,172,234,122,150,220],
   [range(0,0,0,5),range(1,0,1,5),range(2,0,2,5)],4)
 };
 const styleIds=new Map(),styles={};
 for(const tab of Object.values(sheets)){
  for(const row of Object.values(tab.cellData)){
   for(const entry of Object.values(row)){
    const key=JSON.stringify(entry.s);
    if(!styleIds.has(key)){
     const id='modelo-'+styleIds.size;
     styleIds.set(key,id);styles[id]=entry.s;
    }
    entry.s=styleIds.get(key);
   }
  }
 }
 return {
  id:crypto.randomUUID(),name:'Orçamento mensal',sheetOrder:['painel','planejado','lancamentos'],
  sheets,styles,
  custom:{mentraCharts:[{id:crypto.randomUUID(),title:'Planejado × realizado',type:'bar',sheetId:'painel',range:'A8:C10'}]},
  resources:[{name:'SHEET_DATA_VALIDATION_PLUGIN',data:JSON.stringify(validationData)}]
 };
}

/*
 * Controle financeiro mensal reproduzindo o modelo oficial "Monthly budget"
 * da galeria do Google Planilhas (conferido em 12/11/2026 numa cópia pública do
 * modelo): faixa de instruções, título com saldo inicial, saldo inicial × final,
 * variação percentual e economia do mês, resumos Planejado/Real, tabelas de
 * Despesas e Receitas com Totais e as mesmas categorias, e aba Transações com
 * Despesas e Receitas lado a lado. Abre com dados de exemplo, como no Google.
 */
export const GOOGLE_EXPENSE_CATEGORIES=Object.freeze(['Alimentação','Presentes','Saúde/médico','Casa','Transporte','Despesas pessoais','Animais de estimação','Contas e serviços','Viagens','Dívidas','Outros','Categoria personalizada 1','Categoria personalizada 2','Categoria personalizada 3']);
export const GOOGLE_INCOME_CATEGORIES=Object.freeze(['Economias','Salário','Bônus','Juros','Outros','Categoria personalizada']);
const isCustom=name=>name.startsWith('Categoria personalizada');
const gFirst=5;   // primeira linha de dados na aba Transações (A1: linha 6)
const gLast=504;  // 500 lançamentos por tabela
const TOTAL=17;   // linha (0-based) dos Totais no Resumo (A1: 18)
const FIRST_CAT=18;
const g={
 band:{ff:'Arial',fs:10,bg:{rgb:'#173E32'},cl:{rgb:'#E9EFE0'},vt:2,tb:3},
 bandHead:{ff:'Arial',fs:10,bl:1,bg:{rgb:'#173E32'},cl:{rgb:'#FBF9E9'},vt:2},
 bandNote:{ff:'Arial',fs:10,it:1,bg:{rgb:'#FFF2CA'},cl:{rgb:'#233B32'},vt:2},
 bandNoteSoft:{ff:'Arial',fs:10,it:1,bg:{rgb:'#173E32'},cl:{rgb:'#D7E5AE'},vt:2},
 bandFill:{bg:{rgb:'#173E32'}},
 title:{ff:'Arial',fs:24,bl:1,cl:{rgb:'#9A7A2C'},vt:2},
 label:{ff:'Arial',fs:10,bl:1,cl:{rgb:'#64756B'},vt:2,ht:3},
 balanceHead:{ff:'Arial',fs:11,bl:1,cl:{rgb:'#173E32'},vt:2,ht:2},
 balanceHeadGold:{ff:'Arial',fs:11,bl:1,cl:{rgb:'#9A7A2C'},vt:2,ht:2},
 balanceValue:{ff:'Arial',fs:12,cl:{rgb:'#64756B'},vt:2,ht:2},
 balanceLabel:{ff:'Arial',fs:10,cl:{rgb:'#64756B'},vt:2},
 card:{ff:'Arial',fs:22,bl:1,bg:{rgb:'#EEF3EC'},cl:{rgb:'#173E32'},vt:2,ht:2},
 cardLabel:{ff:'Arial',fs:10,it:1,bg:{rgb:'#EEF3EC'},cl:{rgb:'#64756B'},vt:2,ht:2},
 section:{ff:'Arial',fs:14,bl:1,cl:{rgb:'#173E32'},vt:2},
 summaryLabel:{ff:'Arial',fs:10,cl:{rgb:'#64756B'},vt:2},
 summaryValue:{ff:'Arial',fs:10,bl:1,cl:{rgb:'#173E32'},vt:2},
 head:{ff:'Arial',fs:10,bl:1,bg:{rgb:'#285C49'},cl:{rgb:'#FFFFFF'},vt:2},
 headNum:{ff:'Arial',fs:10,bl:1,bg:{rgb:'#285C49'},cl:{rgb:'#FFFFFF'},vt:2,ht:3},
 total:{ff:'Arial',fs:10,bl:1,bg:{rgb:'#DEEEE4'},cl:{rgb:'#173E32'},vt:2},
 row:{ff:'Arial',fs:10,cl:{rgb:'#233B32'},vt:2,bd:{b:{s:1,cl:{rgb:'#E3E9DF'}}}},
 input:{ff:'Arial',fs:10,bg:{rgb:'#FFF2CA'},cl:{rgb:'#233B32'},vt:2,bd:{b:{s:1,cl:{rgb:'#EEDFA8'}}}},
 note:{ff:'Arial',fs:10,it:1,cl:{rgb:'#64756B'},vt:2}
};
const withMoney=style=>({...style,n:currency});
// Como no Google: diferença favorável em verde com "+", desfavorável em vermelho.
const withDiff=style=>({...style,n:{pattern:'[Green]+"R$" #,##0.00;[Red]-"R$" #,##0.00;"R$" 0.00'}});
const withPercent=style=>({...style,n:{pattern:'0%'}});
const withDate=style=>({...style,n:date});
const sparse=values=>Object.fromEntries(values.map((value,index)=>[index,value]).filter(([,value])=>value));

/** Exemplos em reais, no espírito dos dados de demonstração do modelo do Google. */
const SAMPLE={
 start:2000,
 planned:{'Alimentação':900,'Presentes':150,'Casa':1200,'Transporte':300,'Contas e serviços':350,'Salário':3500},
 expenses:[[1,1200,'Aluguel','Casa'],[3,420,'Mercado do mês','Alimentação'],[6,160,'Conta de luz','Contas e serviços'],[8,110,'Internet','Contas e serviços'],
  [10,180,'Combustível','Transporte'],[12,85,'Feira','Alimentação'],[15,120,'Presente de aniversário','Presentes'],[18,95,'Restaurante com a família','Alimentação']],
 income:[[5,3500,'Salário','Salário'],[20,400,'Trabalho extra','Outros']]
};
const serial=(year,month,day)=>Math.round((Date.UTC(year,month-1,day)-Date.UTC(1899,11,30))/86400000);

export function googleBudgetTemplate({sample=true,today=operationDate()}={}){
 const [year,month]=String(today).split('-').map(Number);
 const expense=GOOGLE_EXPENSE_CATEGORIES,income=GOOGLE_INCOME_CATEGORIES;
 const expEnd=FIRST_CAT+expense.length;
 const incEnd=FIRST_CAT+income.length;
 const T=TOTAL+1;
 const tx=column=>"'Transações'!$"+column+"$"+(gFirst+1)+":$"+column+"$"+(gLast+1);
 const heads=['Categoria','Planejado','Real','Dif.'];
 const fill=n=>Array.from({length:n},()=>({s:g.bandFill}));
 const summary={
  1:sparse([null,cell('COMECE AQUI',g.bandHead),...fill(3),null,cell('OBSERVAÇÃO',g.bandHead),...fill(3)]),
  2:sparse([null,cell('Informe o saldo inicial na célula H6 e ajuste as categorias e os valores planejados nas tabelas de Receitas e Despesas abaixo.',g.band),...fill(3),null,cell('Edite apenas as células destacadas em amarelo.',g.bandNote),...fill(3)]),
  3:sparse([null,cell('Conforme você registrar dados na aba Transações, este resumo é atualizado automaticamente.',g.band),...fill(3),null,cell('Evite alterar células que contêm fórmulas.',g.bandNoteSoft),...fill(3)]),
  5:sparse([null,cell('Orçamento mensal',g.title),null,null,null,null,cell('Saldo inicial:',g.label),{v:sample?SAMPLE.start:0,t:2,s:withMoney(g.input)}]),
  7:sparse([null,null,cell('SALDO INICIAL',g.balanceHead),cell('SALDO FINAL',g.balanceHeadGold),null,null,
   formula('=IFERROR((D9-H6)/ABS(H6),0)',withPercent(g.card)),{s:g.card},{s:g.card},{s:g.card}]),
  8:sparse([null,cell('Saldo do mês',g.balanceLabel),formula('=H6',withMoney(g.balanceValue)),formula('=H6+I'+T+'-D'+T,withMoney(g.balanceValue)),null,null,
   formula('=IF(D9<H6,"de redução no total economizado","de aumento no total economizado")',g.cardLabel),{s:g.cardLabel},{s:g.cardLabel},{s:g.cardLabel}]),
  9:sparse([null,null,null,null,null,null,formula('=I'+T+'-D'+T,withMoney(g.card)),{s:g.card},{s:g.card},{s:g.card}]),
  10:sparse([null,cell('Veja o gráfico “Saldo inicial × final” em Gráficos da planilha.',g.note),null,null,null,null,cell('economizado neste mês',g.cardLabel),{s:g.cardLabel},{s:g.cardLabel},{s:g.cardLabel}]),
  12:sparse([null,cell('Despesas',g.section),null,null,null,null,cell('Receitas',g.section)]),
  13:sparse([null,cell('Planejado',g.summaryLabel),formula('=C'+T,withMoney(g.summaryValue)),null,null,null,cell('Planejado',g.summaryLabel),formula('=H'+T,withMoney(g.summaryValue))]),
  14:sparse([null,cell('Real',g.summaryLabel),formula('=D'+T,withMoney(g.summaryValue)),null,null,null,cell('Real',g.summaryLabel),formula('=I'+T,withMoney(g.summaryValue))]),
  16:sparse([null,...heads.map((v,i)=>cell(v,i?g.headNum:g.head)),null,...heads.map((v,i)=>cell(v,i?g.headNum:g.head))]),
  [TOTAL]:sparse([null,cell('Totais',g.total),formula('=SUM(C'+(FIRST_CAT+1)+':C'+expEnd+')',withMoney(g.total)),formula('=SUM(D'+(FIRST_CAT+1)+':D'+expEnd+')',withMoney(g.total)),formula('=C'+T+'-D'+T,withDiff(g.total)),null,
   cell('Totais',g.total),formula('=SUM(H'+(FIRST_CAT+1)+':H'+incEnd+')',withMoney(g.total)),formula('=SUM(I'+(FIRST_CAT+1)+':I'+incEnd+')',withMoney(g.total)),formula('=I'+T+'-H'+T,withDiff(g.total))])
 };
 const planned=name=>sample&&SAMPLE.planned[name]?{v:SAMPLE.planned[name],t:2,s:withMoney(g.input)}:{s:withMoney(g.input)};
 const rows=Math.max(expense.length,income.length);
 for(let index=0;index<rows;index++){
  const r=FIRST_CAT+index,a1=r+1,cells=[null];
  if(index<expense.length)cells.push(cell(expense[index],isCustom(expense[index])?g.input:g.row),planned(expense[index]),formula('=SUMIF('+tx('E')+',B'+a1+','+tx('C')+')',withMoney(g.row)),formula('=C'+a1+'-D'+a1,withDiff(g.row)));
  else cells.push(null,null,null,null);
  cells.push(null);
  if(index<income.length)cells.push(cell(income[index],isCustom(income[index])?g.input:g.row),planned(income[index]),formula('=SUMIF('+tx('J')+',G'+a1+','+tx('H')+')',withMoney(g.row)),formula('=I'+a1+'-H'+a1,withDiff(g.row)));
  summary[r]=sparse(cells);
 }
 const transactions={
  1:sparse([null,cell('Para mudar ou adicionar categorias, atualize as tabelas de Despesas e Receitas na aba Resumo.',g.note)]),
  2:sparse([null,cell('Despesas',g.section),null,null,null,null,cell('Receitas',g.section)]),
  4:sparse([null,...['Data','Valor','Descrição','Categoria'].map((v,i)=>cell(v,i===1?g.headNum:g.head)),null,...['Data','Valor','Descrição','Categoria'].map((v,i)=>cell(v,i===1?g.headNum:g.head))])
 };
 const entry=(item,style)=>item?[{v:serial(year,month,item[0]),t:2,s:withDate(style)},{v:item[1],t:2,s:withMoney(style)},{v:item[2],t:1,s:style},{v:item[3],t:1,s:style}]
  :[{s:withDate(style)},{s:withMoney(style)},{s:style},{s:style}];
 for(let r=gFirst;r<=gLast;r++){
  const i=r-gFirst;
  transactions[r]=sparse([null,...entry(sample?SAMPLE.expenses[i]:null,g.input),null,...entry(sample?SAMPLE.income[i]:null,g.input)]);
 }
 const widths=[20,165,112,112,112,24,165,112,112,112,20];
 const sheet=(id,name,cellData,rowCount,mergeData,rowData,frozen=0)=>({
  id,name,cellData,rowCount,columnCount:11,mergeData,showGridlines:0,
  columnData:Object.fromEntries(widths.map((w,index)=>[index,{w}])),
  rowData,
  ...(frozen?{freeze:{xSplit:0,ySplit:frozen,startRow:frozen,startColumn:-1}}:{})
 });
 const validationData={
  resumo:[validation('decimal',[range(FIRST_CAT,2,expEnd-1,2),range(FIRST_CAT,7,incEnd-1,7)],{operator:'greaterThanOrEqual',formula1:'0',allowBlank:true,error:'Informe um valor positivo.'})],
  transacoes:[
   validation('list',[range(gFirst,4,gLast,4)],{formula1:"='Resumo'!$B$"+(FIRST_CAT+1)+":$B$"+expEnd,showDropDown:true,allowBlank:true,error:'Escolha uma categoria de despesa da lista.'}),
   validation('list',[range(gFirst,9,gLast,9)],{formula1:"='Resumo'!$G$"+(FIRST_CAT+1)+":$G$"+incEnd,showDropDown:true,allowBlank:true,error:'Escolha uma categoria de receita da lista.'}),
   validation('decimal',[range(gFirst,2,gLast,2),range(gFirst,7,gLast,7)],{operator:'greaterThan',formula1:'0',allowBlank:true,error:'Informe um valor positivo.'})
  ]
 };
 const sheets={
  resumo:sheet('resumo','Resumo',summary,FIRST_CAT+rows+4,
   [range(1,1,1,4),range(2,1,2,4),range(3,1,3,4),range(1,6,1,9),range(2,6,2,9),range(3,6,3,9),range(5,1,5,4),
    range(7,6,7,9),range(8,6,8,9),range(9,6,9,9),range(10,6,10,9),range(10,1,10,4)],
   {0:{h:14},1:{h:26},2:{h:36},3:{h:30},4:{h:16},5:{h:46},6:{h:14},7:{h:40},8:{h:26},9:{h:40},10:{h:24},11:{h:16},12:{h:30},16:{h:28}}),
  transacoes:sheet('transacoes','Transações',transactions,gLast+1,[range(1,1,1,9)],{0:{h:14},1:{h:28},2:{h:32},3:{h:8},4:{h:28}},5)
 };
 const styleIds=new Map(),styles={};
 for(const tab of Object.values(sheets))for(const row of Object.values(tab.cellData))for(const entry of Object.values(row)){
  const key=JSON.stringify(entry.s);
  if(!styleIds.has(key)){const id='google-'+styleIds.size;styleIds.set(key,id);styles[id]=entry.s;}
  entry.s=styleIds.get(key);
 }
 return {
  id:crypto.randomUUID(),name:'Orçamento mensal',sheetOrder:['resumo','transacoes'],
  sheets,styles,
  custom:{mentraCharts:[
   {id:crypto.randomUUID(),title:'Saldo inicial × final',type:'bar',sheetId:'resumo',range:'B8:D9'},
   {id:crypto.randomUUID(),title:'Despesas: planejado × real',type:'bar',sheetId:'resumo',range:'B17:D18'},
   {id:crypto.randomUUID(),title:'Receitas: planejado × real',type:'bar',sheetId:'resumo',range:'G17:I18'}
  ]},
  resources:[{name:'SHEET_DATA_VALIDATION_PLUGIN',data:JSON.stringify(validationData)}]
 };
}

export const FINANCE_TEMPLATES=Object.freeze([
 Object.freeze({id:'google-monthly',name:'Orçamento mensal',description:'O modelo “Monthly budget” do Google Planilhas: saldo inicial e final, variação e economia do mês, despesas e receitas planejado × real e aba de transações. Vem com dados de exemplo para você substituir.',tags:['Resumo','Transações','Gráficos','Com exemplos'],build:today=>googleBudgetTemplate({sample:true,today})}),
 Object.freeze({id:'google-monthly-blank',name:'Orçamento mensal em branco',description:'O mesmo modelo, sem os dados de exemplo, pronto para os seus valores.',tags:['Resumo','Transações','Gráficos'],build:today=>googleBudgetTemplate({sample:false,today})}),
 Object.freeze({id:'annual-goals',name:'Metas por mês',description:'Categorias com metas para os 12 meses, lançamentos datados e resumo filtrado pelo mês escolhido.',tags:['Resumo','Planejado','Lançamentos'],build:today=>monthlyBudgetTemplate(today)})
]);
