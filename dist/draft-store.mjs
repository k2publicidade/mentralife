export async function openDraftStore({indexedDB=globalThis.indexedDB,name='mentra-life-recovery'}={}){
 if(!indexedDB)throw Error('Este navegador não disponibiliza armazenamento de recuperação.');
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('drafts',{keyPath:'key'});store.createIndex('userId','userId');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Feche outras abas para abrir o armazenamento de recuperação.'));});
 function transaction(mode,run){return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts');let result;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||Error('A cópia local não foi concluída.'));tx.onerror=()=>{};try{run(store,value=>{result=value;});}catch(error){tx.abort();reject(error);}});}
 return {
  persistent:true,
  list(userId){return transaction('readonly',(store,result)=>{const req=store.index('userId').getAll(userId);req.onsuccess=()=>result(req.result.sort((a,b)=>b.updatedAt-a.updatedAt));});},
  put(record){return transaction('readwrite',store=>{store.put(structuredClone(record));});},
  acknowledge(key,operationId,revision){return transaction('readwrite',store=>{const req=store.get(key);req.onsuccess=()=>{const record=req.result;if(!record)return;if(record.operationId===operationId)store.delete(key);else store.put({...record,baseRevision:revision});};});},
  remove(key,operationId){return transaction('readwrite',store=>{const req=store.get(key);req.onsuccess=()=>{if(req.result?.operationId===operationId)store.delete(key);};});},
  clearUser(userId){return transaction('readwrite',store=>{const req=store.index('userId').openCursor(userId);req.onsuccess=()=>{const cursor=req.result;if(cursor){cursor.delete();cursor.continue();}};});},
  close(){db.close();}
 };
}
export function memoryDraftStore(){const records=new Map();return {persistent:false,async put(record){records.set(record.key,structuredClone(record));},async list(userId){return [...records.values()].filter(r=>r.userId===userId).map(r=>structuredClone(r));},async acknowledge(key,operationId,revision){const record=records.get(key);if(!record)return;if(record.operationId===operationId)records.delete(key);else records.set(key,{...record,baseRevision:revision});},async remove(key,operationId){if(records.get(key)?.operationId===operationId)records.delete(key);},async clearUser(userId){for(const [key,record] of records)if(record.userId===userId)records.delete(key);},close(){}};}
