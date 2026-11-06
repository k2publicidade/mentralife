const storageKey='mentra-native-push-device';
const routePattern=/^\/#\/(vida\/(agenda|tarefas)|momentos\/(morning|afternoon|night))$/;
export async function installNativePush(plugin,platform,request,{available=true,storage=localStorage,user=()=>globalThis.mentraPlatform?.user?.id||globalThis.mentraNativeUserId,go=path=>{location.hash=path.slice(1);}}={}){
 let pending=null,queuedRoute=null,generation=0;const bindings=new Set();
 const stored=()=>{try{return JSON.parse(storage.getItem(storageKey)||'null');}catch{return null;}};
 const call=async(method,body)=>{const response=await request('push/native-device',{method,body:JSON.stringify(body)}),result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível vincular os avisos.');return result;};
 async function bind(token,owner,at){
  if(!owner||user()!==owner||at!==generation)throw Error('A conta mudou durante a ativação.');
  const previous=stored(),result=await call('POST',{platform,token,previousToken:previous?.userId===owner?previous.token:undefined});
  if(user()!==owner||at!==generation){await call('DELETE',{platform,token});throw Error('A conta mudou durante a ativação.');}
  try{storage.setItem(storageKey,JSON.stringify({platform,token,userId:owner}));}
  catch(error){await call('DELETE',{platform,token});throw error;}
  return result;
 }
 await plugin.addListener('registration',({value})=>{
  const activation=pending,previous=stored(),owner=activation?.owner||previous?.userId;
  if(!owner||owner!==user())return;
  const work=bind(value,owner,generation);bindings.add(work);
  void work.then(result=>activation?.resolve(result),error=>activation?.reject(error)).finally(()=>bindings.delete(work));
 });
 await plugin.addListener('registrationError',error=>{pending?.reject(Error('Não foi possível registrar os avisos neste aparelho. Confira a configuração do aplicativo.'));});
 await plugin.addListener('pushNotificationActionPerformed',event=>{const path=event.notification?.data?.url;if(!routePattern.test(path||''))return;if(user()&&stored()?.userId===user())go(path);else queuedRoute=path;});
 return {
  platform,
  available,
  async subscribe(){
   if(!available)throw Error('A configuração de notificações ainda não foi incluída neste aplicativo.');
   if(pending)throw Error('Aguarde a ativação em andamento.');const owner=user();if(!owner)throw Error('Entre na sua conta.');
   let permission=await plugin.checkPermissions();if(permission.receive==='prompt'||permission.receive==='prompt-with-rationale')permission=await plugin.requestPermissions();
   if(permission.receive!=='granted')throw Error('Autorize as notificações nas configurações do aparelho para receber os lembretes.');
   if(platform==='android')await plugin.createChannel({id:'mentra-reminders',name:'Lembretes Mentra',description:'Agenda, tarefas e Momentos Mentra',importance:3,visibility:0});
   let timer;
   const registration=new Promise((resolve,reject)=>{pending={owner,resolve,reject};timer=setTimeout(()=>reject(Error('O registro demorou mais que o esperado. Tente novamente.')),20000);});
   try{return (await Promise.all([plugin.register(),registration]))[1];}finally{clearTimeout(timer);pending=null;}
  },
  async unsubscribe(){
   generation++;queuedRoute=null;pending?.reject(Error('Ativação cancelada ao sair da conta.'));pending=null;
   await Promise.allSettled([...bindings]);
   const previous=stored();let result;if(previous&&previous.userId===user())result=await call('DELETE',{platform:previous.platform,token:previous.token});
   // Once the backend has revoked delivery, an unavailable SDK must not prevent logout.
   if(previous)await plugin.unregister().catch(()=>{});
   storage.removeItem(storageKey);await plugin.removeAllDeliveredNotifications().catch(()=>{});
   return result;
  },
  async resume(){const previous=stored();if(previous?.userId===user()){if(queuedRoute){go(queuedRoute);queuedRoute=null;}if(available&&(await plugin.checkPermissions()).receive==='granted')await plugin.register();}else queuedRoute=null;}
 };
}
