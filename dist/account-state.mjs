import {initialState} from './core.mjs';
import {migrateFinanceState} from './finance.mjs';
const emptyHealth=()=>({version:1,appointments:[],medications:[],logs:[],activities:[],meals:[],groceryChecked:[],professional:{nutrition:'',movement:''}});
export function accountState(saved,user){
 const state=saved?structuredClone(saved):initialState();
 const required=['tasks','events','records','documents','inbox','messages'];
 if(!saved){for(const key of required)state[key]=[];state.profile={name:user.name,goal:'',reminders:false};}
 if(!state.profile||typeof state.profile!=='object'||Array.isArray(state.profile)||required.some(key=>!Array.isArray(state[key])))throw Error('Os dados desta conta precisam de revisão. Eles foram preservados no servidor.');
 for(const key of ['accounts','obligations','budgets','recurrences','journeys']){
  if(!Object.hasOwn(state,key))state[key]=[];
  else if(!Array.isArray(state[key]))throw Error('Uma coleção da conta precisa de revisão. Os dados foram preservados no servidor.');
 }
 if(!Object.hasOwn(state,'health'))state.health=emptyHealth();
 if(!saved)state.plan=null;
 return migrateFinanceState(state);
}
