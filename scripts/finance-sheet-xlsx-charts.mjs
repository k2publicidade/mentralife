import {CFB,utils} from 'xlsx';
import {addVisualStyles} from './finance-sheet-xlsx-styles.mjs';

const relationships='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const drawing='http://schemas.openxmlformats.org/drawingml/2006/';
const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const address=/^[A-Z]{1,3}[1-9]\d{0,6}:[A-Z]{1,3}[1-9]\d{0,6}$/;
const types=new Set(['bar','horizontal','stacked','line','pie','doughnut']);
const encode=new TextEncoder();
const decode=new TextDecoder();
const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'};
const xml=value=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g,'').replace(/[&<>"']/g,character=>entities[character]);
const tag=(name,value)=>`<c:${name} val="${value}"/>`;
const axisIds=[100,200];

function chartReference(sheet,column,first,last=first){
 const start=`$${utils.encode_col(column)}$${first+1}`;
 const end=`$${utils.encode_col(column)}$${last+1}`;
 return "'" + sheet.replaceAll("'","''") + "'!" + start + (start===end?'':':'+end);
}

function cache(kind,values){
 const points=values.map((value,index)=>value==null?'':`<c:pt idx="${index}"><c:v>${xml(value)}</c:v></c:pt>`).join('');
 return `<c:${kind}Cache>${kind==='num'?'<c:formatCode>General</c:formatCode>':''}${tag('ptCount',values.length)}${points}</c:${kind}Cache>`;
}

function reference(kind,formula,values){
 return `<c:${kind}Ref><c:f>${xml(formula)}</c:f>${cache(kind,values)}</c:${kind}Ref>`;
}

function axes(horizontal){
 const [category,value]=axisIds;
 const base=(id,position)=>tag('axId',id)+'<c:scaling>'+tag('orientation','minMax')+'</c:scaling>'+tag('delete',0)+tag('axPos',position);
 const crossing=id=>tag('crossAx',id)+tag('crosses','autoZero');
 return '<c:catAx>'+base(category,horizontal?'l':'b')+tag('tickLblPos','nextTo')+crossing(value)+
  tag('auto',1)+tag('lblAlgn','ctr')+tag('lblOffset',100)+'</c:catAx>'+
  '<c:valAx>'+base(value,horizontal?'b':'l')+'<c:majorGridlines/>'+tag('tickLblPos','nextTo')+
  crossing(category)+tag('crossBetween','between')+'</c:valAx>';
}

function chartXml(chart,sheet,range){
 const {s,e}=range;
 const cell=(row,column)=>sheet.cellData?.[row]?.[column];
 const rows=Array.from({length:e.r-s.r},(_,index)=>s.r+1+index);
 const categories=rows.map(row=>cell(row,s.c)?.v??null);
 const categoryRef=reference('str',chartReference(sheet.name,s.c,s.r+1,e.r),categories);
 const circular=chart.type==='pie'||chart.type==='doughnut';
 const series=[];
 for(let column=s.c+1;column<=e.c;column++){
  const index=column-s.c-1;
  const values=rows.map(row=>{
   const entry=cell(row,column);
   return entry?.t!==3&&Number.isFinite(entry?.v)?entry.v:null;
  });
  series.push('<c:ser>'+tag('idx',index)+tag('order',index)+
   '<c:tx>'+reference('str',chartReference(sheet.name,column,s.r),[cell(s.r,column)?.v??null])+'</c:tx>'+
   '<c:cat>'+categoryRef+'</c:cat>'+
   '<c:val>'+reference('num',chartReference(sheet.name,column,s.r+1,e.r),values)+'</c:val></c:ser>');
 }
 const ids=axisIds.map(id=>tag('axId',id)).join('');
 const joined=series.join('');
 let plot;
 if(circular){
  const node=chart.type==='pie'?'pieChart':'doughnutChart';
  plot=`<c:${node}>${tag('varyColors',1)}${joined}${tag('firstSliceAng',0)}${node==='doughnutChart'?tag('holeSize',50):''}</c:${node}>`;
 }else if(chart.type==='line'){
  plot='<c:lineChart>'+tag('grouping','standard')+joined+ids+'</c:lineChart>';
 }else{
  const stacked=chart.type==='stacked';
  plot='<c:barChart>'+tag('barDir',chart.type==='horizontal'?'bar':'col')+
   tag('grouping',stacked?'stacked':'clustered')+joined+(stacked?tag('overlap',100):'')+ids+'</c:barChart>';
 }
 return declaration+`<c:chartSpace xmlns:c="${drawing}chart" xmlns:a="${drawing}main">`+tag('lang','pt-BR')+
  '<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>'+xml(chart.title)+
  '</a:t></a:r></a:p></c:rich></c:tx><c:layout/>'+tag('overlay',0)+'</c:title>'+
  '<c:plotArea><c:layout/>'+plot+(circular?'':axes(chart.type==='horizontal'))+'</c:plotArea>'+
  '<c:legend>'+tag('legendPos','b')+'<c:layout/>'+tag('overlay',0)+'</c:legend>'+
  tag('plotVisOnly',0)+tag('dispBlanksAs','gap')+'</c:chart></c:chartSpace>';
}

function anchor({column,row},index,chart){
 const position=(name,c,r)=>`<xdr:${name}><xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${name}>`;
 return '<xdr:twoCellAnchor editAs="oneCell">'+position('from',column,row)+position('to',column+8,row+16)+
  `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${index}" name="${xml(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`+
  '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'+
  `<a:graphic><a:graphicData uri="${drawing}chart"><c:chart xmlns:c="${drawing}chart" r:id="rId${index}"/></a:graphicData></a:graphic>`+
  '</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
}

const rel=(id,type,target)=>`<Relationship Id="${id}" Type="${relationships}/${type}" Target="${target}"/>`;
const relationshipsXml=entries=>declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+entries+'</Relationships>';

export function extendSpreadsheetPackage(bytes,snapshot,{filterParts,styleParts,validationParts}){
 const saved=snapshot.custom?.mentraCharts;
 const bySheet=new Map();
 for(const chart of Array.isArray(saved)?saved:[]){
  if(!types.has(chart?.type)||typeof chart.title!=='string'||typeof chart.range!=='string'||!address.test(chart.range))continue;
  const index=snapshot.sheetOrder.indexOf(chart.sheetId);
  if(index===-1)continue;
  const range=utils.decode_range(chart.range);
  const height=range.e.r-range.s.r,width=range.e.c-range.s.c;
  if(height<1||height>100||width<1||width>8||range.e.r>=1048576||range.e.c>=16384)continue;
  if((chart.type==='pie'||chart.type==='doughnut')&&width!==1)continue;
  if(!bySheet.has(index))bySheet.set(index,[]);
  bySheet.get(index).push({chart,range});
 }
 if(!bySheet.size&&!filterParts.size&&!styleParts.size&&!validationParts.size)return bytes;
 // Only the package just generated by SheetJS is modified here.
 const zip=CFB.read(new Uint8Array(bytes),{type:'array'});
 const read=path=>{
  const entry=CFB.find(zip,'/'+path);
  return entry?decode.decode(entry.content):null;
 };
 const put=(path,content)=>CFB.utils.cfb_add(zip,'/'+path,encode.encode(content));
 addVisualStyles(read,put,styleParts);
 for(const [sheetIndex,validation] of validationParts){
  const path=`xl/worksheets/sheet${sheetIndex+1}.xml`;
  const worksheet=read(path);
  const updated=worksheet?.replace(/<(?:hyperlinks\b|ignoredErrors\b)|<\/worksheet>/,anchor=>validation+anchor);
  if(!updated||updated===worksheet)throw Error('Não foi possível incluir a validação de dados no XLSX.');
  put(path,updated);
 }
 for(const [sheetIndex,criteria] of filterParts){
  const path=`xl/worksheets/sheet${sheetIndex+1}.xml`;
  const worksheet=read(path);
  const updated=worksheet?.replace(/<autoFilter ([^>]+)\/>/,(_,attributes)=>'<autoFilter '+attributes+'>'+criteria+'</autoFilter>');
  if(!updated||updated===worksheet)throw Error('Não foi possível incluir os critérios do filtro no XLSX.');
  put(path,updated);
 }
 const overrides=[];
 const override=(part,type)=>overrides.push(`<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`);
 let chartNumber=0;
 for(const [sheetIndex,entries] of bySheet){
  const number=sheetIndex+1;
  const sheet=snapshot.sheets[snapshot.sheetOrder[sheetIndex]];
  const worksheet=`xl/worksheets/sheet${number}.xml`;
  const worksheetRels=`xl/worksheets/_rels/sheet${number}.xml.rels`;
  const drawingPath=`xl/drawings/drawing${number}.xml`;
  const worksheetXml=read(worksheet);
  if(!worksheetXml?.endsWith('</worksheet>'))throw Error('Não foi possível incorporar os gráficos no XLSX.');
  put(worksheet,worksheetXml.replace('</worksheet>','<drawing r:id="rIdMentraCharts"/></worksheet>'));
  const drawingRel=rel('rIdMentraCharts','drawing',`../drawings/drawing${number}.xml`);
  const existingRels=read(worksheetRels);
  put(worksheetRels,existingRels?existingRels.replace('</Relationships>',drawingRel+'</Relationships>'):relationshipsXml(drawingRel));
  const drawingRels=[],anchors=[];
  const right=Math.max(...entries.map(({range})=>range.e.c))+2;
  const chartColumn=right<=16375?right:0;
  entries.forEach(({chart,range},index)=>{
   const id=index+1;
   const part=`xl/charts/chart${++chartNumber}.xml`;
   put(part,chartXml(chart,sheet,range));
   override(part,'drawingml.chart');
   drawingRels.push(rel('rId'+id,'chart',`../charts/chart${chartNumber}.xml`));
   anchors.push(anchor({column:chartColumn,row:index*18},id,chart));
  });
  put(drawingPath,declaration+`<xdr:wsDr xmlns:xdr="${drawing}spreadsheetDrawing" xmlns:a="${drawing}main" xmlns:r="${relationships}">`+anchors.join('')+'</xdr:wsDr>');
  override(drawingPath,'drawing');
  put(`xl/drawings/_rels/drawing${number}.xml.rels`,relationshipsXml(drawingRels.join('')));
 }
 if(overrides.length){
  const typesXml=read('[Content_Types].xml');
  if(!typesXml?.endsWith('</Types>'))throw Error('Não foi possível registrar os gráficos no XLSX.');
  put('[Content_Types].xml',typesXml.replace('</Types>',overrides.join('')+'</Types>'));
 }
 return new Uint8Array(CFB.write(zip,{type:'array',fileType:'zip',compression:true}));
}
