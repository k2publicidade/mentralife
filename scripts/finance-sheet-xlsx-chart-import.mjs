import {utils} from 'xlsx';

const officeRelNamespaces=[
 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
 'http://purl.oclc.org/ooxml/officeDocument/relationships'
];
const spreadsheetNamespaces=[
 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
 'http://purl.oclc.org/ooxml/spreadsheetml/main'
];
const chartNamespaces=[
 'http://schemas.openxmlformats.org/drawingml/2006/chart',
 'http://purl.oclc.org/ooxml/drawingml/chart'
];
const relationshipNamespace='http://schemas.openxmlformats.org/package/2006/relationships';
const referencePattern=/^(?:'((?:[^']|'')+)'|([^!'\[\]]+))!(\$?[A-Z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Z]{1,3}\$?[1-9]\d{0,6})?)$/i;
const decoder=new TextDecoder();
const children=(node,ns,name)=>[...(node?.children??[])].filter(child=>child.namespaceURI===ns&&child.localName===name);
const child=(node,ns,name)=>children(node,ns,name)[0];
const elements=(node,namespaces,name)=>namespaces.flatMap(ns=>[...node.getElementsByTagNameNS(ns,name)]);
const relationId=node=>officeRelNamespaces.map(ns=>node.getAttributeNS(ns,'id')).find(Boolean);

