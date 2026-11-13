import {api} from './platform.mjs';
export const audioAccept='audio/wav,audio/ogg,audio/webm,audio/mpeg,audio/mp4,audio/aac,.m4a';
export async function recordVoice({mediaDevices=navigator.mediaDevices,Recorder=globalThis.MediaRecorder,onStop=()=>{},onError=()=>{}}={}){
 if(!mediaDevices?.getUserMedia||!Recorder)throw Error('Gravação indisponível. Envie um arquivo de áudio.');
 const stream=await mediaDevices.getUserMedia({audio:true});let recorder,timer,done=false,size=0;const chunks=[];
 const close=()=>{clearTimeout(timer);for(const track of stream.getTracks())track.stop();};
 try{
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>Recorder.isTypeSupported(t));
  if(!mime)throw Error('Formato de gravação indisponível. Envie um arquivo de áudio.');
  recorder=new Recorder(stream,{mimeType:mime});
  recorder.ondataavailable=event=>{if(done)return;size+=event.data.size;if(size>2*1024*1024){done=true;close();recorder.stop();onError(Error('Áudio excedeu 2 MB. Grave uma mensagem mais curta.'));return;}if(event.data.size)chunks.push(event.data);};
  recorder.onerror=()=>{if(done)return;done=true;close();onError(Error('Não foi possível gravar. Envie um arquivo de áudio.'));};
  recorder.onstop=()=>{close();if(done)return;done=true;const blob=new Blob(chunks,{type:mime});if(!blob.size){onError(Error('Nenhum áudio foi gravado.'));return;}onStop(blob);};
  recorder.start(1000);timer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},120000);
  return {stop(){if(recorder.state!=='inactive')recorder.stop();},cancel(){done=true;close();if(recorder.state!=='inactive')recorder.stop();}};
 }catch(error){close();throw error;}
}
export async function audioMessage(file,{transcribe=api,signal}={}){
 if(!file?.size||file.size>2*1024*1024)throw Error('Envie um áudio de até 2 MB.');
 const mime=file.type||({wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',webm:'audio/webm',aac:'audio/aac'}[file.name?.split('.').pop().toLowerCase()]||'application/octet-stream');
 const result=await transcribe('audio/transcribe',{method:'POST',headers:{'Content-Type':mime},body:file,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(75000)]):AbortSignal.timeout(75000)});
 if(typeof result.text!=='string'||!result.text.trim()||result.text.length>4000||! /^[a-f0-9]{64}$/.test(result.audioHash))throw Error('Transcrição inválida ou longa demais. Envie um áudio mais curto.');
 return {text:result.text.trim(),requestId:'audio_'+result.audioHash};
}
