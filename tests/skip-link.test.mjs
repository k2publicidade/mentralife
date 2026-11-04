import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSkipLink} from '../dist/skip-link.mjs';

test('skip link moves focus and scroll without overwriting a route or private token',()=>{
 for(const hash of ['#/planos','#'+'a'.repeat(64)]){
  let click,currentHash=hash,focused=false,scrolled=false;
  const link={addEventListener(name,callback){assert.equal(name,'click');click=callback;}};
  const target={focus(options){assert.equal(options.preventScroll,true);focused=true;},scrollIntoView(options){assert.equal(options.block,'start');scrolled=true;}};
  assert.equal(bindSkipLink(link,target),true);
  let prevented=false;click({preventDefault(){prevented=true;}});
  if(!prevented)currentHash='#main-content';
  assert.equal(currentHash,hash);assert.ok(focused&&scrolled);
 }
});

test('skip link leaves the fallback link usable when the landmark is absent',()=>{
 assert.equal(bindSkipLink(null,{}),false);
 assert.equal(bindSkipLink({addEventListener(){assert.fail('no listener without a target');}},null),false);
});

test('skip link resolves the current landmark after a route replacement',()=>{
 let click,current=null,focusCount=0;
 bindSkipLink({addEventListener(name,callback){click=callback;}},()=>current);
 let prevented=false;click({preventDefault(){prevented=true;}});
 assert.equal(prevented,true,'loading the landmark must not overwrite the URL');
 current={focus(){focusCount++;},scrollIntoView(){}};
 click({preventDefault(){}});
 current={focus(){focusCount+=10;},scrollIntoView(){}};
 click({preventDefault(){}});
 assert.equal(focusCount,11);
});
