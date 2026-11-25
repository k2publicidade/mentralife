const calculations={sum:'Soma',count:'Contagem',average:'Média',min:'Mínimo',max:'Máximo'};
const rangePattern=/^[A-Z]{1,3}[1-9]\d{0,6}:[A-Z]{1,3}[1-9]\d{0,6}$/;

export const pivotMarkup=`<details class="finance-sheet-charts" data-pivot-panel hidden>
 <summary>Tabelas dinâmicas</summary>
 <p class="small">Escolha um intervalo com cabeçalhos na primeira linha e agrupe os registros por campos da planilha.</p>
 <div class="finance-chart-fields" role="group" aria-label="Origem da tabela dinâmica">
  <label>Nome <input data-pivot-title maxlength="80" value="Resumo financeiro"></label>
  <label>Aba de origem <select data-pivot-sheet aria-label="Aba de origem"></select></label>
  <label>Intervalo de origem <input data-pivot-range placeholder="A1:D50" maxlength="21"></label>
 </div>
 <div class="button-row">
  <button type="button" class="outline" data-pivot-selection>Usar seleção da grade</button>
  <button type="button" class="outline" data-pivot-fields>Carregar campos</button>
 </div>
 <div class="finance-chart-fields" role="group" aria-label="Campos da tabela dinâmica">
  <label>Agrupar linhas por <select data-pivot-rows aria-label="Agrupar linhas por"></select></label>
  <label>Agrupar colunas por <select data-pivot-columns aria-label="Agrupar colunas por"></select></label>
  <label>Campo de valores <select data-pivot-values aria-label="Campo de valores"></select></label>
  <label>Cálculo <select data-pivot-calc aria-label="Cálculo">${Object.entries(calculations).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>
 </div>
 <div class="button-row">
  <button type="button" class="primary" data-pivot-save>Adicionar tabela dinâmica</button>
  <button type="button" class="outline" data-pivot-cancel hidden>Cancelar edição</button>
 </div>
 <p role="status" class="small" data-pivot-status></p>
 <div class="finance-chart-list finance-pivot-list" data-pivot-list></div>
 </details>`;

function sourceRange(workbook,sheetId,address){
 const sheet=workbook.getSheetBySheetId(sheetId);
 if(!sheet)throw Error('A aba de origem está indisponível.');
 if(!rangePattern.test(address))throw Error('Informe um intervalo como A1:D50.');
 const range=sheet.getRange(address);
 if(range.getHeight()<2||range.getHeight()>2001||range.getWidth()<2||range.getWidth()>30)
  throw Error('Use de 2 a 2.001 linhas e de 2 a 30 colunas.');
 return range;
}

const newGroup=()=>({count:0,numericCount:0,sum:0,min:Infinity,max:-Infinity});
function accumulate(group,value){
 if(value==null||value==='')return;
 group.count++;
 if(!Number.isFinite(value))return;
 group.numericCount++;
 group.sum+=value;
 group.min=Math.min(group.min,value);
 group.max=Math.max(group.max,value);
}

function result(group,calculation){
 if(!group)return null;
 switch(calculation){
  case 'count':return group.count;
  case 'sum':return group.sum;
  case 'average':return group.numericCount?group.sum/group.numericCount:null;
  case 'min':return group.numericCount?group.min:null;
  case 'max':return group.numericCount?group.max:null;
 }
}

