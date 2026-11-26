const copy=value=>structuredClone(value);
export function createSyncController({userId,revision:initialRevision,store,write,onStatus=()=>{},writerId=crypto.randomUUID()}){
 const key=userId+':'+writerId;let revision=initialRevision,localTail=Promise.resolve(),networkTail=Promise.resolve(),latest=null,queued=0,blocked=false,retrying=false,error=null,phase='idle',adopted=null,durableId=null,offline=false;
 // Sem conexão: as edições continuam aceitas e guardadas no aparelho; a mais recente é enviada ao reconectar.
 const isNetworkError=problem=>!problem?.status&&['TypeError','TimeoutError','AbortError','NetworkError'].includes(problem?.name);
 const status=()=>({phase,revision,offline,pending:queued>0||latest!==null,blocked:blocked||retrying,error,localCopy:latest?copy(latest):null,localCopySaved:Boolean(store.persistent&&latest&&durableId===latest.operationId)});
 const emit=()=>onStatus(status());
 function stage(data,{operationId=crypto.randomUUID(),baseRevision,allowBlocked=false}={}){
  if(blocked&&!allowBlocked)return false;
  const payload={key,userId,writerId,data:copy(data),operationId,baseRevision:baseRevision??revision,updatedAt:Date.now(),formatVersion:1};latest=payload;queued++;phase='saving';error=null;emit();
  const durable=localTail.then(async()=>{payload.baseRevision=baseRevision??revision;await store.put(payload);durableId=operationId;});localTail=durable.catch(()=>{});
  networkTail=networkTail.then(async()=>{
   try{
    await durable;if(blocked||offline)return;
    const expected=baseRevision??revision,result=await write({data:payload.data,revision:expected,operationId});
    if(!Number.isInteger(result.revision)||result.revision<1)throw Error('O servidor não confirmou a gravação.');
    revision=result.revision;await store.acknowledge(key,operationId,revision);
    if(adopted){await store.remove(adopted.key,adopted.operationId);adopted=null;}
    if(latest?.operationId===operationId)latest=null;else if(latest)latest.baseRevision=revision;
   }catch(problem){if(isNetworkError(problem)){offline=true;error=problem;phase='offline';}else{blocked=true;error=problem;phase=problem.status===409?'conflict':problem.status===401?'auth':problem.name==='QuotaExceededError'?'storage':'error';}}
   finally{queued--;if(!queued){retrying=false;if(!blocked)phase=latest?(offline?'offline':'saving'):'idle';}emit();}
  });
  return true;
 }
 let remoteBusy=false;
 const save=data=>remoteBusy?false:stage(data);
 // Remote actions own the revision until their server snapshot is adopted.
 async function remote(operation,apply){
  if(remoteBusy||blocked||retrying)throw Error('Resolva a sincronização antes de enviar o pedido.');
  remoteBusy=true;
  try{
   if(!await save.flush())throw Error('Resolva a sincronização antes de enviar o pedido.');
   const result=await operation(revision);
   if(result.state){
    if(!Number.isSafeInteger(result.state.revision)||result.state.revision<revision||!result.state.data)throw Error('O servidor não confirmou a versão dos dados.');
    apply(result);revision=result.state.revision;emit();
   }
   return result;
  }finally{remoteBusy=false;}
 }
 async function retry(data=latest?.data){await networkTail;await localTail;offline=false;if(!data)return true;const unchanged=latest&&JSON.stringify(data)===JSON.stringify(latest.data),operationId=unchanged?latest.operationId:crypto.randomUUID(),baseRevision=unchanged?latest.baseRevision:revision;blocked=false;retrying=true;stage(data,{operationId,baseRevision,allowBlocked:true});await networkTail;return !blocked;}
 async function adopt(record){await networkTail;if(record.userId!==userId)throw Error('A cópia local pertence a outra conta.');adopted=copy(record);revision=record.baseRevision;blocked=false;retrying=true;stage(record.data,{operationId:record.operationId,baseRevision:record.baseRevision,allowBlocked:true});await networkTail;return !blocked;}
 async function replace(data,reviewedRevision){await networkTail;await localTail;if(!Number.isInteger(reviewedRevision)||reviewedRevision<0)throw Error('A versão do servidor precisa ser revisada.');revision=reviewedRevision;blocked=false;retrying=true;stage(data,{baseRevision:reviewedRevision,allowBlocked:true});await networkTail;return !blocked;}
 async function discard(serverRevision){await networkTail;await localTail;offline=false;if(latest)await store.remove(key,latest.operationId);if(adopted)await store.remove(adopted.key,adopted.operationId);latest=null;adopted=null;revision=serverRevision;blocked=false;retrying=false;error=null;phase='idle';emit();}
 Object.assign(save,{remote,retry,adopt,replace,discard,status,flush:async()=>{await networkTail;await localTail;return !blocked&&!latest;},hasPending:()=>remoteBusy||queued>0||latest!==null});
 return save;
}
