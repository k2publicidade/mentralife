export async function nativeApiRequest(request,path,options={},origin){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.pathname!=='/'||base.username||base.password||base.search||base.hash)throw Error('Origem da API inválida.');
 const target=new URL('/api/'+path,base);
 if(target.origin!==base.origin||!target.pathname.startsWith('/api/')||target.hash)throw Error('Destino da API inválido.');
 options.signal?.throwIfAborted();
 const method=options.method||'GET';
 const headers=new Headers(options.headers);
 if(!headers.has('content-type'))headers.set('content-type','application/json');
 headers.set('origin',base.origin);
 let data,dataType;
 if(options.body instanceof Blob){
  const bytes=new Uint8Array(await options.body.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  data=btoa(binary);dataType='file';
  if(headers.get('content-type')==='application/json')headers.set('content-type',options.body.type||'application/octet-stream');
 }else if(options.body!==undefined){
  if(typeof options.body!=='string')throw Error('Formato de envio não suportado.');
  data=headers.get('content-type').includes('application/json')?JSON.parse(options.body):options.body;
 }
 options.signal?.throwIfAborted();
 // The native HTTP client's cookie jar owns HttpOnly sessions; never read or store tokens in JS.
 let abort;
 const aborted=new Promise((_,reject)=>{abort=()=>reject(options.signal.reason||new DOMException('Operação cancelada.','AbortError'));options.signal?.addEventListener('abort',abort,{once:true});});
 let result;
 try{result=await Promise.race([request({url:target.href,method,headers:Object.fromEntries(headers),data,dataType,responseType:'json',connectTimeout:60000,readTimeout:60000,disableRedirects:true}),aborted]);}
 finally{options.signal?.removeEventListener('abort',abort);}
 options.signal?.throwIfAborted();
 return {ok:result.status>=200&&result.status<300,status:result.status,json:async()=>typeof result.data==='string'?JSON.parse(result.data):result.data};
}
