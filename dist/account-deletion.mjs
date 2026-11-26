// Exclusão de conta fora do app (Google Play: recurso web para pedir a exclusão).
const form=document.querySelector('#deletion-form'),result=document.querySelector('#deletion-result');
// Dentro do app (Capacitor, origem localhost) a API fica em outro endereço: a exclusão é feita em Meu espaço.
if(form&&(location.protocol==='capacitor:'||(location.hostname==='localhost'&&!location.port))){form.hidden=true;form.insertAdjacentHTML('afterend','<p>No aplicativo, use Meu espaço → Excluir minha conta. Fora do app, abra esta página no site da Mentra.</p>');}
async function call(path,method,body){
 const response=await fetch('/api/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Não foi possível concluir agora. Tente novamente.');
 return data;
}
form?.addEventListener('submit',async event=>{
 event.preventDefault();
 const data=Object.fromEntries(new FormData(form));
 if(!form.reportValidity())return;
 const button=form.querySelector('button');button.disabled=true;result.textContent='Excluindo…';
 let signedIn=false;
 try{
  await call('login','POST',{email:data.email,password:data.password});signedIn=true;
  await call('account','DELETE',{password:data.password,confirmed:true});signedIn=false;
  form.reset();result.textContent='Conta excluída. Os dados foram apagados e as sessões encerradas.';
 }catch(error){
  result.textContent=error.message;
  if(signedIn)await call('logout','POST').catch(()=>{});
 }finally{button.disabled=false;}
});
