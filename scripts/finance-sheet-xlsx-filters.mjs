import {utils} from 'xlsx';

const operators={
 equal:(a,b)=>a===b,notEqual:(a,b)=>a!==b,greaterThan:(a,b)=>a>b,
 greaterThanOrEqual:(a,b)=>a>=b,lessThan:(a,b)=>a<b,lessThanOrEqual:(a,b)=>a<=b
};
const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'};
const xml=value=>String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g,'').replace(/[&<>"']/g,char=>entities[char]);
const bool=value=>value==='1'||value==='true';
const children=(node,name)=>[...(node?.children??[])].filter(item=>item.namespaceURI===node.namespaceURI&&(!name||item.localName===name));

export function importFilterColumns(sheetXml,filter,source,rowData){
 const root=children(sheetXml,'autoFilter')[0];
 if(!root)return;
 const columns=children(root,'filterColumn');
 const {startColumn,endColumn,startRow,endRow}=filter.ref;
 const criteria=[];
 const seen=new Set();
 for(const item of columns){
  const offset=item.getAttribute('colId');
  const colId=startColumn+Number(offset);
  if(!/^\d+$/.test(offset??'')||colId>endColumn||seen.has(colId))continue;
  seen.add(colId);
  const [selection,...extra]=children(item);
  if(!selection||extra.length)continue;
  if(selection.localName==='filters'){
   const values=children(selection);
   if(values.some(value=>value.localName!=='filter'||!value.hasAttribute('val'))||values.length>2000)continue;
   const blank=bool(selection.getAttribute('blank'));
   criteria.push({colId,filters:{filters:values.map(value=>value.getAttribute('val')),...(blank?{blank:true}:{})}});
  }else if(selection.localName==='customFilters'){
   const values=children(selection);
   if(!values.length||values.length>2)continue;
   const entries=values.map(value=>{
    const val=value.getAttribute('val');
    const operator=value.getAttribute('operator')||'equal';
    return value.localName==='customFilter'&&Object.hasOwn(operators,operator)&&numeric.test(val??'')&&Number.isFinite(Number(val))?
     {operator,val:Number(val)}:null;
   });
   if(entries.includes(null))continue;
   criteria.push({colId,customFilters:{customFilters:entries,...(bool(selection.getAttribute('and'))?{and:1}:{})}});
  }
 }
 if(!criteria.length)return;
 filter.filterColumns=criteria;
 // Excel encodes both manual and filtered row hiding with the same row flag.
 // Keep matching hidden rows manual. Let the imported criteria hide excluded rows.
 if(criteria.length!==columns.length)return;
 const matches=(criterion,row)=>{
  const cell=source[utils.encode_cell({r:row,c:criterion.colId})];
  if(criterion.filters){
   if(cell?.v==null||cell.v==='')return Boolean(criterion.filters.blank);
   return criterion.filters.filters.includes(String(cell.v))||criterion.filters.filters.includes(cell.w);
  }
  const checks=criterion.customFilters.customFilters.map(({operator,val})=>
   Number.isFinite(cell?.v)?operators[operator](cell.v,val):operator==='notEqual');
  return criterion.customFilters.and?checks.every(Boolean):checks.some(Boolean);
 };
 for(let row=startRow+1;row<=endRow;row++){
  if(rowData[row]?.hd&&criteria.some(criterion=>!matches(criterion,row))){
   delete rowData[row].hd;
   if(!Object.keys(rowData[row]).length)delete rowData[row];
  }
 }
}

export function exportFilterColumns(filter){
 const parts=[];
 const criteria=Array.isArray(filter?.filterColumns)?filter.filterColumns:[];
 const used=new Set();
 for(const criterion of criteria){
  const offset=criterion?.colId-filter.ref.startColumn;
  if(!Number.isInteger(offset)||offset<0||criterion.colId>filter.ref.endColumn||used.has(offset))continue;
  used.add(offset);
  let body='';
  if(criterion.filters&&Array.isArray(criterion.filters.filters)){
   const values=criterion.filters.filters;
   if(values.length>2000||values.some(value=>typeof value!=='string'))continue;
   body='<filters'+(criterion.filters.blank?' blank="1"':'')+'>'+
    values.map(value=>'<filter val="'+xml(value)+'"/>').join('')+'</filters>';
  }else if(Array.isArray(criterion.customFilters?.customFilters)){
   const values=criterion.customFilters.customFilters;
   if(!values.length||values.length>2||values.some(({operator,val})=>!Object.hasOwn(operators,operator)||!Number.isFinite(val)))continue;
   body='<customFilters'+(criterion.customFilters.and?' and="1"':'')+'>'+
    values.map(({operator,val})=>'<customFilter operator="'+operator+'" val="'+val+'"/>').join('')+'</customFilters>';
  }
  if(body)parts.push('<filterColumn colId="'+offset+'">'+body+'</filterColumn>');
 }
 return {xml:parts.join(''),all:parts.length>0&&parts.length===criteria.length};
}
