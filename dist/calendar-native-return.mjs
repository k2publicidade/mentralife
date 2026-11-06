export const nativeCalendarState=/^native\.[a-f0-9]{64}$/;
export function calendarReturnLink(params){
 const state=params.get('state');if(!nativeCalendarState.test(state||''))return null;
 const target=new URL('mentralife://calendar/complete');target.searchParams.set('state',state);
 if(params.has('error'))target.searchParams.set('error','denied');
 else{const code=params.get('code');if(!code||code.length>4096)throw Error('Retorno de autorização incompleto. Inicie a conexão novamente no app.');target.searchParams.set('code',code);}
 return target.href;
}
