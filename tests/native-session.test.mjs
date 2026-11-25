import test from 'node:test';
import assert from 'node:assert/strict';
import {api,accountMarkup} from '../dist/platform.mjs';

test('sessão administrativa nativa usa a mesma API, mantém identidade e revoga avisos ao sair',async t=>{
 const keys=['mentraNative','mentraNativeApi','mentraNativePush','mentraNativeCalendar','mentraNativeUserId','mentraPlatform'],previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
 t.after(()=>{for(const key of keys)if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];});
 const calls=[];globalThis.mentraNative=true;globalThis.mentraNativePush={unsubscribe:async()=>calls.push('unsubscribe')};globalThis.mentraNativeCalendar={cancel:()=>calls.push('cancel')};
 globalThis.mentraNativeApi=async path=>{calls.push(path);return {ok:true,json:async()=>path==='me'?{user:{id:'native-admin',role:'admin'}}:{ok:true}};};
 await api('me');assert.equal(globalThis.mentraNativeUserId,'native-admin');globalThis.mentraPlatform={user:{id:'native-admin'}};
 await api('logout',{method:'POST'});assert.deepEqual(calls,['me','cancel','unsubscribe','logout']);assert.equal(globalThis.mentraNativeUserId,null);assert.equal(globalThis.mentraPlatform,null);
 const html=accountMarkup({user:{name:'Admin',email:'synthetic@example.test',role:'admin'},subscription:{status:'pending'}});assert.match(html,/href="\/admin.html"/);
});
