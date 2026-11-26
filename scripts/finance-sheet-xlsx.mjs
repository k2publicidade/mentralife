import {CFB, read, utils, write} from 'xlsx';
import {extendSpreadsheetPackage} from './finance-sheet-xlsx-charts.mjs';
import {readSpreadsheetCharts,readWorkbookStyleSheet,readWorkbookWorksheets} from './finance-sheet-xlsx-chart-import.mjs';
import {exportFilterColumns,importFilterColumns} from './finance-sheet-xlsx-filters.mjs';
import {encodeVisualStyle,readVisualStyles,worksheetVisualStyles} from './finance-sheet-xlsx-styles.mjs';
import {readValidationRules,validationResource,writeValidationRules} from './finance-sheet-xlsx-validation.mjs';

const maxFileSize=1024*1024;
const maxExpandedSize=20*maxFileSize;
const types={s:1,n:2,b:3};
const excelName=/^[^:\\/?*\[\]\x00-\x1f]{1,31}$/u;
const addressPattern=/^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Z]{1,3}\$?[1-9]\d{0,6})?$/i;
const filterResource='SHEET_FILTER_PLUGIN';
const namesResource='SHEET_DEFINED_NAME_PLUGIN';

function readLayout(items,limit,sizeKey,pixels){
 const layout={};
 for(const [key,item] of Object.entries(items||{})){
  if(!item)continue;
  if(Number(key)>=limit)throw Error('O XLSX excede as dimensões permitidas.');
  const size=pixels(item);
  const entry={};
  if(Number.isFinite(size)&&size>0)entry[sizeKey]=size;
  if(item.hidden)entry.hd=1;
  if(Number.isInteger(item.level)&&item.level>0&&item.level<=7)entry.custom={mentraXlsxOutline:item.level};
  if(Object.keys(entry).length)layout[key]=entry;
 }
 return layout;
}

function writeLayout(layout,sizeKey,pixelKey,limit){
 const items=[];
 for(const [key,entry] of Object.entries(layout||{})){
  const index=Number(key);
  if(!Number.isInteger(index)||index<0||index>=limit)continue;
  const size=sizeKey==='h'&&entry.ia?entry.ah??entry.h:entry[sizeKey];
  const item={};
  if(Number.isFinite(size)&&size>0)item[pixelKey]=size;
  if(entry.hd)item.hidden=true;
  const level=entry.custom?.mentraXlsxOutline;
  if(Number.isInteger(level)&&level>0&&level<=7)item.level=level;
  if(Object.keys(item).length)items[index]=item;
 }
 return items;
}

function localReference(ref,sheetNames){
 if(typeof ref!=='string')return null;
 const match=/^(?:'((?:[^']|'')+)'|([^!']+))!([^!]+)$/.exec(ref);
 if(!match||!addressPattern.test(match[3]))return null;
 const name=match[1]?.replaceAll("''","'")??match[2];
 const canonical=sheetNames.find(sheet=>sheet.toLowerCase()===name.toLowerCase());
 if(!canonical)return null;
 return "'"+canonical.replaceAll("'","''")+"'!"+match[3].toUpperCase();
}

function resourcesFor(snapshot,names,filters,validations){
 snapshot.resources=[];
 for(const [name,value] of [[namesResource,names],[filterResource,filters],[validationResource,validations]]){
  if(Object.keys(value).length)snapshot.resources.push({name,data:JSON.stringify(value)});
 }
}

function getResource(snapshot,name){
 const data=snapshot.resources?.find(resource=>resource.name===name)?.data;
 return data?JSON.parse(data):{};
}

