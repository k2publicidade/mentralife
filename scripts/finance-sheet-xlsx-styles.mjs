const horizontal=[null,'left','center','right','justify',null,'distributed'];
const vertical=[null,'top','center','bottom'];
const borders=[null,'thin','hair','dotted','dashed','dashDot','dashDotDot','double','medium','mediumDashed','mediumDashDot','mediumDashDotDot','slantDashDot','thick'];
const sides={l:'left',r:'right',t:'top',b:'bottom'};
const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'};
const escape=value=>String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g,'').replace(/[&<>"']/g,char=>entities[char]);
const children=(node,name)=>[...(node?.children??[])].filter(item=>item.namespaceURI===node.namespaceURI&&(!name||item.localName===name));
const child=(node,name)=>children(node,name)[0];
const attr=(node,key)=>node?.getAttribute(key)??null;
const active=node=>Boolean(node)&&!['0','false','none'].includes(attr(node,'val'));
const bool=value=>value==='1'||value==='true';
const rgb=node=>{
 const value=attr(node,'rgb');
 return /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value??'')?{rgb:'#'+value.slice(-6).toUpperCase()}:null;
};
const table=(root,group,item)=>children(child(root,group),item);

export function readVisualStyles(root){
 if(root?.localName!=='styleSheet')return [];
 const fonts=table(root,'fonts','font'),fills=table(root,'fills','fill'),lines=table(root,'borders','border');
 return table(root,'cellXfs','xf').map(xf=>{
  const style={};
  const fontId=Number(attr(xf,'fontId'));
  const font=fontId>0?fonts[fontId]:null;
  if(font&&attr(xf,'applyFont')!=='0'){
   const name=attr(child(font,'name'),'val'),size=Number(attr(child(font,'sz'),'val'));
   if(name)style.ff=name.slice(0,120);
   if(size>0&&size<=409)style.fs=size;
   if(active(child(font,'b')))style.bl=1;
   if(active(child(font,'i')))style.it=1;
   if(active(child(font,'u')))style.ul={s:1};
   if(active(child(font,'strike')))style.st={s:1};
   const color=rgb(child(font,'color'));
   if(color)style.cl=color;
  }
  const pattern=child(fills[Number(attr(xf,'fillId'))],'patternFill');
  const fill=attr(pattern,'patternType')==='solid'&&rgb(child(pattern,'fgColor'));
  if(fill&&attr(xf,'applyFill')!=='0')style.bg=fill;
  const border=lines[Number(attr(xf,'borderId'))];
  if(border&&attr(xf,'applyBorder')!=='0'){
   const edges={};
   for(const [key,name] of Object.entries(sides)){
    const node=child(border,name);
    const kind=borders.indexOf(attr(node,'style'));
    if(kind>0)edges[key]={s:kind,cl:rgb(child(node,'color'))||{rgb:'#000000'}};
   }
   if(Object.keys(edges).length)style.bd=edges;
  }
  const alignment=child(xf,'alignment');
  if(alignment&&attr(xf,'applyAlignment')!=='0'){
   const h=horizontal.indexOf(attr(alignment,'horizontal')),v=vertical.indexOf(attr(alignment,'vertical'));
   if(h>0)style.ht=h;
   if(v>0)style.vt=v;
   if(bool(attr(alignment,'wrapText')))style.tb=3;
   if(bool(attr(alignment,'shrinkToFit')))style.stf=1;
   const rotation=Number(attr(alignment,'textRotation'));
   if(rotation===255)style.tr={a:0,v:1};
   else if(Number.isInteger(rotation)&&rotation>0&&rotation<=180)style.tr={a:rotation>90?90-rotation:rotation};
  }
  return Object.keys(style).length?style:null;
 });
}

export function worksheetVisualStyles(root,styles){
 const entries=new Map();
 if(!root||!styles.some(Boolean))return entries;
 for(const row of children(child(root,'sheetData'),'row')){
  for(const cell of children(row,'c')){
   const index=Number(attr(cell,'s'));
   const address=attr(cell,'r');
   if(address&&styles[index])entries.set(address,styles[index]);
  }
 }
 return entries;
}

function hex(value){
 const raw=value?.rgb;
 if(typeof raw!=='string')return null;
 if(/^#?[0-9a-f]{6}$/i.test(raw))return raw.replace('#','').toUpperCase();
 if(/^#[0-9a-f]{3}$/i.test(raw))return [...raw.slice(1)].map(c=>c+c).join('').toUpperCase();
 const match=/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,[^)]+)?\)$/i.exec(raw);
 if(!match||match.slice(1).some(c=>Number(c)>255))return null;
 return match.slice(1).map(c=>Number(c).toString(16).padStart(2,'0')).join('').toUpperCase();
}
const colorXml=(name,value)=>value?'<'+name+' rgb="FF'+value+'"/>':'';
const val=(name,value)=>'<'+name+' val="'+escape(value)+'"/>';

