import {readUpload,uploadFilename} from './uploads.mjs';
import {accountState} from './account-state.mjs';
import {healthState} from './health-core.mjs';
import {validCalendarDate} from './organizer.mjs';
import {validTimeZone} from './time.mjs';
export function accountRecoveryJson(snapshot,user){
 if(!snapshot||!Object.hasOwn(snapshot,'data')||!Number.isInteger(snapshot.revision)||snapshot.revision<0||typeof user?.id!=='string'||!user.id)throw Error('Não foi possível preparar a cópia desta conta.');
 if(new TextEncoder().encode(JSON.stringify(snapshot.data)).length>5000000)throw Error('O conteúdo excede os 5 MB da conta.');
 return JSON.stringify({format:'mentra-life-recovery-v1',ownerId:user.id,baseRevision:snapshot.revision,data:snapshot.data});
}
export async function parseAccountBackup(raw,user){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>7000000)throw Error('A cópia deve ter até 7 MB.');
 let envelope;try{envelope=JSON.parse(raw);}catch{throw Error('Arquivo JSON inválido.');}
 if(!envelope||!['mentra-life-account-v1','mentra-life-recovery-v1'].includes(envelope.format)||envelope.ownerId!==user.id)throw Error('Use uma cópia exportada desta mesma conta.');
 const source=envelope.data===null?accountState(null,user):envelope.data;if(!source||typeof source!=='object'||Array.isArray(source))throw Error('A cópia não contém dados de organização.');
 if(new TextEncoder().encode(JSON.stringify(source)).length>5000000)throw Error('O conteúdo excede os 5 MB da conta.');
 function inspect(value,depth=0){if(depth>30)throw Error('Estrutura da cópia muito profunda.');if(value&&typeof value==='object'){for(const [key,child] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw Error('Chave inválida na cópia.');inspect(child,depth+1);}}}
 inspect(source);const data=accountState(source,user);
 if(typeof data.profile.name!=='string'||data.profile.name.length>80||data.profile.timeZone&&!validTimeZone(data.profile.timeZone))throw Error('Perfil inválido na cópia.');
 for(const name of ['tasks','events','records','documents','inbox','accounts','obligations','budgets','recurrences','journeys']){const seen=new Set();if(data[name].length>10000)throw Error('Coleção muito extensa.');for(const row of data[name]){if(!row||typeof row!=='object'||typeof row.id!=='string'||! /^[a-zA-Z0-9_-]{1,120}$/.test(row.id)||seen.has(row.id))throw Error('Registro sem identidade válida ou duplicado em '+name+'.');seen.add(row.id);if(row.route&&! /^[a-z0-9/_-]+$/i.test(row.route))throw Error('Destino inválido na cópia.');}}
 const text=value=>typeof value==='string';
 for(const row of data.tasks)if(!text(row.title)||!text(row.category)||typeof row.done!=='boolean'||row.dueDate&&!validCalendarDate(row.dueDate))throw Error('Tarefa inválida na cópia.');
 for(const row of data.events)if(!text(row.title)||!validCalendarDate(row.date)||!text(row.time)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)||!Number.isInteger(row.duration)||row.duration<1||row.duration>1440||row.timeZone&&!validTimeZone(row.timeZone))throw Error('Compromisso inválido na cópia.');
 for(const row of data.records)if(!text(row.title)||!Number.isSafeInteger(row.cents)||row.cents<=0||!validCalendarDate(row.date)||!['income','expense','transfer'].includes(row.type)||!['actual','estimated'].includes(row.status))throw Error('Lançamento inválido na cópia.');
 for(const row of data.documents)if(!text(row.title)||!text(row.category)||!text(row.ext))throw Error('Documento inválido na cópia.');
 for(const row of data.inbox)if(!text(row.title)||!text(row.type))throw Error('Mensagem de captura inválida.');
 for(const row of data.accounts)if(!text(row.name))throw Error('Conta financeira inválida.');
 for(const row of data.journeys)if(!text(row.title)||!text(row.goal)||!Array.isArray(row.steps)||row.steps.some(step=>!step||!text(step.id)||!/^[a-zA-Z0-9_-]{1,120}$/.test(step.id)||!text(step.title)||!text(step.description)||!['todo','doing','done'].includes(step.status)))throw Error('Plano inválido na cópia.');
 for(const m of data.messages)if(!m||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||m.route&&! /^[a-z0-9/_-]+$/i.test(m.route))throw Error('Conversa inválida na cópia.');
 if(healthState(data).readOnly)throw Error('Os registros de saúde desta cópia precisam de revisão.');
 for(const doc of data.documents)for(const key of ['fileData','pdfData']){
  const encoded=doc[key];if(encoded===undefined||encoded===null||encoded==='')continue;
  try{
   if(typeof encoded!=='string'||encoded.length>4*Math.ceil(512000/3)||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw Error();
   const binary=atob(encoded);if(btoa(binary)!==encoded)throw Error();const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   const checked=await readUpload({name:uploadFilename(doc),size:bytes.length,arrayBuffer:async()=>bytes.buffer});
   if(!checked||bytes.length!==doc.fileSize||doc.mime&&doc.mime!==checked.mime||key==='pdfData'&&checked.ext!=='PDF'||key==='fileData'&&checked.sha256!==doc.sha256||key==='pdfData'&&doc.sha256&&checked.sha256!==doc.sha256)throw Error();
  }catch{throw Error('A integridade do original não confere.');}
 }

 return data;
}