function checkZip(buffer){
 const zip=new DataView(buffer);
 if(zip.byteLength<22||zip.getUint32(0,true)!==0x04034b50)throw Error('Escolha um arquivo XLSX válido.');
 // Validate the central directory and declared expansion before opening the ZIP.
 let end=zip.byteLength-22;
 while(end>=Math.max(0,zip.byteLength-65557)){
  if(zip.getUint32(end,true)===0x06054b50&&end+22+zip.getUint16(end+20,true)===zip.byteLength)break;
  end--;
 }
 if(end<Math.max(0,zip.byteLength-65557))throw Error('O arquivo XLSX está incompleto.');
 let offset=zip.getUint32(end+16,true),expanded=0;
 const entries=zip.getUint16(end+10,true);
 if(entries>512)throw Error('O arquivo XLSX tem componentes demais.');
 for(let entry=0;entry<entries;entry++){
  if(offset+46>end||zip.getUint32(offset,true)!==0x02014b50)throw Error('O arquivo XLSX está incompleto.');
  expanded+=zip.getUint32(offset+24,true);
  if(expanded>maxExpandedSize)throw Error('O conteúdo descompactado é grande demais.');
  offset+=46+zip.getUint16(offset+28,true)+zip.getUint16(offset+30,true)+zip.getUint16(offset+32,true);
 }
 if(offset!==end)throw Error('O arquivo XLSX está incompleto.');
}

export async function readSpreadsheet(file){
 if(!/\.xlsx$/i.test(file.name)||file.size>maxFileSize)throw Error('Escolha um arquivo XLSX de até 1 MB.');
 const buffer=await file.arrayBuffer();
 checkZip(buffer);
 const source=read(buffer,{bookVBA:false,cellHTML:false,cellNF:true,cellStyles:true,bookFiles:true,sheetStubs:true});
 if(!source.SheetNames.length||source.SheetNames.length>30)throw Error('Importe um arquivo com 1 a 30 abas.');
 const snapshot={
  id:crypto.randomUUID(),name:'Planejamento financeiro',sheets:{},sheetOrder:[],
  dateSystem:source.Workbook?.WBProps?.date1904?'date1904':'date1900'
 };
 const filters={},names={},validations={};
 const worksheets=[...readWorkbookWorksheets(source.files)];
 const worksheetXml=new Map(worksheets.map(({name,sheetXml})=>[name,sheetXml]));
 const visualStyles=readVisualStyles(readWorkbookStyleSheet(source.files));
 let cellCount=0;
 for(const [index,name] of source.SheetNames.entries()){
  if(!excelName.test(name))throw Error('O arquivo contém um nome de aba inválido.');
  const id='imported-'+(index+1);
  const cellData={};
  const sheet=source.Sheets[name];
  const xml=worksheetXml.get(name);
  const styles=worksheetVisualStyles(xml,visualStyles);
  const rules=readValidationRules(xml);
  const validationRanges=rules.flatMap(rule=>rule.ranges);
  if(rules.length)validations[id]=rules;
  const sheetSize=sheet['!ref']?utils.decode_range(sheet['!ref']).e:{r:0,c:0};
  if(sheetSize.r>=10000||sheetSize.c>=256)throw Error('O XLSX pode ter até 10 mil linhas e 256 colunas por aba.');
  for(const address of new Set([...Object.keys(sheet),...styles.keys()])){
   if(!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address))continue;
   const value=sheet[address]??{};
   const style=styles.get(address);
   if(!types[value.t]&&!value.f&&!style&&!value.z)continue;
   if(++cellCount>20000)throw Error('O XLSX pode ter até 20 mil células preenchidas.');
   const {r,c}=utils.decode_cell(address);
   if(r>=10000||c>=256)throw Error('O XLSX excede as dimensões permitidas.');
   const cell={};
   if(types[value.t]&&value.v!=null){cell.t=types[value.t];cell.v=value.t==='b'?Number(value.v):value.v;}
   if(value.f)cell.f='='+value.f;
   if(style)cell.s={...style};
   if(value.z&&value.z!=='General')(cell.s??={}).n={pattern:value.z};
   if(!Object.keys(cell).length)continue;
   (cellData[r]??={})[c]=cell;
  }
  const mergeData=(sheet['!merges']||[]).map(({s,e})=>({startRow:s.r,startColumn:s.c,endRow:e.r,endColumn:e.c}));
  if(mergeData.some(range=>range.endRow>=10000||range.endColumn>=256))throw Error('O XLSX contém uma mesclagem fora dos limites.');
  const rowData=readLayout(sheet['!rows'],10000,'h',row=>row.hpx??row.hpt*4/3);
  const columnData=readLayout(sheet['!cols'],256,'w',column=>column.wpx);
  const hidden=source.Workbook?.Sheets?.[index]?.Hidden;
  const filter=sheet['!autofilter']?.ref;
  const filtered=typeof filter==='string'&&addressPattern.test(filter)?utils.decode_range(filter.replaceAll('$','')):null;
  if(filtered&&filtered.s.r<=filtered.e.r&&filtered.s.c<=filtered.e.c&&filtered.e.r<10000&&filtered.e.c<256){
   filters[id]={ref:{startRow:filtered.s.r,startColumn:filtered.s.c,endRow:filtered.e.r,endColumn:filtered.e.c}};
   importFilterColumns(xml,filters[id],sheet,rowData);
  }
  snapshot.sheets[id]={
   id,name,cellData,mergeData,rowData,columnData,hidden:hidden===1||hidden===2?hidden:0,
   rowCount:Math.max(100,sheetSize.r+1,(filtered?.e.r<10000?filtered.e.r+1:0),
    ...Object.keys(rowData).map(key=>Number(key)+1),...mergeData.map(range=>range.endRow+1),...validationRanges.map(range=>range.endRow+1)),
   columnCount:Math.max(26,sheetSize.c+1,(filtered?.e.c<256?filtered.e.c+1:0),
    ...Object.keys(columnData).map(key=>Number(key)+1),...mergeData.map(range=>range.endColumn+1),...validationRanges.map(range=>range.endColumn+1))
  };
  snapshot.sheetOrder.push(id);
 }
 if(snapshot.sheetOrder.every(id=>snapshot.sheets[id].hidden))snapshot.sheets[snapshot.sheetOrder[0]].hidden=0;
 for(const entry of source.Workbook?.Names||[]){
  const ref=localReference(entry.Ref,source.SheetNames);
  if(!ref||!entry.Name||entry.Name.toLowerCase().startsWith('_xlnm.'))continue;
  const localSheetId=entry.Sheet==null?undefined:snapshot.sheetOrder[entry.Sheet];
  if(entry.Sheet!=null&&!localSheetId)continue;
  const id=crypto.randomUUID();
  names[id]={id,unitId:snapshot.id,name:entry.Name,formulaOrRefString:ref,localSheetId,comment:entry.Comment};
 }
 resourcesFor(snapshot,names,filters,validations);
 const charts=readSpreadsheetCharts(source.files,worksheets,snapshot);
 if(charts.length)snapshot.custom={mentraCharts:charts};
 return snapshot;
}

