import {utils} from 'xlsx';

export const validationResource='SHEET_DATA_VALIDATION_PLUGIN';
const types=new Set(['list','whole','decimal','date','textLength','custom','any']);
const operators=new Set(['between','notBetween','equal','notEqual','greaterThan','lessThan','greaterThanOrEqual','lessThanOrEqual']);
const errorStyles=['information','stop','warning'];
const cellAddress=/^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Z]{1,3}\$?[1-9]\d{0,6})?$/i;
const number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'};
const xml=value=>String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g,'').replace(/[&<>"']/g,c=>entities[c]);
const attribute=(name,value)=>' '+name+'="'+xml(value)+'"';
const children=(node,name)=>[...(node?.children??[])].filter(item=>item.namespaceURI===node.namespaceURI&&item.localName===name);
const boolean=value=>value==='1'||value==='true';
const numeric=value=>number.test(value)&&Number.isFinite(Number(value));
const formulaText=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2048&&!/[\[\]\x00-\x1f]/.test(value)?value.trim():null;

function readFormula(value,type){
 const text=formulaText(value);
 if(!text)return null;
 if(type==='list'&&text.startsWith('"')&&text.endsWith('"')){
  const list=text.slice(1,-1).replaceAll('""','"').split(',').filter(Boolean);
  return list.length?JSON.stringify(list):null;
 }
 const expression=text.replace(/^=/,'');
 if(!expression)return null;
 return type!=='list'&&type!=='custom'&&numeric(expression)?expression:'='+expression;
}

function writeFormula(value,type){
 if(typeof value!=='string')return null;
 if(type==='list'&&!value.startsWith('=')){
  let choices;
  try{choices=JSON.parse(value);}catch{choices=value.split(',').map(item=>item.trim());}
  if(!Array.isArray(choices)||!choices.length||choices.some(item=>typeof item!=='string'||!item||/[,\r\n]/.test(item)))return null;
  const list='"'+choices.map(item=>item.replaceAll('"','""')).join(',')+'"';
  return list.length<=255?list:null;
 }
 const expression=formulaText(value)?.replace(/^=/,'');
 return expression||null;
}

function readRanges(input){
 const tokens=input?.trim().split(/\s+/)??[];
 if(!tokens.length||tokens.length>128)return [];
 const ranges=[];
 for(const token of tokens){
  if(!cellAddress.test(token))return [];
  const {s,e}=utils.decode_range(token.replaceAll('$','').toUpperCase());
  if(s.r>e.r||s.c>e.c||e.r>=10000||e.c>=256)return [];
  ranges.push({startRow:s.r,startColumn:s.c,endRow:e.r,endColumn:e.c});
 }
 return ranges;
}

function writeRanges(ranges){
 if(!Array.isArray(ranges)||!ranges.length||ranges.length>128)return null;
 const references=[];
 for(const range of ranges){
  if(!range)return null;
  const {startRow,startColumn,endRow,endColumn}=range;
  if(![startRow,startColumn,endRow,endColumn].every(value=>Number.isInteger(value)&&value>=0)||
     startRow>endRow||startColumn>endColumn||endRow>=1048576||endColumn>=16384)return null;
  references.push(utils.encode_range({r:startRow,c:startColumn},{r:endRow,c:endColumn}));
 }
 return references.join(' ');
}

const comparison=type=>type==='whole'||type==='decimal'||type==='date'||type==='textLength';
const doubleBound=operator=>operator==='between'||operator==='notBetween';

export function readValidationRules(sheetXml){
 const group=children(sheetXml,'dataValidations')[0];
 const rules=[];
 let coverage=0;
 for(const node of children(group,'dataValidation').slice(0,250)){
  const type=node.getAttribute('type')||'any';
  const ranges=readRanges(node.getAttribute('sqref'));
  if(!types.has(type)||!ranges.length)continue;
  const cells=ranges.reduce((total,range)=>total+
   (range.endRow-range.startRow+1)*(range.endColumn-range.startColumn+1),0);
  if(coverage+cells>100000)continue;
  const rule={
   uid:crypto.randomUUID(),type,ranges,
   allowBlank:boolean(node.getAttribute('allowBlank')),
   showErrorMessage:boolean(node.getAttribute('showErrorMessage')),
   showInputMessage:boolean(node.getAttribute('showInputMessage')),
   errorStyle:1
  };
  if(type==='list')rule.showDropDown=!boolean(node.getAttribute('showDropDown'));
  if(comparison(type)){
   rule.operator=node.getAttribute('operator')||'between';
   if(!operators.has(rule.operator))continue;
  }
  if(type!=='any'){
   const first=readFormula(children(node,'formula1')[0]?.textContent,type);
   const second=readFormula(children(node,'formula2')[0]?.textContent,type);
   if(!first||(doubleBound(rule.operator)&&!second))continue;
   rule.formula1=first;
   if(doubleBound(rule.operator))rule.formula2=second;
  }
  const error=errorStyles.indexOf(node.getAttribute('errorStyle'));
  if(error>=0)rule.errorStyle=error;
  for(const key of ['error','errorTitle','prompt','promptTitle']){
   const value=node.getAttribute(key);
   if(value)rule[key]=value.slice(0,key.endsWith('Title')?32:255);
  }
  rules.push(rule);
  coverage+=cells;
 }
 return rules;
}

export function writeValidationRules(rules){
 if(!Array.isArray(rules))return '';
 const entries=[];
 for(const rule of rules.slice(0,250)){
  if(!types.has(rule?.type))continue;
  const ranges=writeRanges(rule.ranges);
  if(!ranges)continue;
  let attributes=attribute('sqref',ranges);
  let body='';
  if(rule.type!=='any'){
   const first=writeFormula(rule.formula1,rule.type);
   if(!first)continue;
   attributes+=attribute('type',rule.type);
   body='<formula1>'+xml(first)+'</formula1>';
   if(comparison(rule.type)){
    if(!operators.has(rule.operator))continue;
    attributes+=attribute('operator',rule.operator);
    if(doubleBound(rule.operator)){
     const second=writeFormula(rule.formula2,rule.type);
     if(!second)continue;
     body+='<formula2>'+xml(second)+'</formula2>';
    }
   }
  }
  if(rule.type==='list'&&rule.showDropDown===false)attributes+=attribute('showDropDown',1);
  if(rule.allowBlank)attributes+=attribute('allowBlank',1);
  if(rule.showErrorMessage!==false)attributes+=attribute('showErrorMessage',1);
  if(rule.showInputMessage)attributes+=attribute('showInputMessage',1);
  if(errorStyles[rule.errorStyle])attributes+=attribute('errorStyle',errorStyles[rule.errorStyle]);
  for(const key of ['error','errorTitle','prompt','promptTitle']){
   if(typeof rule[key]==='string'&&rule[key])attributes+=attribute(key,rule[key].slice(0,key.endsWith('Title')?32:255));
  }
  entries.push('<dataValidation'+attributes+'>'+body+'</dataValidation>');
 }
 return entries.length?'<dataValidations count="'+entries.length+'">'+entries.join('')+'</dataValidations>':'';
}