export function encodeVisualStyle(style){
 if(!style)return null;
 const color=hex(style.cl),fill=hex(style.bg);
 const size=Number.isFinite(style.fs)&&style.fs>0&&style.fs<=409?style.fs:null;
 const name=typeof style.ff==='string'&&style.ff.trim()?style.ff.slice(0,120):null;
 const font=name||size||color||style.bl||style.it||style.ul?.s||style.st?.s?
  '<font>'+(style.bl?'<b/>':'')+(style.it?'<i/>':'')+(style.st?.s?'<strike/>':'')+
  (style.ul?.s?'<u/>':'')+val('sz',size||12)+colorXml('color',color)+val('name',name||'Calibri')+'</font>':'';
 const fillXml=fill?'<fill><patternFill patternType="solid">'+colorXml('fgColor',fill)+'<bgColor indexed="64"/></patternFill></fill>':'';
 const borderParts=Object.entries(sides).map(([key,side])=>{
  const edge=style.bd?.[key],kind=borders[edge?.s];
  return kind?'<'+side+' style="'+kind+'">'+colorXml('color',hex(edge.cl))+'</'+side+'>':'<'+side+'/>';
 });
 const border=borderParts.some(part=>part.includes('style='))?'<border>'+borderParts.join('')+'<diagonal/></border>':'';
 const align=[];
 if(horizontal[style.ht])align.push('horizontal="'+horizontal[style.ht]+'"');
 if(vertical[style.vt])align.push('vertical="'+vertical[style.vt]+'"');
 if(style.tb===3)align.push('wrapText="1"');
 if(style.stf)align.push('shrinkToFit="1"');
 const angle=style.tr?.a;
 if(style.tr?.v)align.push('textRotation="255"');
 else if(Number.isInteger(angle)&&angle!==0&&Math.abs(angle)<=90)
  align.push('textRotation="'+(angle<0?90-angle:angle)+'"');
 const alignment=align.length?'<alignment '+align.join(' ')+'/>':'';
 return font||fillXml||border||alignment?{font,fill:fillXml,border,alignment}:null;
}

// These patterns operate on the known SheetJS writer output, never on imported XML.
export function addVisualStyles(read,put,bySheet){
 if(!bySheet.size)return;
 const path='xl/styles.xml';
 let xml=read(path);
 const names=['fonts','fills','borders','cellXfs'];
 const sections=names.map(name=>{
  const pattern=new RegExp('<'+name+' count="(\\d+)">([\\s\\S]*?)</'+name+'>');
  const match=pattern.exec(xml??'');
  if(!match)throw Error('Não foi possível incluir a formatação no XLSX.');
  return {name,pattern,count:Number(match[1]),base:match[2],extra:new Map()};
 });
 const [fonts,fills,bordersSection,xfs]=sections;
 const baseStyles=xfs.base.match(/<xf\b[^>]*\/>/g)??[];
 const add=(section,body)=>{
  if(!body)return 0;
  if(!section.extra.has(body))section.extra.set(body,section.count+section.extra.size);
  return section.extra.get(body);
 };
 for(const [sheetIndex,styles] of bySheet){
  const worksheetPath='xl/worksheets/sheet'+(sheetIndex+1)+'.xml';
  const sheet=read(worksheetPath);
  if(!sheet)throw Error('Não foi possível encontrar a aba para formatar.');
  put(worksheetPath,sheet.replace(/<c\b([^>]*?)\/?>/g,(original,attributes)=>{
   const address=/\br="([A-Z]+[0-9]+)"/.exec(attributes)?.[1];
   const visual=styles.get(address);
   if(!visual)return original;
   const existing=/\bs="(\d+)"/.exec(attributes);
   const base=baseStyles[Number(existing?.[1]??0)];
   const numberFormat=/\bnumFmtId="(\d+)"/.exec(base??'')?.[1]??'0';
   const fontId=add(fonts,visual.font),fillId=add(fills,visual.fill),borderId=add(bordersSection,visual.border);
   const definition='<xf numFmtId="'+numberFormat+'" fontId="'+fontId+'" fillId="'+fillId+'" borderId="'+borderId+'" xfId="0"'+
    (numberFormat!=='0'?' applyNumberFormat="1"':'')+(fontId?' applyFont="1"':'')+
    (fillId?' applyFill="1"':'')+(borderId?' applyBorder="1"':'')+
    (visual.alignment?' applyAlignment="1">'+visual.alignment+'</xf>':'/>');
   const styleId=add(xfs,definition);
   const close=original.endsWith('/>')?'/>':'>';
   return '<c'+attributes.replace(/\s+s="\d+"/,'')+' s="'+styleId+'"'+close;
  }));
 }
 for(const {name,pattern,count,base,extra} of sections)
  xml=xml.replace(pattern,()=>'<'+name+' count="'+(count+extra.size)+'">'+base+[...extra.keys()].join('')+'</'+name+'>');
 put(path,xml);
}
