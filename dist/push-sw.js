const OFFLINE_CACHE='mentra-offline-v1';
const OFFLINE_ASSETS=['/offline.html','/offline.css','/assets/mentra-face.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 if(typeof caches!=='undefined'){const cache=await caches.open(OFFLINE_CACHE);await cache.addAll(OFFLINE_ASSETS);}
 // Keep an active account session on its current release until it is closed.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 if(typeof caches!=='undefined')for(const key of await caches.keys())if(key.startsWith('mentra-offline-')&&key!==OFFLINE_CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const {request}=event,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));return;
 }
 if(OFFLINE_ASSETS.includes(url.pathname)&&!url.search)event.respondWith(caches.match(url.pathname).then(cached=>cached||fetch(request)));
});
self.addEventListener('push',event=>{let payload;try{payload=event.data?.json();}catch{return;}if(!payload||typeof payload.tag!=='string'||!/^\/#\/(vida\/(agenda|tarefas)|momentos\/(morning|afternoon|night))$/.test(payload.url))return;event.waitUntil(self.registration.showNotification('Mentra Life',{body:'Você tem um lembrete na sua conta.',icon:'/assets/mentra-face.png',badge:'/assets/mentra-logo-original.png',tag:payload.tag,data:{url:payload.url},renotify:false}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const route=event.notification.data?.url;if(!/^\/#\/(vida\/(agenda|tarefas)|momentos\/(morning|afternoon|night))$/.test(route||''))return;const url=new URL(route,self.location.origin).href;event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus();}}return self.clients.openWindow(url);})());});
