const encode=new TextEncoder();
export function httpsOrigin(value){
 let url;try{url=new URL(value);}catch{throw Error('Informe uma origem HTTPS válida.');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Use uma origem HTTPS sem caminho, credenciais ou parâmetros.');
 return url.origin;
}
async function sameSecret(a,b){
 const hashes=await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',encode.encode(s))));
 const x=new Uint8Array(hashes[0]),y=new Uint8Array(hashes[1]);let different=0;
 for(let i=0;i<x.length;i++)different|=x[i]^y[i];return different===0;
}
const unavailable=()=>Object.assign(Error('Configuração de hospedagem incompleta.'),{status:503});
export async function hostedRequest(request,env){
 if(!env.PUBLIC_ORIGIN&&!env.VERCEL_ORIGIN_SECRET)return request;
 let origin;try{origin=httpsOrigin(env.PUBLIC_ORIGIN);}catch{throw unavailable();}
 if(!/^[a-f0-9]{64}$/.test(env.VERCEL_ORIGIN_SECRET||''))throw unavailable();
 const url=new URL(request.url);
 // Meta calls this signed webhook directly; the health endpoint contains no private data.
 if(url.pathname==='/api/health'||url.pathname==='/api/whatsapp/webhook')return request;
 if(!url.pathname.startsWith('/api/'))return request;
 const supplied=request.headers.get('x-mentra-origin-secret')||'';
 if(supplied.length!==64||!await sameSecret(supplied,env.VERCEL_ORIGIN_SECRET))throw Object.assign(Error('Acesso ao backend não autorizado.'),{status:403});
 const headers=new Headers(request.headers);headers.delete('x-mentra-origin-secret');
 // Only trust visitor metadata after authenticating the Vercel routing layer.
 const ip=headers.get('x-real-ip')||'';
 headers.delete('CF-Connecting-IP');
 if(ip.length<=64&&/^[a-fA-F0-9:.]+$/.test(ip))headers.set('CF-Connecting-IP',ip);
 url.protocol='https:';const publicUrl=new URL(origin);url.host=publicUrl.host;
 return new Request(url, new Request(request,{headers}));
}
