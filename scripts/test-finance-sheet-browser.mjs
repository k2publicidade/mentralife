import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
import {CFB,read,utils,write} from 'xlsx';
import {addVisualStyles,encodeVisualStyle} from './finance-sheet-xlsx-styles.mjs';

let data=null,revision=0;
const root=resolve('dist');
const types={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/')){
  let body={};
  if(path==='/api/me')body={user:{id:'sheet-test',name:'Teste',email:'teste@example.com',role:'user'},plans:[],usage:{},subscription:{}};
  if(path==='/api/state'){
   if(req.method==='PUT'){
    let raw='';
    for await(const part of req)raw+=part;
    const saved=JSON.parse(raw);
    if(saved.revision!==revision){res.writeHead(409).end();return;}
    data=saved.data;
    revision++;
   }
   body={data,revision};
  }
  res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(body));
  return;
 }
 try{
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep))throw Error('Invalid asset path');
  const contents=await readFile(file);
  res.writeHead(200,{
   'content-type':types[extname(file)]??'application/octet-stream',
   'content-security-policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; font-src 'self'"
  }).end(contents);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
 page.setDefaultTimeout(10000);
 const errors=[];
 page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
 await page.goto('http://127.0.0.1:'+server.address().port+'/#/dinheiro');
 await page.getByRole('link',{name:'Planejamento financeiro'}).click();
 const save=page.getByRole('button',{name:'Salvar planilha'});
 await save.waitFor({timeout:20000});
 const grid=page.locator('[data-sheet-grid] canvas[id^="univer-sheet-main-canvas"]');
 await grid.waitFor({state:'visible'});
 await grid.scrollIntoViewIfNeeded();
 await grid.click({position:{x:65,y:34}});
 await page.keyboard.type('=SUM(2,3)');
 await page.keyboard.press('Enter');
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.match(JSON.stringify(data?.financeWorkbook)??'',/=SUM\(2,3\)/);
 await page.reload();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 const downloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'Baixar aba em CSV'}).click();
 const download=await downloading;
 assert.match(await readFile(await download.path(),'utf8'),/"5"/);
 const workbook=utils.book_new();
 utils.book_append_sheet(workbook,{
  A1:{t:'n',v:7,z:'0.00'},B2:{t:'n',v:1,z:'yyyy-mm-dd'},C2:{t:'z',v:''},
  '!rows':[,,,,,,{hpx:42,hidden:true}],
  '!cols':[{wpx:114},,{hidden:true}],
  '!ref':'A1:C2'
 },'Receitas');
 utils.book_append_sheet(workbook,{
  A1:{t:'n',v:14,f:'Receitas!A1*2'},
  B2:{t:'n',v:14,f:'ReceitaBase*2'},
  A3:{t:'s',v:'Mês'},B3:{t:'s',v:'Receita'},C3:{t:'s',v:'Tipo'},
  A4:{t:'s',v:'Janeiro'},B4:{t:'n',v:7,f:'Receitas!A1'},C4:{t:'s',v:'Serviço'},
  A5:{t:'s',v:'Fevereiro'},B5:{t:'n',v:14,f:'A1'},C5:{t:'s',v:'Serviço'},
  A6:{t:'s',v:'Janeiro'},B6:{t:'n',v:5},C6:{t:'s',v:'Produto'},
  '!ref':'A1:C6','!autofilter':{ref:'B3:C6'},'!rows':[,,,,,{hidden:true}]
 },'Projeção');
 utils.book_append_sheet(workbook,{'!ref':'A1'},'Arquivo');
 workbook.Workbook={
  WBProps:{date1904:true},
  Sheets:[{Hidden:0},{Hidden:0},{Hidden:1}],
  Names:[{Name:'ReceitaBase',Ref:"'Receitas'!$A$1"}]
 };
 const baseBytes=write(workbook,{type:'buffer',bookType:'xlsx',compression:true,cellStyles:true,sheetStubs:true});
 const fixtureZip=CFB.read(baseBytes,{type:'buffer'});
 const visual={ff:'Arial',fs:14,bl:1,it:1,cl:{rgb:'#223344'},bg:{rgb:'#F0EEDD'},ht:2,tb:3,bd:{b:{s:1,cl:{rgb:'#112233'}}}};
 const blankStyle={bg:{rgb:'#11AA55'}};
 const fixtureRead=path=>Buffer.from(CFB.find(fixtureZip,'/'+path).content).toString('utf8');
 const fixturePut=(path,xml)=>CFB.utils.cfb_add(fixtureZip,'/'+path,Buffer.from(xml));
 addVisualStyles(fixtureRead,fixturePut,new Map([[0,new Map([['A1',encodeVisualStyle(visual)],['C2',encodeVisualStyle(blankStyle)]])]]));
 const validationPath='xl/worksheets/sheet1.xml';
 const validationXml='<dataValidations count="3">'+
  '<dataValidation type="list" sqref="D4:D5" allowBlank="1" showErrorMessage="1" error="Escolha uma opção da lista"><formula1>&quot;Pago,Pendente&quot;</formula1></dataValidation>'+
  '<dataValidation type="decimal" operator="greaterThan" sqref="E4" showErrorMessage="1"><formula1>0</formula1></dataValidation>'+
  '<dataValidation type="custom" sqref="D120 D122" showErrorMessage="1"><formula1>LEN(D120)&lt;=12</formula1></dataValidation>'+
  '</dataValidations>';
 fixturePut(validationPath,fixtureRead(validationPath).replace('<ignoredErrors>',()=>validationXml+'<ignoredErrors>'));
 const fixturePath='/xl/worksheets/sheet2.xml';
 const fixtureXml=Buffer.from(CFB.find(fixtureZip,fixturePath).content).toString('utf8');
 const filterXml='<autoFilter ref="B3:C6"><filterColumn colId="0"><customFilters><customFilter operator="greaterThan" val="0"/></customFilters></filterColumn><filterColumn colId="1"><filters><filter val="Serviço"/><filter val="Outros $&amp;"/></filters></filterColumn></autoFilter>';
 assert.match(fixtureXml,/<autoFilter ref="B3:C6"\/>/);
 CFB.utils.cfb_add(fixtureZip,fixturePath,Buffer.from(fixtureXml.replace('<autoFilter ref="B3:C6"/>',()=>filterXml)));
 const bytes=Buffer.from(CFB.write(fixtureZip,{type:'buffer',fileType:'zip',compression:true}));
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-sheet-file]').setInputFiles({
  name:'projecao.xlsx',
  mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer:bytes
 });
 await page.getByText('Arquivo XLSX importado.',{exact:true}).waitFor();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 const xlsxDownloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'Baixar XLSX'}).click();
 const xlsxDownload=await xlsxDownloading;
 const exported=read(await readFile(await xlsxDownload.path()),{cellNF:true,cellStyles:true});
 assert.deepEqual(exported.SheetNames,['Receitas','Projeção','Arquivo']);
 assert.equal(exported.Sheets.Receitas.A1.z,'0.00');
 const importedStyle=data.financeWorkbook.sheets['imported-1'].cellData[0][0].s;
 const rules=JSON.parse(data.financeWorkbook.resources.find(item=>item.name==='SHEET_DATA_VALIDATION_PLUGIN').data)['imported-1'];
 assert.equal(rules[0].formula1,'["Pago","Pendente"]');
 assert.equal(rules[0].allowBlank,true);
 assert.equal(rules[1].operator,'greaterThan');
 assert.equal(rules[2].formula1,'=LEN(D120)<=12');
 assert.equal(data.financeWorkbook.sheets['imported-1'].rowCount,122);
 assert.deepEqual(importedStyle,{...visual,n:{pattern:'0.00'}});
 assert.deepEqual(data.financeWorkbook.sheets['imported-1'].cellData[1][2].s,blankStyle);
 assert.equal(exported.Sheets['Projeção'].A1.f,'Receitas!A1*2');
 assert.equal(exported.Sheets['Projeção'].B2.f,'ReceitaBase*2');
 assert.equal(exported.Sheets.Receitas.B2.w,'1904-01-02');
 assert.equal(exported.Workbook.WBProps.date1904,true);
 assert.equal(exported.Workbook.Sheets[2].Hidden,1);
 assert.equal(exported.Workbook.Names.find(name=>name.Name==='ReceitaBase').Ref,"'Receitas'!$A$1");
 assert.equal(exported.Sheets['Projeção']['!autofilter'].ref,'B3:C6');
 assert.equal(exported.Sheets['Projeção']['!rows'][5].hidden,true);
 const exportedZip=CFB.read(await readFile(await xlsxDownload.path()),{type:'buffer'});
 const validationExport=Buffer.from(CFB.find(exportedZip,'/'+validationPath).content).toString('utf8');
 assert.match(validationExport,/<dataValidations count="3">/);
 assert.match(validationExport,/<formula1>&quot;Pago,Pendente&quot;<\/formula1>/);
 assert.match(validationExport,/sqref="D120 D122" type="custom"/);
 assert.match(validationExport,/<formula1>LEN\(D120\)&lt;=12<\/formula1>/);
 const styleXml=Buffer.from(CFB.find(exportedZip,'/xl/styles.xml').content).toString('utf8');
 assert.match(styleXml,/<font><b\/><i\/><sz val="14"\/><color rgb="FF223344"\/><name val="Arial"\/><\/font>/);
 assert.match(styleXml,/<fgColor rgb="FF11AA55"\/>/);
 assert.match(styleXml,/<alignment horizontal="center" wrapText="1"\/>/);
 const exportedXml=Buffer.from(CFB.find(exportedZip,fixturePath).content).toString('utf8');
 assert.ok(exportedXml.includes(filterXml));
 const filterSnapshot=JSON.parse(data.financeWorkbook.resources.find(item=>item.name==='SHEET_FILTER_PLUGIN').data);
 assert.equal(filterSnapshot['imported-2'].filterColumns[1].colId,2);
 assert.equal(data.financeWorkbook.sheets['imported-2'].rowData[5]?.hd,undefined);
 assert.equal(exported.Sheets.Receitas['!rows'][6].hidden,true);
 assert.equal(exported.Sheets.Receitas['!rows'][6].hpx,42);
 assert.equal(exported.Sheets.Receitas['!cols'][2].hidden,true);
 assert.ok(Math.abs(exported.Sheets.Receitas['!cols'][0].wpx-114)<=2);
 await page.getByText('Gráficos da planilha',{exact:true}).click();
 await page.getByLabel('Aba',{exact:true}).selectOption({label:'Projeção'});
 await page.getByLabel('Intervalo',{exact:true}).fill('A3:B5');
 await page.getByRole('button',{name:'Adicionar gráfico'}).click();
 const chart=page.getByRole('img',{name:'Projeção financeira'});
 await chart.waitFor();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.equal(data.financeWorkbook.custom.mentraCharts[0].range,'A3:B5');
 await page.reload();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 await page.getByText('Gráficos da planilha',{exact:true}).click();
 await chart.waitFor();
 await page.getByText('Ver dados do gráfico',{exact:true}).click();
 await page.getByRole('cell',{name:'14',exact:true}).waitFor();
 await grid.click({position:{x:65,y:34}});
 await page.keyboard.type('11');
 await page.keyboard.press('Enter');
 await page.getByRole('cell',{name:'22',exact:true}).waitFor();
 const chartDownloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'Baixar XLSX'}).click();
 const chartDownload=await chartDownloading;
 const chartBytes=await readFile(await chartDownload.path());
 const zip=CFB.read(chartBytes,{type:'buffer'});
 const part=path=>Buffer.from(CFB.find(zip,'/'+path).content).toString('utf8');
 assert.match(part('xl/worksheets/sheet2.xml'),/<drawing r:id="rIdMentraCharts"\/>/);
 assert.match(part('xl/drawings/_rels/drawing2.xml.rels'),/Target="..\/charts\/chart1.xml"/);
 const chartXml=part('xl/charts/chart1.xml');
 assert.match(chartXml,/<c:barChart>/);
 assert.match(chartXml,/<c:f>&apos;Projeção&apos;!\$B\$4:\$B\$5<\/c:f>/);
 assert.match(chartXml,/<c:pt idx="1"><c:v>22<\/c:v><\/c:pt>/);
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.equal(data.financeWorkbook.sheets['imported-2'].cellData[1][1].v,22);
 const liveFilters=JSON.parse(data.financeWorkbook.resources.find(item=>item.name==='SHEET_FILTER_PLUGIN').data);
 assert.deepEqual(liveFilters['imported-2'].cachedFilteredOut,[5]);
 await page.getByRole('button',{name:'Editar gráfico Projeção financeira'}).click();
 await page.getByLabel('Tipo',{exact:true}).selectOption('line');
 await page.getByRole('button',{name:'Salvar gráfico',exact:true}).click();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.equal(data.financeWorkbook.custom.mentraCharts[0].type,'line');
 await page.getByRole('button',{name:'Remover gráfico Projeção financeira'}).click();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.deepEqual(data.financeWorkbook.custom.mentraCharts,[]);
 await page.getByText('Tabelas dinâmicas',{exact:true}).click();
 await page.getByLabel('Aba de origem',{exact:true}).selectOption({label:'Projeção'});
 await page.getByLabel('Intervalo de origem',{exact:true}).fill('A3:C6');
 await page.getByRole('button',{name:'Carregar campos'}).click();
 await page.getByLabel('Agrupar colunas por',{exact:true}).selectOption({label:'Tipo'});
 await page.getByRole('button',{name:'Adicionar tabela dinâmica'}).click();
 const pivot=page.getByRole('table',{name:'Resumo financeiro'});
 await pivot.getByRole('row',{name:/Total geral 33 5 38/}).waitFor();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.equal(data.financeWorkbook.custom.mentraPivots[0].column,2);
 await page.reload();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 await page.getByText('Tabelas dinâmicas',{exact:true}).click();
 await pivot.getByRole('row',{name:/Janeiro 11 5 16/}).waitFor();
 await grid.click({position:{x:65,y:34}});
 await page.keyboard.type('10');
 await page.keyboard.press('Enter');
 await pivot.getByRole('row',{name:/Total geral 30 5 35/}).waitFor();
 await page.getByRole('button',{name:'Editar tabela dinâmica Resumo financeiro'}).click();
 await page.getByLabel('Cálculo',{exact:true}).selectOption('average');
 await page.getByRole('button',{name:'Salvar tabela dinâmica'}).click();
 await pivot.getByRole('row',{name:/Janeiro 10 5 7,5/}).waitFor();
 await page.getByRole('button',{name:/Copiar resultado para nova aba/}).click();
 await page.getByText('Resultado copiado para a aba Resumo financeiro.',{exact:true}).waitFor();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 const copy=Object.values(data.financeWorkbook.sheets).find(sheet=>sheet.name==='Resumo financeiro');
 assert.equal(copy.cellData[1][3].v,7.5);
 await page.getByRole('button',{name:'Remover tabela dinâmica Resumo financeiro'}).click();
 await pivot.waitFor({state:'detached'});
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.deepEqual(data.financeWorkbook.custom.mentraPivots,[]);
 assert.match(JSON.stringify(data.financeWorkbookHistory[0].snapshot),/=SUM\(2,3\)/);
 assert.equal(data.financeWorkbookHistory[0].name,'Antes da importação XLSX');
 await page.getByText('Histórico de versões',{exact:true}).click();
 await page.getByLabel('Nome da versão',{exact:true}).fill('Orçamento revisado');
 await page.getByRole('button',{name:'Guardar versão'}).click();
 await page.getByText('Versão guardada.',{exact:true}).waitFor();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.equal(data.financeWorkbookHistory[0].name,'Orçamento revisado');
 await page.reload();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 await page.getByText('Histórico de versões',{exact:true}).click();
 await grid.click({position:{x:65,y:34}});
 await page.keyboard.type('13');
 await page.keyboard.press('Enter');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Restaurar Antes da importação XLSX',exact:true}).click();
 await page.getByText('Versão restaurada.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Restaurar Orçamento revisado',exact:true}).waitFor();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.match(JSON.stringify(data.financeWorkbook),/=SUM\(2,3\)/);
 const beforeRestore=data.financeWorkbookHistory.find(version=>version.name==='Antes da restauração');
 assert.equal(beforeRestore.snapshot.sheets['imported-1'].cellData[0][0].v,13);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Restaurar Orçamento revisado',exact:true}).click();
 await page.getByRole('button',{name:'Excluir versão Antes da importação XLSX',exact:true}).waitFor();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.equal(data.financeWorkbook.sheets['imported-1'].cellData[0][0].v,10);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Excluir versão Antes da importação XLSX',exact:true}).click();
 await page.getByText('Versão excluída.',{exact:true}).waitFor();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.ok(!data.financeWorkbookHistory.some(version=>version.name==='Antes da importação XLSX'));
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-sheet-file]').setInputFiles({
  name:'projecao-com-grafico.xlsx',
  mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer:chartBytes
 });
 await page.getByText('Arquivo XLSX importado.',{exact:true}).waitFor();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 await page.getByText('Gráficos da planilha',{exact:true}).click();
 await chart.waitFor();
 await page.getByText('Ver dados do gráfico',{exact:true}).click();
 await page.getByRole('cell',{name:'22',exact:true}).waitFor();
 await grid.click({position:{x:65,y:34}});
 await page.keyboard.type('12');
 await page.keyboard.press('Enter');
 await page.getByRole('cell',{name:'24',exact:true}).waitFor();
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.equal(data.financeWorkbook.custom.mentraCharts[0].range,'A3:B5');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Usar modelo metas por mês'}).click();
 await page.getByText('Modelo “Metas por mês” pronto para preencher.',{exact:true}).waitFor();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 await grid.waitFor({state:'visible'});
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 assert.deepEqual(data.financeWorkbook.sheetOrder,['painel','planejado','lancamentos']);
 assert.ok(data.financeWorkbookHistory.some(version=>version.name==='Antes do modelo de orçamento'));
 const nameBox=page.locator('[data-sheet-grid] [data-u-comp="defined-name"] input');
 async function setCell(address,value){
  await nameBox.fill(address);
  await nameBox.press('Enter');
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
 }
 const year=data.financeWorkbook.sheets.painel.cellData[4][1].v;
 await setCell('B4','1');
 await setCell('B6','100');
 await page.locator('[data-sheet-grid]').getByText('Planejado',{exact:true}).click();
 await setCell('B5','1200');
 await page.locator('[data-sheet-grid]').getByText('Lançamentos',{exact:true}).click();
 await setCell('A5',`15/01/${year}`);
 await setCell('B5','Salário');
 await setCell('D5','1000');
 await setCell('A6',`16/01/${year}`);
 await setCell('B6','Alimentação');
 await setCell('D6','250');
 await setCell('A7',`15/02/${year}`);
 await setCell('B7','Salário');
 await setCell('D7','900');
 await save.click();
 await page.getByText('Planilha salva.',{exact:true}).waitFor();
 const summary=data.financeWorkbook.sheets.painel.cellData;
 assert.equal(summary[8][1].v,1200);
 assert.equal(summary[8][2].v,1000);
 assert.equal(summary[9][2].v,250);
 assert.equal(summary[10][2].v,750);
 assert.equal(summary[5][3].v,850);
 await page.reload();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 const templateDownloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'Baixar XLSX'}).click();
 const templateDownload=await templateDownloading;
 const templateBytes=await readFile(await templateDownload.path());
 const exportedTemplate=read(templateBytes);
 assert.deepEqual(exportedTemplate.SheetNames,['Resumo','Planejado','Lançamentos']);
 assert.equal(exportedTemplate.Sheets.Resumo.D6.v,850);
 const templateZip=CFB.read(templateBytes,{type:'buffer'});
 const transactionsXml=Buffer.from(CFB.find(templateZip,'/xl/worksheets/sheet3.xml').content).toString('utf8');
 assert.match(transactionsXml,/<dataValidations count="2">/);
 assert.match(transactionsXml,/sqref="B5:B1004" type="list"/);
 assert.deepEqual(errors,[]);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Usar modelo orçamento mensal',exact:true}).click();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 // Mesmo layout do modelo "Monthly budget" do Google Planilhas.
 const resumo=data.financeWorkbook.sheets.resumo.cellData,transacoes=data.financeWorkbook.sheets.transacoes.cellData;
 assert.deepEqual(data.financeWorkbook.sheetOrder,['resumo','transacoes']);
 assert.equal(data.financeWorkbook.sheets.resumo.name,'Resumo');
 assert.equal(data.financeWorkbook.sheets.transacoes.name,'Transações');
 assert.equal(resumo[1][1].v,'COMECE AQUI');
 assert.equal(resumo[1][6].v,'OBSERVAÇÃO');
 assert.equal(resumo[5][1].v,'Orçamento mensal');
 assert.equal(resumo[5][6].v,'Saldo inicial:');
 assert.equal(resumo[8][3].f,'=H6+I18-D18');
 assert.match(resumo[18][3].f,/SUMIF\('Transações'!\$E\$6:\$E\$505,B19/);
 assert.equal(resumo[31][1].v,'Categoria personalizada 3');
 assert.equal(transacoes[5][3].v,'Aluguel');
 assert.deepEqual(data.financeWorkbook.custom.mentraCharts.map(chart=>chart.range),['B8:D9','B17:D18','G17:I18']);
 const googleRules=JSON.parse(data.financeWorkbook.resources.find(item=>item.name==='SHEET_DATA_VALIDATION_PLUGIN').data).transacoes;
 assert.deepEqual(googleRules.filter(rule=>rule.type==='list').map(rule=>rule.formula1),["='Resumo'!$B$19:$B$32","='Resumo'!$G$19:$G$24"]);
 await page.waitForTimeout(3000);
 const googleDownloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'Baixar XLSX'}).click();
 const googleBook=read(await readFile(await (await googleDownloading).path()));
 assert.deepEqual(googleBook.SheetNames,['Resumo','Transações']);
 assert.equal(googleBook.Sheets.Resumo.B6.v,'Orçamento mensal');
 assert.equal(googleBook.Sheets.Resumo.D9.f,'H6+I18-D18');
 // Valores calculados pelo editor com os dados de exemplo (gravados no XLSX).
 const sheetValue=address=>googleBook.Sheets.Resumo[address]?.v;
 assert.equal(sheetValue('D18'),2370);
 assert.equal(sheetValue('C18'),2900);
 assert.equal(sheetValue('I18'),3900);
 assert.equal(sheetValue('D9'),3530);
 assert.equal(sheetValue('G10'),1530);
 assert.equal(sheetValue('G9'),'de aumento no total economizado');
 assert.equal(Math.round(sheetValue('G8')*100),77);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Usar modelo orçamento mensal em branco',exact:true}).click();
 await page.getByText('Planilha carregada.',{exact:true}).waitFor();
 assert.equal(data.financeWorkbook.sheets.transacoes.cellData[5][3]?.v,undefined,'modelo em branco sem exemplos');
 assert.deepEqual(errors,[]);
 console.log('Cálculo, sincronização, XLSX, validação e modelos de orçamento (Google e metas por mês) verificados.');
}finally{
 await browser?.close();
 server.close();
}



