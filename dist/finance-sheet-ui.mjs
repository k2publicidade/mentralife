import {chartMarkup,mountFinanceCharts} from './finance-sheet-charts.mjs';
import {pivotMarkup,mountFinancePivots} from './finance-sheet-pivots.mjs';
import {FINANCE_TEMPLATES} from './finance-sheet-template.mjs';

const sheetLimit=1024*1024;
const historyLimit=2*sheetLimit;
const versionLimit=10;
const accountLimit=5000000;
const encoder=new TextEncoder();
const dateTime=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
let stylesheet;

function loadEditorStyles(){
 stylesheet??=new Promise((resolve,reject)=>{
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=new URL('./vendor/finance-sheet/editor.css',import.meta.url).href;
  link.onload=resolve;
  link.onerror=()=>{
   link.remove();
   stylesheet=undefined;
   reject(Error('Estilos do editor indisponíveis.'));
  };
  document.head.append(link);
 });
 return stylesheet;
}

export function financeSheetMarkup(){
 return `<section class="card finance-sheet">
  <div class="section-head"><div><h2>Planilha de planejamento</h2>
  <p>Monte orçamentos e projeções em abas, com fórmulas, filtros e formatação.</p></div></div>
  <div class="finance-sheet-templates" data-sheet-template-card hidden>
   ${FINANCE_TEMPLATES.map((template,index)=>`<div class="finance-sheet-template">
    <span class="finance-template-thumb" aria-hidden="true"><i></i><b></b></span>
    <div><strong>${index?'Modelo':'Modelo recomendado'} · ${template.name}</strong>
    <p class="small">${template.description}</p>
    <div class="finance-template-tags">${template.tags.map(tag=>`<span>${tag}</span>`).join('')}</div></div>
    <button type="button" class="${index?'outline':'primary'}" data-sheet-template="${template.id}">Usar modelo ${template.name.toLowerCase()}</button>
   </div>`).join('')}
  </div>
  <div class="button-row finance-sheet-actions" hidden>
   <button type="button" class="primary" data-sheet-save>Salvar planilha</button>
   <button type="button" class="outline" data-sheet-import>Importar XLSX</button>
   <input type="file" hidden accept=".xlsx" aria-label="Arquivo XLSX" data-sheet-file>
   <button type="button" class="outline" data-sheet-xlsx>Baixar XLSX</button>
   <button type="button" class="outline" data-sheet-csv>Baixar aba em CSV</button>
  </div>
  <p class="small muted">XLSX preserva fórmulas, estilos, intervalos nomeados, dimensões e células mescladas compatíveis. Gráficos, filtros e regras de validação compatíveis também podem ser importados e exportados.</p>
  <p class="small" role="status" data-sheet-status>Carregando editor…</p>
  <div class="finance-sheet-grid" data-sheet-grid role="region" aria-label="Editor da planilha de planejamento"></div>
  <details class="finance-sheet-charts" data-sheet-history hidden>
   <summary>Histórico de versões</summary>
   <p class="small">Guarde até 10 versões, somando até 2 MB. A Mentra também guarda a versão atual antes de importar um XLSX ou restaurar uma cópia.</p>
   <div class="finance-chart-fields">
    <label>Nome da versão <input maxlength="80" placeholder="Ex.: Orçamento de novembro" data-version-name></label>
   </div>
   <button type="button" class="outline" data-version-create>Guardar versão</button>
   <p role="status" class="small" data-version-status></p>
   <ul class="finance-version-list" data-version-list></ul>
  </details>
  ${chartMarkup}
  ${pivotMarkup}
 </section>`;
}

