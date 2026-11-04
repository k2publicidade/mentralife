// Keep the route or private access token in the fragment while moving keyboard focus.
export function bindSkipLink(link,target){
 if(!link||!target)return false;
 link.addEventListener('click',event=>{
  event.preventDefault();
  const current=typeof target==='function'?target():target;
  if(!current)return;
  current.focus({preventScroll:true});
  current.scrollIntoView({block:'start',behavior:'instant'});
 });
 return true;
}
if(typeof document!=='undefined'){
 const link=document.querySelector('.skip-link');
 // The application replaces its main landmark on each route change.
 bindSkipLink(link,()=>document.getElementById(link.getAttribute('href')?.slice(1)));
}
