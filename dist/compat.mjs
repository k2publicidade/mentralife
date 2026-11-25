// The native iOS target starts at 15.0. Keep account data and request handling
// usable on its WebKit, without replacing implementations on newer systems.
const define=(object,key,value)=>Object.defineProperty(object,key,{value,writable:true,configurable:true});
if(!Object.hasOwn)define(Object,'hasOwn',(object,key)=>Object.prototype.hasOwnProperty.call(object,key));
if(!Array.prototype.at)define(Array.prototype,'at',function(index){const value=+index,offset=Number.isNaN(value)?0:Math.trunc(value),position=offset<0?this.length+offset:offset;return position<0||position>=this.length?undefined:this[position];});
if(!globalThis.crypto.randomUUID)define(globalThis.crypto,'randomUUID',()=>{
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const raw=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
});
if(!('reason' in AbortSignal.prototype)){
 const reasons=new WeakMap(),abort=AbortController.prototype.abort;
 define(AbortController.prototype,'abort',function(reason){if(!this.signal.aborted)reasons.set(this.signal,reason===undefined?new DOMException('Operação cancelada.','AbortError'):reason);return abort.call(this);});
 Object.defineProperty(AbortSignal.prototype,'reason',{configurable:true,get(){return this.aborted?(reasons.has(this)?reasons.get(this):new DOMException('Operação cancelada.','AbortError')):undefined;}});
}
if(!AbortSignal.prototype.throwIfAborted)define(AbortSignal.prototype,'throwIfAborted',function(){if(this.aborted)throw this.reason;});
if(!AbortSignal.timeout)define(AbortSignal,'timeout',milliseconds=>{
 if(!Number.isInteger(milliseconds)||milliseconds<0||milliseconds>2147483647)throw new RangeError('Prazo inválido.');
 const controller=new AbortController();setTimeout(()=>controller.abort(new DOMException('O tempo da operação expirou.','TimeoutError')),milliseconds);return controller.signal;
});
if(!globalThis.structuredClone)define(globalThis,'structuredClone',(value,options)=>{
 if(options?.transfer?.length)throw new DOMException('Transferência indisponível neste aparelho.','DataCloneError');
 const copies=new Map(),invalid=()=>{throw new DOMException('Tipo de dado não pode ser copiado.','DataCloneError');};
 function copy(item){
  if(typeof item==='function'||typeof item==='symbol')return invalid();
  if(item===null||typeof item!=='object')return item;
  if(copies.has(item))return copies.get(item);
  let result;
  if(Array.isArray(item))result=new Array(item.length);
  else if(item instanceof Date)result=new Date(item.getTime());
  else if(item instanceof RegExp)result=new RegExp(item.source,item.flags);
  else if(item instanceof Map)result=new Map();
  else if(item instanceof Set)result=new Set();
  else if(item instanceof ArrayBuffer)result=item.slice(0);
  else if(ArrayBuffer.isView(item)){const buffer=copy(item.buffer);result=item instanceof DataView?new DataView(buffer,item.byteOffset,item.byteLength):new item.constructor(buffer,item.byteOffset,item.length);}
  else if(typeof File!=='undefined'&&item instanceof File)result=new File([item],item.name,{type:item.type,lastModified:item.lastModified});
  else if(typeof Blob!=='undefined'&&item instanceof Blob)result=item.slice(0,item.size,item.type);
  else if(Object.prototype.toString.call(item)==='[object Object]')result={};
  else return invalid();
  copies.set(item,result);
  if(item instanceof Map)for(const [key,value]of item)result.set(copy(key),copy(value));
  else if(item instanceof Set)for(const value of item)result.add(copy(value));
  else if(Array.isArray(item)||Object.prototype.toString.call(item)==='[object Object]')for(const key of Object.keys(item))Object.defineProperty(result,key,{value:copy(item[key]),writable:true,enumerable:true,configurable:true});
  return result;
 }
 return copy(value);
});
