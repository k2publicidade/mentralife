const encoder=new TextEncoder();
const base64=bytes=>{let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');};
const json64=value=>base64(encoder.encode(JSON.stringify(value)));
function pemBytes(pem){return Uint8Array.from(atob(pem.replace(/-----[A-Z ]+-----/g,'').replace(/\s/g,'')),char=>char.charCodeAt(0));}
export function firebaseAccount(env){
 try{const account=JSON.parse(env.FCM_SERVICE_ACCOUNT||'null');return account?.type==='service_account'&&/^[a-z][a-z0-9-]{4,62}$/.test(account.project_id||'')&&/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(account.client_email||'')&&account.private_key?.includes('BEGIN PRIVATE KEY')?account:null;}catch{return null;}
}
export function nativePushConfigured(env,platform){
 const android=Boolean(firebaseAccount(env));
 const ios=Boolean(/^[A-Z0-9]{10}$/.test(env.APNS_TEAM_ID||'')&&/^[A-Z0-9]{10}$/.test(env.APNS_KEY_ID||'')&&/^[a-zA-Z0-9.-]+$/.test(env.APNS_TOPIC||'')&&env.APNS_PRIVATE_KEY?.includes('BEGIN PRIVATE KEY')&&['sandbox','production'].includes(env.APNS_ENVIRONMENT));
 return platform==='android'?android:platform==='ios'?ios:android||ios;
}
async function jwt(header,payload,pem,algorithm){
 const key=await crypto.subtle.importKey('pkcs8',pemBytes(pem),algorithm,false,['sign']),input=json64(header)+'.'+json64(payload);
 const signature=await crypto.subtle.sign(algorithm.name==='ECDSA'?{name:'ECDSA',hash:'SHA-256'}:algorithm,key,encoder.encode(input));
 return input+'.'+base64(new Uint8Array(signature));
}
// Credentials are kept in an isolate-local, bounded cache, never in the database or client.
let authorization=null,appleAuthorization=null;
async function firebaseAuthorization(env,fetcher,now){
 const account=firebaseAccount(env);if(!account)throw Error('FCM não configurado.');
 if(authorization?.credential===env.FCM_SERVICE_ACCOUNT&&authorization.expires>now+60000)return authorization.token;
 const issued=Math.floor(now/1000),assertion=await jwt({alg:'RS256',typ:'JWT'},{iss:account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:issued,exp:issued+3600},account.private_key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'});
 const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Autorização FCM indisponível.');const result=await response.json();
 if(typeof result.access_token!=='string'||!Number.isFinite(result.expires_in)||result.expires_in<=0)throw Error('Autorização FCM inválida.');
 authorization={credential:env.FCM_SERVICE_ACCOUNT,token:result.access_token,expires:now+Math.min(3600,result.expires_in)*1000};return result.access_token;
}
export async function sendNativePush(env,device,payload,{fetcher=fetch,now=Date.now()}={}){
 if(!nativePushConfigured(env,device.platform))throw Error('Provedor nativo não configurado.');
 if(!/^\/#\/(vida\/(agenda|tarefas)|arquivos\/(documentos|contratos|garantias)|momentos\/(morning|afternoon|night))$/.test(payload.url)||!/^[a-f0-9]{64}$/.test(payload.tag))throw Error('Destino do aviso inválido.');
 const title='Mentra Life',body='Você tem um lembrete na sua conta.';
 if(device.platform==='android'){
  const account=firebaseAccount(env),token=await firebaseAuthorization(env,fetcher,now);
  const response=await fetcher(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({message:{token:device.token,notification:{title,body},data:{url:payload.url,tag:payload.tag},android:{ttl:'300s',collapse_key:payload.tag,notification:{channel_id:'mentra-reminders',tag:payload.tag}}}}),redirect:'error',signal:AbortSignal.timeout(15000)});
  let unregistered=false;if(response.status===404){try{const error=await response.clone().json();unregistered=error.error?.details?.some(detail=>detail.errorCode==='UNREGISTERED')===true;}catch{}}
  if(response.status===401)authorization=null;
  return {response,unregistered};
 }
 const credential=[env.APNS_KEY_ID,env.APNS_TEAM_ID,env.APNS_PRIVATE_KEY].join(':');
 if(appleAuthorization?.credential!==credential||appleAuthorization.expires<=now)appleAuthorization={credential,expires:now+45*60000,token:await jwt({alg:'ES256',kid:env.APNS_KEY_ID},{iss:env.APNS_TEAM_ID,iat:Math.floor(now/1000)},env.APNS_PRIVATE_KEY,{name:'ECDSA',namedCurve:'P-256'})};
 const bearer=appleAuthorization.token;
 const host=env.APNS_ENVIRONMENT==='sandbox'?'api.sandbox.push.apple.com':'api.push.apple.com';
 const response=await fetcher(`https://${host}/3/device/${device.token}`,{method:'POST',headers:{authorization:'bearer '+bearer,'apns-topic':env.APNS_TOPIC,'apns-push-type':'alert','apns-priority':'10','apns-expiration':String(Math.floor(now/1000)+300),'apns-collapse-id':payload.tag,'Content-Type':'application/json'},body:JSON.stringify({aps:{alert:{title,body}},url:payload.url,tag:payload.tag}),redirect:'error',signal:AbortSignal.timeout(15000)});
 let unregistered=response.status===410;
 if(response.status===400){try{unregistered=['BadDeviceToken','DeviceTokenNotForTopic'].includes((await response.clone().json()).reason);}catch{}}
 return {response,unregistered};
}