export function summarizePivot(values,display,{row,column,value,calculation}){
 const width=values[0].length;
 if(![row,value].every(index=>Number.isInteger(index)&&index>=0&&index<width)||
    !Number.isInteger(column)||column< -1||column>=width||!Object.hasOwn(calculations,calculation))
  throw Error('Selecione campos válidos para a tabela dinâmica.');
 const rows=new Map(),columns=new Map(),grand=newGroup();
 if(column===-1)columns.set(null,{label:calculations[calculation],total:newGroup()});
 for(let index=1;index<values.length;index++){
  const record=values[index];
  if(record.every(cell=>cell==null||cell===''))continue;
  const rowKey=record[row]??'';
  const columnKey=column===-1?null:record[column]??'';
  if(!rows.has(rowKey))rows.set(rowKey,{label:display[index][row]||'(Em branco)',cells:new Map(),total:newGroup()});
  if(!columns.has(columnKey))columns.set(columnKey,{label:display[index][column]||'(Em branco)',total:newGroup()});
  if(rows.size>100||columns.size>30)throw Error('Reduza o intervalo para até 100 grupos de linhas e 30 grupos de colunas.');
  const rowGroup=rows.get(rowKey),columnGroup=columns.get(columnKey);
  if(!rowGroup.cells.has(columnKey))rowGroup.cells.set(columnKey,newGroup());
  const cellValue=record[value];
  for(const group of [rowGroup.cells.get(columnKey),rowGroup.total,columnGroup.total,grand])accumulate(group,cellValue);
 }
 const keys=[...columns.keys()];
 const headers=[display[0][row]||'Grupo',...[...columns.values()].map(group=>group.label)];
 const output=[...rows.values()].map(group=>[
  group.label,...keys.map(key=>result(group.cells.get(key),calculation))
 ]);
 const totals=['Total geral',...keys.map(key=>result(columns.get(key).total,calculation))];
 if(column!==-1){
  headers.push('Total geral');
  [...rows.values()].forEach((group,index)=>output[index].push(result(group.total,calculation)));
  totals.push(result(grand,calculation));
 }
 return {headers,rows:output,totals};
}

function pivotTable({headers,rows,totals},title){
 const table=document.createElement('table');
 table.setAttribute('aria-label',title);
 const add=(section,values,header=false)=>{
  const row=section.insertRow();
  values.forEach((value,index)=>{
   const cell=document.createElement(header||index===0?'th':'td');
   if(header||index===0)cell.scope=header?'col':'row';
   cell.textContent=typeof value==='number'?value.toLocaleString('pt-BR',{maximumFractionDigits:10}):value??'—';
   row.append(cell);
  });
 };
 add(table.createTHead(),headers,true);
 const body=table.createTBody();
 rows.forEach(row=>add(body,row));
 add(table.createTFoot(),totals);
 return table;
}

