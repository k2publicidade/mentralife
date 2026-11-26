const chartTypes={
 bar:'Colunas',horizontal:'Barras',stacked:'Colunas empilhadas',
 line:'Linhas',pie:'Pizza',doughnut:'Rosca'
};
const rangePattern=/^[A-Z]{1,3}[1-9]\d{0,6}:[A-Z]{1,3}[1-9]\d{0,6}$/;

export const chartMarkup=`<details class="finance-sheet-charts" data-chart-panel hidden>
 <summary>Gráficos da planilha</summary>
 <p class="small">Use a primeira linha para títulos e a primeira coluna para categorias. Cada coluna seguinte é uma série numérica.</p>
 <div class="finance-chart-fields" role="group" aria-label="Configuração do gráfico">
  <label>Título <input data-chart-title maxlength="80" value="Projeção financeira"></label>
  <label>Aba <select data-chart-sheet aria-label="Aba"></select></label>
  <label>Intervalo <input data-chart-range placeholder="A1:C12" maxlength="21"></label>
  <label>Tipo <select data-chart-type aria-label="Tipo">${Object.entries(chartTypes).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>
 </div>
 <div class="button-row">
  <button type="button" class="outline" data-chart-selection>Usar seleção atual</button>
  <button type="button" class="primary" data-chart-save>Adicionar gráfico</button>
  <button type="button" class="outline" data-chart-cancel hidden>Cancelar edição</button>
 </div>
 <p role="status" class="small" data-chart-status></p>
 <div class="finance-chart-list" data-chart-list></div>
 </details>`;

function chartData(workbook,config){
 const sheet=workbook.getSheetBySheetId(config.sheetId);
 if(!sheet)throw Error('A aba de origem está indisponível.');
 if(!rangePattern.test(config.range))throw Error('Informe um intervalo como A1:C12.');
 const range=sheet.getRange(config.range);
 if(range.getHeight()<2||range.getHeight()>101||range.getWidth()<2||range.getWidth()>9)
  throw Error('Selecione de 2 a 101 linhas e de 2 a 9 colunas.');
 const circular=config.type==='pie'||config.type==='doughnut';
 if(circular&&range.getWidth()!==2)throw Error('Use duas colunas para um gráfico circular.');
 const [headers,...rows]=range.getDisplayValues();
 const values=range.getRawValues().slice(1);
 const labels=rows.map(([label],index)=>label||String(index+1));
 const series=headers.slice(1).map((label,index)=>({
  label:label||'Série '+(index+1),
  data:values.map(row=>Number.isFinite(row[index+1])?row[index+1]:null)
 }));
 if(!series.some(({data})=>data.some(Number.isFinite)))throw Error('O intervalo precisa conter valores numéricos.');
 if(circular&&(series[0].data.some(value=>value<0)||!series[0].data.some(value=>value>0)))
  throw Error('O gráfico circular requer valores não negativos e ao menos um valor positivo.');
 return {labels,series};
}

function chartTable(labels,series){
 const details=document.createElement('details');
 const summary=document.createElement('summary');
 summary.textContent='Ver dados do gráfico';
 const table=document.createElement('table');
 const appendRow=(section,values,header=false)=>{
  const row=section.insertRow();
  for(const value of values){
   const cell=document.createElement(header?'th':'td');
   if(header)cell.scope='col';
   cell.textContent=value??'';
   row.append(cell);
  }
 };
 appendRow(table.createTHead(),['Categoria',...series.map(item=>item.label)],true);
 const body=table.createTBody();
 labels.forEach((label,index)=>appendRow(body,[label,...series.map(item=>item.data[index]?.toLocaleString('pt-BR'))]));
 details.append(summary,table);
 return details;
}

