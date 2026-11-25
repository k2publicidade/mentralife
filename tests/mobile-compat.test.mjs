import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

test('WebKit antigo recebe cópias sem perda, UUID seguro e cancelamento com motivo',async()=>{
 const context=createContext({DOMException,setTimeout,crypto:{getRandomValues:bytes=>crypto.getRandomValues(bytes)}});
 runInContext(`
  globalThis.structuredClone=undefined;Object.hasOwn=undefined;Array.prototype.at=undefined;
  class LegacySignal {aborted=false;}
  class LegacyController {signal=new LegacySignal();abort(){this.signal.aborted=true;}}
  globalThis.AbortSignal=LegacySignal;globalThis.AbortController=LegacyController;
 `,context);
 runInContext(readFileSync(new URL('../dist/compat.mjs',import.meta.url),'utf8'),context);
 const result=runInContext(`(()=>{
  const source={profile:{name:'Pessoa'},tasks:[{id:'one',done:false}],missing:undefined};source.self=source;
  const clone=structuredClone(source);clone.tasks[0].done=true;
  const prototype=structuredClone(Object.defineProperty({},'__proto__',{value:{polluted:true},enumerable:true}));
  const controller=new AbortController();controller.abort('motivo');let reason;try{controller.signal.throwIfAborted();}catch(error){reason=error;}
  let invalid=false;try{structuredClone({value:()=>{}});}catch(error){invalid=error.name==='DataCloneError';}
  return {uuid:crypto.randomUUID(),isolated:source.tasks[0].done===false,cycle:clone.self===clone,missing:Object.hasOwn(clone,'missing'),at:[1,2].at(-1),safe:Object.getPrototypeOf(prototype)===Object.prototype&&Object.hasOwn(prototype,'__proto__')&&!({}).polluted,reason,invalid};
 })()`,context);
 assert.match(result.uuid,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 for(const key of ['isolated','cycle','missing','safe','invalid'])assert.equal(result[key],true,key);
 assert.equal(result.reason,'motivo');assert.equal(result.at,2);
 runInContext('globalThis.timeout=AbortSignal.timeout(1)',context);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(runInContext('timeout.reason.name',context),'TimeoutError');
});