export function writeSpreadsheet(snapshot){
 const book=utils.book_new();
 const names=Object.values(getResource(snapshot,namesResource));
 const filters=getResource(snapshot,filterResource);
 const filterParts=new Map();
 const styleParts=new Map();
 const validationParts=new Map();
 const validations=getResource(snapshot,validationResource);
 const sheetNames=snapshot.sheetOrder.map(id=>snapshot.sheets[id].name);
 book.Workbook={WBProps:{date1904:snapshot.dateSystem==='date1904'},Sheets:[],Names:[]};
 for(const entry of names){
  const ref=localReference(entry.formulaOrRefString,sheetNames);
  if(!ref||!entry.name||entry.name.toLowerCase().startsWith('_xlnm.'))continue;
  const index=entry.localSheetId?snapshot.sheetOrder.indexOf(entry.localSheetId):undefined;
  if(index===-1)continue;
  book.Workbook.Names.push({Name:entry.name,Ref:ref,Sheet:index,Comment:entry.comment});
 }
 let totalArea=0;
 for(const id of snapshot.sheetOrder){
  const sheet=snapshot.sheets[id];
  if(!excelName.test(sheet.name))throw Error('Use nomes de aba válidos no Excel, com até 31 caracteres.');
  const result={};
  const styledCells=new Map();
  let lastRow=0,lastColumn=0;
  for(const [row,cells] of Object.entries(sheet.cellData||{})){
   for(const [column,cell] of Object.entries(cells)){
    if(!cell)continue;
    const style=typeof cell.s==='string'?snapshot.styles?.[cell.s]:cell.s;
    const visual=encodeVisualStyle(style);
    if(cell.v==null&&!cell.f&&!visual&&!style?.n?.pattern)continue;
    const r=Number(row),c=Number(column);
    if(r>=1048576||c>=16384)throw Error('A planilha excede as dimensões do Excel.');
    const boolean=cell.t===3;
    const value=boolean?Boolean(cell.v):cell.v;
    const out=value==null&&!cell.f?{t:'z',v:''}:{t:boolean?'b':typeof value==='number'||value==null?'n':'s'};
    if(value!=null)out.v=value;
    if(cell.f)out.f=cell.f.replace(/^=/,'');
    if(style?.n?.pattern)out.z=style.n.pattern;
    const address=utils.encode_cell({r,c});
    result[address]=out;
    if(visual)styledCells.set(address,visual);
    lastRow=Math.max(lastRow,r);lastColumn=Math.max(lastColumn,c);
   }
  }
  totalArea+=(lastRow+1)*(lastColumn+1);
  if(totalArea>1000000)throw Error('Reduza o intervalo preenchido para exportar o XLSX.');
  result['!ref']=utils.encode_range({r:0,c:0},{r:lastRow,c:lastColumn});
  result['!merges']=(sheet.mergeData||[]).map(range=>({
   s:{r:range.startRow,c:range.startColumn},e:{r:range.endRow,c:range.endColumn}
  }));
  const rows=writeLayout(sheet.rowData,'h','hpx',1048576);
  const columns=writeLayout(sheet.columnData,'w','wpx',16384);
  const filter=filters[id]?.ref;
  if(filter){
   result['!autofilter']={ref:utils.encode_range(
    {r:filter.startRow,c:filter.startColumn},{r:filter.endRow,c:filter.endColumn}
   )};
   const criteria=exportFilterColumns(filters[id]);
   if(criteria.xml)filterParts.set(book.SheetNames.length,criteria.xml);
   if(criteria.all&&Array.isArray(filters[id].cachedFilteredOut)){
    for(const row of filters[id].cachedFilteredOut){
     if(Number.isInteger(row)&&row>filter.startRow&&row<=filter.endRow&&row<1048576)
      rows[row]={...rows[row],hidden:true};
    }
   }
  }
  if(rows.length)result['!rows']=rows;
  if(columns.length)result['!cols']=columns;
  if(styledCells.size)styleParts.set(book.SheetNames.length,styledCells);
  const validationXml=writeValidationRules(validations[id]);
  if(validationXml)validationParts.set(book.SheetNames.length,validationXml);
  utils.book_append_sheet(book,result,sheet.name);
  book.Workbook.Sheets.push({Hidden:sheet.hidden===1||sheet.hidden===2?sheet.hidden:0});
 }
 const bytes=write(book,{type:'array',bookType:'xlsx',compression:true,cellStyles:true,sheetStubs:true});
 return recalculateOnOpen(extendSpreadsheetPackage(bytes,snapshot,{filterParts,styleParts,validationParts}));
}

