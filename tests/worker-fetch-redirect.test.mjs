import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// Cloudflare Workers throw "Invalid redirect value" for redirect:'error', so a fetch with it
// fails on every call in production (only follow/manual exist at the edge). Code that must not
// follow redirects uses 'manual' and treats the 3xx answer as a failure.
test('Worker: nenhum fetch usa redirect "error", que o Cloudflare Workers recusa',()=>{
 const dir=new URL('../server/',import.meta.url);
 const offenders=readdirSync(dir).filter(name=>name.endsWith('.mjs'))
  .filter(name=>/redirect\s*:\s*['"`]error['"`]/.test(readFileSync(new URL(name,dir),'utf8').replace(/\/\/.*$/gm,'')));
 assert.deepEqual(offenders,[]);
});