export function mountFinanceCharts(panel,{workbook,configs,commit}){
 const find=name=>panel.querySelector('[data-chart-'+name+']');
 const title=find('title'),sheet=find('sheet'),range=find('range'),type=find('type');
 const button=find('save'),cancel=find('cancel'),status=find('status'),list=find('list');
 let editing=null,plots=[],generation=0,disposed=false;
 const message=text=>{status.textContent=text;};
 const getSheets=()=>{
  const selected=sheet.value;
  const tabs=workbook.getSheets().map(tab=>[tab.getSheetName(),tab.getSheetId()]);
  if(tabs.length===sheet.options.length&&tabs.every(([name,id],index)=>sheet.options[index].value===id&&sheet.options[index].text===name))return;
  sheet.replaceChildren(...tabs.map(([name,id])=>new Option(name,id)));
  if([...sheet.options].some(option=>option.value===selected))sheet.value=selected;
  else sheet.value=workbook.getActiveSheet().getSheetId();
 };
 function clearPlots(){plots.forEach(plot=>plot.destroy());plots=[];}
 async function refresh(){
  const version=++generation;
  if(disposed||!panel.open)return;
  getSheets();
  const items=configs();
  if(!items.length){clearPlots();list.replaceChildren();return;}
  let drawChart;
  try{({drawChart}=await import('./vendor/finance-sheet/chart.mjs'));}
  catch{if(!disposed&&version===generation)message('Não foi possível carregar os gráficos.');return;}
  if(disposed||version!==generation||!panel.open)return;
  const expanded=new Set([...list.children].filter(card=>card.querySelector('details[open]')).map(card=>card.dataset.chartId));
  clearPlots();
  list.replaceChildren();
  for(const config of items){
   const card=document.createElement('article');
   card.dataset.chartId=config.id;
   const heading=document.createElement('h3');
   heading.textContent=config.title;
   const source=document.createElement('p');
   source.className='small muted';
   source.textContent=(workbook.getSheetBySheetId(config.sheetId)?.getSheetName()||'Aba indisponível')+' · '+config.range;
   card.append(heading,source);
   try{
    const {labels,series}=chartData(workbook,config);
    const area=document.createElement('div');
    area.className='finance-chart-canvas';
    const canvas=document.createElement('canvas');
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label',config.title);
    const data=chartTable(labels,series);
    data.open=expanded.has(config.id);
    area.append(canvas);card.append(area,data);
    list.append(card);
    plots.push(drawChart(canvas,config.type,labels,series));
   }catch(error){
    const explanation=document.createElement('p');
    explanation.textContent=error.message;
    card.append(explanation);list.append(card);
   }
   const controls=document.createElement('div');
   controls.className='button-row';
   for(const [label,action] of [
    ['Editar',()=>{
     editing=config.id;
     title.value=config.title;sheet.value=config.sheetId;
     range.value=config.range;type.value=config.type;
     button.textContent='Salvar gráfico';cancel.hidden=false;
     title.focus();
    }],
    ['Remover',()=>{
     if(commit(configs().filter(item=>item.id!==config.id))){
      if(editing===config.id)reset();
      message('Gráfico removido.');
      void refresh();
     }
    }]
   ]){
    const control=document.createElement('button');
    control.type='button';control.className='outline';control.textContent=label;
    control.setAttribute('aria-label',label+' gráfico '+config.title);
    control.onclick=action;controls.append(control);
   }
   card.append(controls);
  }
 }
 function reset(){editing=null;button.textContent='Adicionar gráfico';cancel.hidden=true;}
 cancel.onclick=reset;
 find('selection').onclick=()=>{
  const selected=workbook.getActiveRange();
  if(!selected){message('Selecione células na grade.');return;}
  getSheets();sheet.value=workbook.getActiveSheet().getSheetId();range.value=selected.getA1Notation();
 };
 button.onclick=()=>{
  const config={id:editing||crypto.randomUUID(),title:title.value.trim()||'Gráfico',sheetId:sheet.value,range:range.value.trim().toUpperCase(),type:type.value};
  try{chartData(workbook,config);}
  catch(error){message(error.message);return;}
  const items=configs();
  if(!editing&&items.length>=12){message('A planilha pode ter até 12 gráficos.');return;}
  const updated=editing?items.map(item=>item.id===editing?config:item):[...items,config];
  if(commit(updated)){reset();message('Gráfico salvo na planilha.');void refresh();}
 };
 panel.ontoggle=()=>{
  if(panel.open)void refresh();
  else{generation++;clearPlots();}
 };
 panel.hidden=false;
 return {refresh,dispose:()=>{disposed=true;generation++;clearPlots();}};
}