export function createFinanceSheetUI({getState,save,flush,download,toast,render}){
 let active=null;
 let reopenHistory=false;

 function persist(session){
  clearTimeout(session.timer);
  if(!session.dirty)return true;
  return commit(session,withReports(session,session.reports));
 }

 function withReports(session,reports){
  const snapshot=session.editor.workbook.save();
  snapshot.custom={...snapshot.custom,...reports};
  return snapshot;
 }

 function commit(session,snapshot,history=session.history){
  const state=getState();
  if(state.financeWorkbook!==session.base||state.financeWorkbookHistory!==session.history){
   session.status.textContent='A versão da conta mudou. Baixe a aba para guardar suas alterações.';
   return false;
  }
  const serialized=JSON.stringify(snapshot);
  if(encoder.encode(serialized).length>sheetLimit){
   session.status.textContent='A planilha atingiu o limite de 1 MB. Reduza o conteúdo para salvar.';
   return false;
  }
  if(serialized===session.lastSaved&&history===session.history){
   session.dirty=false;
   return true;
  }
  if(history!==session.history){
   if(history.length>versionLimit||encoder.encode(JSON.stringify(history)).length>historyLimit){
    session.status.textContent='O histórico está cheio. Exclua uma versão antiga antes de continuar.';
    return false;
   }
  }
  if(history?.length&&encoder.encode(JSON.stringify({...state,financeWorkbook:snapshot,financeWorkbookHistory:history})).length>accountLimit){
   session.status.textContent='A conta está sem espaço. Libere espaço no histórico para salvar.';
   return false;
  }
  state.financeWorkbook=snapshot;
  if(history!==session.history)state.financeWorkbookHistory=history;
  if(!save()){
   if(session.base===undefined)delete state.financeWorkbook;
   else state.financeWorkbook=session.base;
   if(session.history===undefined)delete state.financeWorkbookHistory;
   else state.financeWorkbookHistory=session.history;
   session.status.textContent='Salvamento indisponível. Resolva a sincronização e tente novamente.';
   return false;
  }
  session.base=snapshot;
  session.history=history;
  session.lastSaved=serialized;
  session.dirty=false;
  session.status.textContent=globalThis.mentraPlatform?'Alterações enviadas para sincronização.':'Planilha salva neste navegador.';
  return true;
 }

 const versions=session=>Array.isArray(session.history)?session.history.filter(version=>
  typeof version?.id==='string'&&typeof version.name==='string'&&
  Number.isFinite(new Date(version.createdAt).getTime())&&
  Array.isArray(version.snapshot?.sheetOrder)&&version.snapshot.sheetOrder.length&&version.snapshot.sheets
 ):[];
 function checkpoint(session,snapshot,name,{skipDuplicate=false}={}){
  const existing=versions(session);
  const serialized=JSON.stringify(snapshot);
  if(skipDuplicate&&existing.some(version=>JSON.stringify(version.snapshot)===serialized))return session.history;
  if(encoder.encode(serialized).length>sheetLimit)
   throw Error('A versão atual excede 1 MB. Reduza o conteúdo para guardar uma cópia.');
  return [{id:crypto.randomUUID(),name,createdAt:Date.now(),snapshot},...existing];
 }

 async function finishEditing(session){
  const {workbook}=session.editor;
  if(workbook.isCellEditing()&&!await workbook.endEditingAsync(true))return false;
  return active===session;
 }

 function mountHistory(root,session){
  const panel=root.querySelector('[data-sheet-history]');
  const list=panel.querySelector('[data-version-list]');
  const status=panel.querySelector('[data-version-status]');
  const name=panel.querySelector('[data-version-name]');
  const message=text=>{status.textContent=text;};
  function refresh(){
   list.replaceChildren();
   const entries=versions(session);
   if(!entries.length){
    const empty=document.createElement('li');empty.textContent='Nenhuma versão guardada.';list.append(empty);
   }
   for(const version of entries){
    const entry=document.createElement('li');
    const label=document.createElement('strong');label.textContent=version.name;
    const date=document.createElement('small');date.textContent=dateTime.format(version.createdAt);
    const controls=document.createElement('div');controls.className='button-row';
    entry.append(label,date,controls);
    for(const [text,action] of [
     ['Restaurar',async()=>{
      if(!await finishEditing(session))return;
      if(!window.confirm('Restaurar “'+version.name+'”? A versão atual ficará no histórico.'))return;
      try{
       const current=withReports(session,session.reports);
       const history=checkpoint(session,current,'Antes da restauração',{skipDuplicate:true});
       if(!commit(session,version.snapshot,history)){message(session.status.textContent);return;}
       reopenHistory=true;render();toast('Versão restaurada.');
      }catch(error){message(error.message);}
     }],
     ['Excluir versão',async()=>{
      if(!await finishEditing(session))return;
      if(!window.confirm('Excluir a versão “'+version.name+'” do histórico?'))return;
      const history=versions(session).filter(item=>item.id!==version.id);
      if(!commit(session,withReports(session,session.reports),history)){message(session.status.textContent);return;}
      refresh();message('Versão excluída.');
     }]
    ]){
     const button=document.createElement('button');
     button.type='button';button.className='outline';button.textContent=text;
     button.setAttribute('aria-label',text+' '+version.name);button.onclick=action;
     controls.append(button);
    }
    list.append(entry);
   }
  }
  panel.querySelector('[data-version-create]').onclick=async()=>{
   if(!await finishEditing(session))return;
   try{
    const snapshot=withReports(session,session.reports);
    const history=checkpoint(session,snapshot,name.value.trim()||'Versão '+dateTime.format(Date.now()));
    if(!commit(session,snapshot,history)){message(session.status.textContent);return;}
    name.value='';refresh();message('Versão guardada.');
   }catch(error){message(error.message);}
  };
  refresh();
  panel.hidden=false;
  if(reopenHistory){
   reopenHistory=false;
   panel.open=true;
   panel.querySelector('summary').focus();
  }
 }

 function unmount(){
  if(!active)return;
  if(active.editor && !persist(active))toast(active.status.textContent);
  active.chartPanel?.dispose();
  active.editor?.dispose();
  active=null;
 }

 async function mount(root){
  if(!root)return;
  const session={
   base:getState().financeWorkbook,
   history:getState().financeWorkbookHistory,
   status:root.querySelector('[data-sheet-status]'),
   dirty:false
  };
  active=session;
  const grid=root.querySelector('[data-sheet-grid]');
  try {
   const [{openSpreadsheet}]=await Promise.all([
    import('./vendor/finance-sheet/editor.mjs'),
    loadEditorStyles()
   ]);
   if(active!==session)return;
   session.starter=session.base?null:FINANCE_TEMPLATES[0].build();
   session.editor=openSpreadsheet(grid,session.base?structuredClone(session.base):structuredClone(session.starter),()=>{
    session.dirty=true;
    clearTimeout(session.timer);
    session.timer=setTimeout(()=>{
     persist(session);
     void session.chartPanel?.refresh();
     session.pivotPanel?.refresh();
    },750);
   });
   session.reports=Object.fromEntries(['mentraCharts','mentraPivots'].map(key=>{
    const stored=(session.base||session.starter)?.custom?.[key];
    return [key,Array.isArray(stored)?stored:[]];
   }));
   session.lastSaved=JSON.stringify(withReports(session,session.reports));
  } catch {
   if(active===session)session.status.textContent='O editor não pôde ser carregado. Recarregue a página para tentar novamente.';
   return;
  }
  session.status.textContent=session.base?'Planilha carregada.':'Modelo de orçamento mensal pronto. Preencha as células amarelas e registre seus gastos na aba Transações.';
  root.querySelector('.finance-sheet-actions').hidden=false;
  root.querySelector('[data-sheet-template-card]').hidden=false;
  for(const control of root.querySelectorAll('[data-sheet-template]'))control.onclick=async()=>{
   const template=FINANCE_TEMPLATES.find(item=>item.id===control.dataset.sheetTemplate);
   if(!template||!await finishEditing(session))return;
   const replacing=session.base||session.dirty;
   if(replacing&&!window.confirm('Aplicar o modelo “'+template.name+'”? A planilha atual ficará no histórico.'))return;
   try{
    const history=replacing?checkpoint(session,withReports(session,session.reports),'Antes do modelo de orçamento',{skipDuplicate:true}):session.history;
    if(commit(session,template.build(),history)){
     render();
     toast('Modelo “'+template.name+'” pronto para preencher.');
    }
   }catch(error){session.status.textContent=error.message;}
  };
  const reportOptions=key=>({
   workbook:session.editor.workbook,
   configs:()=>session.reports[key],
   commit:configs=>{
    const reports={...session.reports,[key]:configs};
    if(!commit(session,withReports(session,reports)))return false;
    session.reports=reports;
    return true;
   }
  });
  session.chartPanel=mountFinanceCharts(root.querySelector('[data-chart-panel]'),reportOptions('mentraCharts'));
  if(session.starter&&session.reports.mentraCharts.length)root.querySelector('[data-chart-panel]').open=true;
  session.pivotPanel=mountFinancePivots(root.querySelector('[data-pivot-panel]'),reportOptions('mentraPivots'));
  mountHistory(root,session);
  const fileInput=root.querySelector('[data-sheet-file]');
  const importButton=root.querySelector('[data-sheet-import]');
  importButton.onclick=()=>fileInput.click();
  fileInput.onchange=async()=>{
   const file=fileInput.files[0];
   fileInput.value='';
   if(!file)return;
   importButton.disabled=true;
   try{
    const {readSpreadsheet}=await import('./vendor/finance-sheet/xlsx.mjs');
    const snapshot=await readSpreadsheet(file);
    if(active!==session||!await finishEditing(session))return;
    const replacing=session.base||session.dirty;
    if(replacing&&!window.confirm('Substituir a planilha atual pelo arquivo XLSX? A versão atual ficará no histórico.'))return;
    const history=replacing?checkpoint(session,withReports(session,session.reports),'Antes da importação XLSX',{skipDuplicate:true}):session.history;
    if(commit(session,snapshot,history)){
     render();
     toast('Arquivo XLSX importado.');
    }
   }catch(error){
    if(active===session)session.status.textContent=error.message||'Não foi possível importar o XLSX.';
   }finally{importButton.disabled=false;}
  };
  root.querySelector('[data-sheet-xlsx]').onclick=async()=>{
   try{
    if(!await finishEditing(session))return;
    const {writeSpreadsheet}=await import('./vendor/finance-sheet/xlsx.mjs');
    if(active!==session)return;
    const bytes=writeSpreadsheet(withReports(session,session.reports));
    download('mentra-planejamento.xlsx',bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   }catch(error){
    if(active===session)session.status.textContent=error.message||'Não foi possível exportar o XLSX.';
   }
  };
  root.querySelector('[data-sheet-save]').onclick=async()=>{
   if(!await finishEditing(session))return;
   if(!persist(session))return;
   const saved=await flush();
   if(active!==session || session.dirty)return;
   session.status.textContent=saved?'Planilha salva.':'Sincronização pendente. Confira o aviso da sua conta.';
  };
  root.querySelector('[data-sheet-csv]').onclick=()=>{
   const sheet=session.editor.workbook.getActiveSheet();
   const range=sheet.getDataRange();
   if(range.getHeight()*range.getWidth()>500000){
    session.status.textContent='O intervalo tem mais de 500 mil células. Reduza a área usada para exportar o CSV.';
    return;
   }
   const rows=range.getDisplayValues();
   const csv=rows.map(row=>row.map(value=>{
    const safe=/^[\s\uFEFF]*[=+\-@\t\r\n]/.test(value)&&!/^[-+]?[\d.,]+$/.test(value)?"'"+value:value;
    return '"'+safe.replaceAll('"','""')+'"';
   }).join(';')).join('\r\n');
   download('mentra-planejamento.csv','\uFEFF'+csv,'text/csv;charset=utf-8');
  };
 }
 return {mount,unmount};
}
