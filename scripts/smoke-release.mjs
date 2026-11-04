import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export function releaseOrigin(value){let u;try{u=new URL(value);}catch{throw Error('Informe --url com a origem do sistema.');}if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Use uma origem HTTPS, ou HTTP somente no loopback local, sem caminho, credenciais ou parâmetros.');return u.origin;}
export async function smokeRelease(origin,{fetcher=fetch}={}){
 const base=releaseOrigin(origin),checks=[];const add=(id,ok)=>checks.push({id,ok:Boolean(ok)});
 const get=async path=>fetcher(base+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:path.startsWith('/api/')?'application/json':'text/html'}});
 for(const [path,id,expected]of [['/','public_page',200],['/api/health','schema',200],['/api/plans','three_plans',200],['/api/state','private_state',401],['/api/admin/users','private_admin',401],['/api/calendar','private_calendar',401],['/api/document-shares','private_documents',401],['/downloads/mentra-life-codigo-fonte.zip','source_not_public',404],['/handoff/mentra-handoff.json','handoff_not_public',404]]){
  try{const response=await get(path);let ok=response.status===expected;
   if(path==='/api/health'){const b=await response.json();ok&&=b.status==='ok'&&b.checks?.database==='ok';}
   if(path==='/api/plans'){const b=await response.json();ok&&=Array.isArray(b.plans)&&b.plans.length===3&&new Set(b.plans.map(p=>p.id)).size===3&&b.paymentsConfigured===false;}
   if(path.startsWith('/api/'))ok&&=/no-store/.test(response.headers.get('cache-control')||'');
   add(id,ok);if(response.body&&!response.bodyUsed)await response.body.cancel();
  }catch{add(id,false);}
 }
 return checks;
}
async function main(){try{const i=process.argv.indexOf('--url'),checks=await smokeRelease(i>=0?process.argv[i+1]:undefined);for(const c of checks)console.log((c.ok?'OK ':'FALHOU ')+c.id);console.log('Verificação somente de leitura; não cria contas, não cobra e não comprova provedores ou homologação completa.');if(checks.some(c=>!c.ok))process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
