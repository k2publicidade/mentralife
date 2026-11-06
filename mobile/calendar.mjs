import {nativeCalendarState} from '../dist/calendar-native-return.mjs';
const storageKey='mentra-native-calendar-flow';
export async function installNativeCalendar({app,browser,request,origin,storage=localStorage,user=()=>globalThis.mentraPlatform?.user?.id||globalThis.mentraNativeUserId,onComplete=()=>{location.hash='/vida/agenda';},now=Date.now}){
 let pending=null,candidate=null,completing=false;
 const stored=()=>{try{return JSON.parse(storage.getItem(storageKey)||'null');}catch{return null;}};
 const clear=()=>{storage.removeItem(storageKey);candidate=null;};
 async function receive(raw){
  let target;try{target=new URL(raw);}catch{return;}
  if(target.protocol!=='mentralife:'||target.hostname!=='calendar'||target.pathname!=='/complete'||target.username||target.password||target.port||target.hash)return;
  const flow=stored(),state=target.searchParams.get('state');
  if(!flow||!nativeCalendarState.test(state||'')||state!==flow.state||flow.expiresAt<=now())return;
  if(!user()){candidate=raw;return;}
  if(flow.owner!==user()){clear();return;}
  if(completing)return;completing=true;
  const active=pending;pending=null;
  try{
   // Retain only the nonce across restarts; authorization codes stay in memory.
   clear();
   if(target.searchParams.has('error'))throw Error('Autorização cancelada. Sua agenda não foi importada.');
   const code=target.searchParams.get('code');if(!code||code.length>4096)throw Error('Retorno de autorização inválido. Conecte novamente.');
   const result=await request('calendar/complete',{method:'POST',body:JSON.stringify({state:state.slice(7),code})});
   let data;try{data=await result.json();}catch{throw Error('Servidor indisponível. Tente novamente.');}
   if(!result.ok||data?.ok!==true)throw Error(data?.error||'Não foi possível concluir a conexão.');
   if(user()!==flow.owner)throw Error('A conta mudou durante a autorização. Entre na conta que iniciou a conexão.');
   if(active)active.resolve();else onComplete();
  }catch(error){if(active)active.reject(error);else globalThis.alert?.(error.message);}
  finally{completing=false;await browser.close().catch(()=>{});}
 }
 await app.addListener('appUrlOpen',({url})=>{void receive(url);});
 await browser.addListener('browserFinished',()=>{
  if(completing||!pending)return;const active=pending;
  // Android can deliver the tab-finished event just before the app URL event.
  setTimeout(()=>{if(completing||pending!==active)return;pending=null;clear();active.reject(Error('A autorização foi interrompida. Você pode tentar novamente.'));},400);
 });
 const launch=await app.getLaunchUrl();if(launch?.url)await receive(launch.url);
 return {
  async connect(raw){
   if(pending||completing)throw Error('Aguarde a conexão em andamento.');
   const owner=user();let target,redirect;
   try{target=new URL(raw);redirect=new URL(target.searchParams.get('redirect_uri'));}catch{throw Error('Endereço de autorização inválido.');}
   const state=target.searchParams.get('state');
   if(!owner||target.origin!=='https://accounts.google.com'||target.username||target.password||target.hash||target.pathname!=='/o/oauth2/v2/auth'||!nativeCalendarState.test(state||'')||redirect.origin!==origin||redirect.username||redirect.password||redirect.search||redirect.hash||redirect.pathname!=='/calendar-callback'||target.searchParams.get('code_challenge_method')!=='S256')throw Error('Endereço de autorização inválido.');
   storage.setItem(storageKey,JSON.stringify({owner,state,expiresAt:now()+600000}));
   let timer;const completion=new Promise((resolve,reject)=>{pending={resolve,reject};timer=setTimeout(()=>{pending=null;clear();reject(Error('A autorização expirou. Inicie novamente.'));},600000);});
   try{await Promise.all([browser.open({url:target.href,toolbarColor:'#173e32'}),completion]);}
   finally{clearTimeout(timer);pending=null;clear();}
  },
  async resume(){if(candidate)await receive(candidate);else{const flow=stored();if(flow&&(flow.owner!==user()||flow.expiresAt<=now()))clear();}},
  cancel(){pending?.reject(Error('Conexão cancelada ao sair da conta.'));pending=null;clear();}
 };
}