/**
 * Pede ao Excel, LibreOffice e Google Planilhas que recalculem todas as fórmulas
 * ao abrir. Sem isso, um arquivo baixado antes de o editor terminar o cálculo
 * poderia abrir com células de fórmula vazias.
 */
export function recalculateOnOpen(bytes){
 const zip=CFB.read(new Uint8Array(bytes),{type:'array'});
 const entry=CFB.find(zip,'/xl/workbook.xml');
 if(!entry)throw Error('Pacote XLSX sem workbook.xml.');
 const xml=new TextDecoder().decode(entry.content);
 let updated;
 if(/<calcPr/.test(xml))updated=xml.replace(/<calcPr([^>]*?)\/?>/,(_,attributes)=>'<calcPr'+attributes.replace(/\s+fullCalcOnLoad="[^"]*"/,'')+' fullCalcOnLoad="1"/>');
 else updated=xml.replace(/<\/definedNames>|<\/sheets>(?![\s\S]*<\/definedNames>)/,anchor=>anchor+'<calcPr calcId="0" fullCalcOnLoad="1"/>');
 if(updated===xml)throw Error('Não foi possível ajustar o recálculo do XLSX.');
 CFB.utils.cfb_add(zip,'/xl/workbook.xml',new TextEncoder().encode(updated));
 return CFB.write(zip,{type:'array',fileType:'zip',compression:true});
}
