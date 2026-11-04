export const enc=new TextEncoder();
export const hex=value=>Array.from(new Uint8Array(value),x=>x.toString(16).padStart(2,'0')).join('');
export const digest=async value=>hex(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):value));
export const problem=(text,status=400)=>{throw Object.assign(Error(text),{status});};
export const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function limitedBytes(request,limit){if(Number(request.headers.get('content-length'))>limit)problem('Arquivo ou mensagem acima do limite.',413);const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();problem('Arquivo ou mensagem acima do limite.',413);}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
export async function activeAccount(db,userId){const s=await db.prepare('SELECT status,current_period_end FROM subscriptions WHERE user_id=?').bind(userId).first();return s?.status==='active'&&(!s.current_period_end||s.current_period_end>Date.now());}
export const randomCode=()=>hex(crypto.getRandomValues(new Uint8Array(16)));
export async function integrationBody(req){let b;try{b=JSON.parse(new TextDecoder().decode(await limitedBytes(req,20000)));}catch(e){if(e.status)throw e;problem('JSON inválido.');}if(!b||typeof b!=='object'||Array.isArray(b))problem('JSON inválido.');return b;}
