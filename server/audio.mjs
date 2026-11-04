import {activeAccount,digest,limitedBytes,problem,response} from './integration-utils.mjs';
export const AUDIO_LIMIT=2*1024*1024;
let activeTranscriptions=0;
export function audioFormat(bytes,mime){let type=String(mime).split(';')[0].trim().toLowerCase();type=({'audio/x-m4a':'audio/mp4','audio/mp3':'audio/mpeg','audio/wave':'audio/wav','audio/vnd.wave':'audio/wav'})[type]||type;const ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));const signatures={'audio/wav':ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE','audio/x-wav':ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE','audio/ogg':ascii(0,4)==='OggS','audio/webm':bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3,'audio/mpeg':ascii(0,3)==='ID3'||bytes[0]===255&&(bytes[1]&0xe0)===0xe0,'audio/mp4':ascii(4,8)==='ftyp','audio/aac':bytes[0]===255&&(bytes[1]&0xf6)===0xf0};if(!signatures[type]||!bytes.length||bytes.length>AUDIO_LIMIT)problem('Envie WAV, OGG, WebM, MP3, M4A ou AAC válidos, com até 2 MB.');return type;}
export async function transcribeAudio(env,userId,bytes,mime,{timeoutMs=60000}={}){
 audioFormat(bytes,mime);
 if(!env.AI)problem('A transcrição aguarda ativação do Workers AI na Cloudflare.',503);
 if(!await activeAccount(env.DB,userId))problem('Ative sua assinatura para transcrever áudio.',403);
 const hash=await digest(bytes),now=Date.now(),old=await env.DB.prepare('SELECT * FROM audio_requests WHERE user_id=? AND audio_hash=?').bind(userId,hash).first();
 if(old?.status==='ready')return {text:old.text,audioHash:hash,reused:true};
 if(old?.lease_until>now)problem('Este áudio já está sendo transcrito. Aguarde e tente consultar novamente.',409);
 if(old?.attempts>=3)problem('Este áudio atingiu o limite de tentativas. Use um arquivo menor ou informe o texto.',429);
 if(activeTranscriptions>=2)problem('A transcrição está ocupada. Aguarde e tente este mesmo áudio novamente.',429);
 activeTranscriptions++;
 let held=true,inference=null,claim=null,timer;
 const release=()=>{if(held){held=false;activeTranscriptions--;}};
 try{
  const token=crypto.randomUUID(),lease=now+120000;
  claim=await env.DB.prepare("INSERT INTO audio_requests(user_id,audio_hash,status,text,attempts,lease_until,created_at,claim_token) VALUES(?,?,'processing',NULL,1,?,?,?) ON CONFLICT(user_id,audio_hash) DO UPDATE SET status='processing',attempts=attempts+1,lease_until=excluded.lease_until,claim_token=excluded.claim_token WHERE audio_requests.lease_until<=? AND audio_requests.status!='ready' AND audio_requests.attempts<3 RETURNING claim_token,attempts").bind(userId,hash,lease,now,token,now).first();
  if(!claim)problem('Este áudio está em processamento. Tente novamente em instantes.',409);
  const day=new Date(now).toISOString().slice(0,10);
  try{await env.DB.prepare('INSERT INTO audio_daily_claims(user_id,audio_hash,day) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM audio_daily_claims WHERE user_id=? AND audio_hash=? AND day=?)').bind(userId,hash,day,userId,hash,day).run();}
  catch(error){if(String(error.message).includes('audio_daily_limit')){
   await env.DB.prepare("UPDATE audio_requests SET status='failed',attempts=attempts-1,lease_until=0,claim_token=NULL WHERE user_id=? AND audio_hash=? AND claim_token=?").bind(userId,hash,token).run();claim=null;
   problem('Limite de 20 áudios distintos por dia UTC atingido. Tente novamente no próximo dia UTC.',429);
  }throw error;}
  inference=Promise.resolve().then(()=>env.AI.run('@cf/openai/whisper',{audio:Array.from(bytes)}));
  // A timed-out binding may still be running; keep its capacity slot until it settles.
  inference.then(release,release);
  const result=await Promise.race([inference,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('audio_timeout')),timeoutMs);})]);
  if(typeof result?.text!=='string'||!result.text.trim()||result.text.length>20000)throw Error('invalid_audio_result');
  if(!await activeAccount(env.DB,userId))problem('A assinatura deixou de estar ativa durante a transcrição.',403);
  const text=result.text.trim(),saved=await env.DB.prepare("UPDATE audio_requests SET status='ready',text=?,lease_until=0,claim_token=NULL WHERE user_id=? AND audio_hash=? AND claim_token=? AND status='processing' AND lease_until>? RETURNING audio_hash").bind(text,userId,hash,token,Date.now()).first();
  if(!saved)problem('O processamento mudou. Atualize e consulte o áudio novamente.',409);
  return {text,audioHash:hash,reused:false};
 }catch(error){
  if(claim)await env.DB.prepare("UPDATE audio_requests SET status='failed',lease_until=?,claim_token=NULL WHERE user_id=? AND audio_hash=? AND claim_token=?").bind(held&&inference?now+120000:0,userId,hash,claim.claim_token).run();
  if(error.status)throw error;
  problem('Não foi possível transcrever. O áudio não foi guardado; revise ou tente novamente.',502);
 }finally{clearTimeout(timer);if(!inference)release();}
}
export async function audioRoute(req,env,user){if(new URL(req.url).pathname!=='/api/audio/transcribe')return null;if(req.method!=='POST')problem('Método inválido.',405);const bytes=await limitedBytes(req,AUDIO_LIMIT);return response({...await transcribeAudio(env,user.id,bytes,req.headers.get('content-type')),needsReview:true});}
