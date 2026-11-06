import {send} from './platform.mjs';
import {calendarReturnLink} from './calendar-native-return.mjs';
const params=new URLSearchParams(location.search),code=params.get('code'),state=params.get('state'),denied=params.has('error');
history.replaceState(null,'','/calendar-callback');
const result=document.querySelector('#calendar-result');
try{
 const nativeReturn=calendarReturnLink(params);
 if(nativeReturn){result.textContent='Volte ao aplicativo para concluir a conexão do calendário.';const link=document.createElement('a');link.href=nativeReturn;link.className='primary';link.textContent='Voltar ao app Mentra';result.after(link);}
 else{if(denied)throw Error('Autorização cancelada. Sua agenda não foi importada.');if(!code||!state)throw Error('Retorno incompleto. Inicie a conexão pela sua agenda.');await send('calendar/complete',{code,state});result.textContent='Calendário conectado. Volte à agenda para consultar e revisar os compromissos antes de importar.';}
}catch(e){result.textContent=e.message;}
