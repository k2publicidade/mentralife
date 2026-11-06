import {Capacitor,CapacitorHttp} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {nativeApiRequest} from './transport.mjs';
import {PushNotifications} from '@capacitor/push-notifications';
import {Browser} from '@capacitor/browser';
import {installNativeCalendar} from './calendar.mjs';
import {installNativePush} from './notifications.mjs';

if(Capacitor.isNativePlatform()){
 globalThis.mentraNative=true;
 globalThis.mentraPublicOrigin=MENTRA_API_ORIGIN;
 globalThis.mentraNativeApi=(path,options)=>nativeApiRequest(CapacitorHttp.request,path,options,MENTRA_API_ORIGIN);
 globalThis.mentraNativeCalendar=await installNativeCalendar({app:App,browser:Browser,request:globalThis.mentraNativeApi,origin:MENTRA_API_ORIGIN});
 globalThis.mentraNativePush=await installNativePush(PushNotifications,Capacitor.getPlatform(),globalThis.mentraNativeApi,{available:Capacitor.getPlatform()!=='android'||MENTRA_ANDROID_PUSH_AVAILABLE});
 globalThis.mentraNativeShare=async(blob,name)=>{
  const safeName=String(name||'mentra-arquivo').replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,100);
  const path=`shared/${crypto.randomUUID()}-${safeName}`;
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
  const file=await Filesystem.writeFile({path,data,directory:Directory.Cache,recursive:true});
  // Receivers may read the URI after Android's chooser returns. Keep it in cache
  // until the next day's cleanup instead of deleting it before they can open it.
  await Share.share({title:safeName,files:[file.uri],dialogTitle:'Salvar ou compartilhar arquivo'});
 };
 try{const entries=await Filesystem.readdir({path:'shared',directory:Directory.Cache});for(const file of entries.files)if(file.mtime<Date.now()-86400000)await Filesystem.deleteFile({path:`shared/${file.name}`,directory:Directory.Cache});}catch{}
 Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>Boolean(data?.files?.length===1)});
 Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
  if(data.files?.length===1)return globalThis.mentraNativeShare(data.files[0],data.files[0].name);
  if(data.url&&!/^https?:\/\//.test(data.url))throw Error('Endereço inválido.');
  return Share.share({title:data.title,text:data.text,url:data.url});
 }});
 await App.addListener('backButton',({canGoBack})=>{
  const close=document.querySelector('.install-help button, .modal [data-action="close-modal"]');
  if(close){close.click();return;}
  if(location.pathname!=='/'&&location.pathname!=='/index.html'){if(canGoBack)history.back();else location.assign('/');return;}
  if(location.hash&&location.hash!=='#/hoje'){if(canGoBack)history.back();else location.hash='/hoje';return;}
  void App.minimizeApp();
 });
 await App.addListener('appStateChange',({isActive})=>{if(isActive){window.dispatchEvent(new Event('online'));void globalThis.mentraNativePush.resume().catch(()=>{});}});
}