function partPath(owner,target){
 if(!target||/[\\:#?\x00-\x1f]/.test(target))return null;
 const base=target.startsWith('/')?[]:owner.split('/').slice(0,-1);
 for(const piece of target.split('/')){
  if(!piece||piece==='.')continue;
  if(piece==='..'){
   if(!base.length)return null;
   base.pop();
  }else base.push(piece);
 }
 return base.join('/');
}

function readXml(files,path){
 if(!path||!Object.hasOwn(files,path))return null;
 const bytes=files[path]?.content;
 if(!bytes||bytes.length>2*1024*1024)return null;
 const text=typeof bytes==='string'?bytes:decoder.decode(Uint8Array.from(bytes));
 if(/<!DOCTYPE|<!ENTITY/i.test(text))return null;
 const doc=new DOMParser().parseFromString(text,'application/xml');
 return doc.getElementsByTagName('parsererror').length?null:doc.documentElement;
}

function links(files,owner){
 const pieces=owner.split('/');
 const part=pieces.pop();
 const location=owner?[...pieces,'_rels',part+'.rels'].join('/'):'_rels/.rels';
 const root=readXml(files,location);
 const found=[];
 for(const item of children(root,relationshipNamespace,'Relationship')){
  const id=item.getAttribute('Id'),uri=item.getAttribute('Type');
  if(!id||item.getAttribute('TargetMode')==='External')continue;
  const namespace=officeRelNamespaces.find(ns=>uri?.startsWith(ns+'/'));
  if(!namespace)continue;
  const path=partPath(owner,item.getAttribute('Target'));
  if(path)found.push({id,type:uri.slice(namespace.length+1),path});
 }
 return found;
}

function dataRange(formula,sheets){
 const match=referencePattern.exec(formula?.trim()??'');
 if(!match)return null;
 const name=match[1]?.replaceAll("''","'")??match[2];
 const sheet=sheets.get(name.toLowerCase());
 if(!sheet)return null;
 const range=utils.decode_range(match[3].replaceAll('$','').toUpperCase());
 if(range.s.r>range.e.r||range.s.c!==range.e.c||range.e.r>=sheet.rowCount||range.e.c>=sheet.columnCount)return null;
 return {sheet,...range};
}

function chartType(plot,ns){
 switch(plot.localName){
  case 'barChart':{
   const direction=child(plot,ns,'barDir')?.getAttribute('val');
   const grouping=child(plot,ns,'grouping')?.getAttribute('val')??'clustered';
   if(grouping==='stacked'&&direction==='col')return 'stacked';
   if(grouping!=='clustered'&&grouping!=='standard')return null;
   return direction==='bar'?'horizontal':direction==='col'?'bar':null;
  }
  case 'lineChart':return [undefined,'standard'].includes(child(plot,ns,'grouping')?.getAttribute('val'))?'line':null;
  case 'pieChart':return 'pie';
  case 'doughnutChart':return 'doughnut';
  default:return null;
 }
}

function chartConfig(root,sheets){
 const ns=root?.namespaceURI;
 if(!chartNamespaces.includes(ns)||root.localName!=='chartSpace')return null;
 const chart=child(root,ns,'chart');
 const plotArea=child(chart,ns,'plotArea');
 const plots=[...(plotArea?.children??[])].filter(node=>node.namespaceURI===ns&&node.localName.endsWith('Chart'));
 if(plots.length!==1)return null;
 const type=chartType(plots[0],ns);
 const series=children(plots[0],ns,'ser');
 if(!type||!series.length||series.length>8||(['pie','doughnut'].includes(type)&&series.length!==1))return null;

 const formula=(node,...references)=>{
  for(const name of references){
   const ref=child(child(node,ns,name),ns,'f');
   if(ref)return ref.textContent;
  }
 };
 const categories=dataRange(formula(child(series[0],ns,'cat'),'strRef','numRef'),sheets);
 if(!categories||categories.s.r<1||categories.e.r-categories.s.r>=100)return null;
 const sameRows=(range,other)=>range&&range.sheet===other.sheet&&range.s.r===other.s.r&&range.e.r===other.e.r;
 for(const [index,item] of series.entries()){
  const cat=dataRange(formula(child(item,ns,'cat'),'strRef','numRef'),sheets);
  const values=dataRange(formula(child(item,ns,'val'),'numRef'),sheets);
  if(!sameRows(cat,categories)||cat.s.c!==categories.s.c||!sameRows(values,categories)||values.s.c!==categories.s.c+index+1)return null;
  const label=formula(child(item,ns,'tx'),'strRef');
  if(label){
   const header=dataRange(label,sheets);
   if(!header||header.sheet!==categories.sheet||header.s.r!==categories.s.r-1||header.e.r!==header.s.r||header.s.c!==values.s.c)return null;
  }
 }
 const title=child(chart,ns,'title');
 const titleParts=title?[
  ...title.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','t'),
  ...title.getElementsByTagNameNS('http://purl.oclc.org/ooxml/drawingml/main','t')
 ]:[];
 const caption=titleParts.map(node=>node.textContent).join('')||title?.getElementsByTagNameNS(ns,'v')[0]?.textContent;
 return {
  id:crypto.randomUUID(),title:caption?.trim().slice(0,80)||'Gráfico importado',sheetId:categories.sheet.id,type,
  range:utils.encode_range({r:categories.s.r-1,c:categories.s.c},{r:categories.e.r,c:categories.s.c+series.length})
 };
}

export function* readWorkbookWorksheets(files){
 if(!files||typeof DOMParser!=='function')return;
 const workbook=links(files,'').find(link=>link.type==='officeDocument');
 const root=readXml(files,workbook?.path);
 if(!root||!spreadsheetNamespaces.includes(root.namespaceURI))return;
 const workbookLinks=links(files,workbook.path);
 for(const node of elements(root,spreadsheetNamespaces,'sheet')){
  const id=relationId(node);
  const worksheet=workbookLinks.find(link=>link.id===id&&link.type==='worksheet');
  if(!worksheet)continue;
  const sheetXml=readXml(files,worksheet.path);
  if(!sheetXml)continue;
  yield {name:node.getAttribute('name'),sheetXml,path:worksheet.path};
 }
}

export function readWorkbookStyleSheet(files){
 if(!files||typeof DOMParser!=='function')return null;
 const workbook=links(files,'').find(link=>link.type==='officeDocument');
 const styles=workbook&&links(files,workbook.path).find(link=>link.type==='styles');
 return readXml(files,styles?.path);
}

export function readSpreadsheetCharts(files,worksheets,snapshot){
 const sheets=new Map(snapshot.sheetOrder.map(id=>[snapshot.sheets[id].name.toLowerCase(),snapshot.sheets[id]]));
 const charts=[];
 for(const {sheetXml,path} of worksheets){
  const drawingIds=new Set(elements(sheetXml,spreadsheetNamespaces,'drawing').map(relationId));
  if(!drawingIds.size)continue;
  for(const link of links(files,path).filter(link=>link.type==='drawing'&&drawingIds.has(link.id))){
   const drawing=readXml(files,link.path);
   if(!drawing)continue;
   const chartIds=new Set(elements(drawing,chartNamespaces,'chart').map(relationId));
   for(const chart of links(files,link.path).filter(item=>item.type==='chart'&&chartIds.has(item.id))){
    const config=chartConfig(readXml(files,chart.path),sheets);
    if(config)charts.push(config);
    if(charts.length===12)return charts;
   }
  }
 }
 return charts;
}