function copyPivotToSheet(workbook,report,title){
 const base=title.replace(/[:\\/?*\[\]\x00-\x1f']/g,' ').trim().slice(0,31)||'Resumo';
 const names=new Set(workbook.getSheets().map(sheet=>sheet.getSheetName().toLowerCase()));
 let name=base;
 for(let i=2;names.has(name.toLowerCase());i++){
  const suffix=' '+i;
  name=base.slice(0,31-suffix.length)+suffix;
 }
 const rows=[report.headers,...report.rows,report.totals];
 const cellData=Object.fromEntries(rows.map((row,index)=>[index,Object.fromEntries(
  row.flatMap((value,column)=>value==null?[]:[[column,{v:value,t:typeof value==='number'?2:1}]])
 )]));
 workbook.create(name,Math.max(100,rows.length),Math.max(26,report.headers.length),{sheet:{cellData}});
 return name;
}

export function mountFinancePivots(panel,{workbook,configs,commit}){
 const find=name=>panel.querySelector('[data-pivot-'+name+']');
 const title=find('title'),sheet=find('sheet'),range=find('range'),rows=find('rows'),columns=find('columns'),values=find('values'),calc=find('calc');
 const save=find('save'),cancel=find('cancel'),status=find('status'),list=find('list');
 let editing=null,loadedSource='';
 const address=()=>range.value.trim().toUpperCase();
 const sourceKey=()=>JSON.stringify([sheet.value,address()]);
 const message=text=>{status.textContent=text;};
 function loadFields(config){
  const headers=sourceRange(workbook,sheet.value,address()).getDisplayValues()[0];
  for(const select of [rows,columns,values]){
   const options=headers.map((header,index)=>new Option(header||'Coluna '+(index+1),index));
   if(select===columns)options.unshift(new Option('Nenhum',-1));
   select.replaceChildren(...options);
  }
  rows.value=config?.row??0;
  columns.value=config?.column??-1;
  values.value=config?.value??1;
  loadedSource=sourceKey();
 }
 function reset(){editing=null;save.textContent='Adicionar tabela dinâmica';cancel.hidden=true;}
 function summarize(config){
  const source=sourceRange(workbook,config.sheetId,config.range);
  return summarizePivot(source.getRawValues(),source.getDisplayValues(),config);
 }
 function refresh(){
  if(!panel.open)return;
  const previous=sheet.value;
  const tabs=workbook.getSheets().map(tab=>[tab.getSheetName(),tab.getSheetId()]);
  if(tabs.length!==sheet.options.length||tabs.some(([name,id],index)=>sheet.options[index].value!==id||sheet.options[index].text!==name)){
   sheet.replaceChildren(...tabs.map(([name,id])=>new Option(name,id)));
   sheet.value=tabs.some(([,id])=>id===previous)?previous:workbook.getActiveSheet().getSheetId();
  }
  list.replaceChildren();
  for(const config of configs()){
   const card=document.createElement('article');
   const heading=document.createElement('h3');
   heading.textContent=config.title;
   card.append(heading);
   try{
    const scroll=document.createElement('div');
    scroll.className='finance-pivot-scroll';
    scroll.append(pivotTable(summarize(config),config.title));
    card.append(scroll);
   }catch(error){
    const explanation=document.createElement('p');
    explanation.textContent=error.message;card.append(explanation);
   }
   const controls=document.createElement('div');
   controls.className='button-row';
   for(const [label,action] of [
    ['Editar',()=>{
     title.value=config.title;sheet.value=config.sheetId;range.value=config.range;calc.value=config.calculation;
     try{loadFields(config);}catch(error){loadedSource='';message(error.message);}
     editing=config.id;save.textContent='Salvar tabela dinâmica';cancel.hidden=false;title.focus();
    }],
    ['Copiar resultado para nova aba',()=>{
     try{
      const name=copyPivotToSheet(workbook,summarize(config),config.title);
      message('Resultado copiado para a aba '+name+'.');
     }catch(error){message(error.message);}
    }],
    ['Remover',()=>{
     if(commit(configs().filter(item=>item.id!==config.id))){
      if(editing===config.id)reset();
      message('Tabela dinâmica removida.');refresh();
     }
    }]
   ]){
    const button=document.createElement('button');
    button.type='button';button.className='outline';button.textContent=label;
    button.setAttribute('aria-label',label+' tabela dinâmica '+config.title);
    button.onclick=action;controls.append(button);
   }
   card.append(controls);list.append(card);
  }
 }
 function prepare(){
  try{loadFields();message('Campos carregados.');}
  catch(error){loadedSource='';message(error.message);}
 }
 find('fields').onclick=prepare;
 find('selection').onclick=()=>{
  const selection=workbook.getActiveRange();
  if(!selection){message('Selecione células na grade.');return;}
  sheet.value=workbook.getActiveSheet().getSheetId();
  range.value=selection.getA1Notation();prepare();
 };
 cancel.onclick=reset;
 save.onclick=()=>{
  if(sourceKey()!==loadedSource){message('Carregue os campos do intervalo antes de salvar.');return;}
  if(!rows.value||!columns.value||!values.value){message('Selecione os campos do resumo.');return;}
  const config={
   id:editing||crypto.randomUUID(),title:title.value.trim()||'Tabela dinâmica',
   sheetId:sheet.value,range:address(),row:Number(rows.value),column:Number(columns.value),
   value:Number(values.value),calculation:calc.value
  };
  try{summarize(config);}catch(error){message(error.message);return;}
  const items=configs();
  if(!editing&&items.length>=8){message('A planilha pode ter até 8 tabelas dinâmicas.');return;}
  const updated=editing?items.map(item=>item.id===editing?config:item):[...items,config];
  if(commit(updated)){reset();message('Tabela dinâmica salva.');refresh();}
 };
 panel.ontoggle=refresh;
 panel.hidden=false;
 return {refresh};
}
