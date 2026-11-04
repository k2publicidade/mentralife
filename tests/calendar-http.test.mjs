import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.MENTRA_TEST_URL;
test('retorno OAuth público tem headers privados e não revela autorização sem sessão',{skip:!base},async()=>{
 const page=await fetch(base+'/calendar-callback?code=synthetic-not-real&state=synthetic-not-real');assert.equal(page.status,200);assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.match(page.headers.get('cache-control'),/no-store/);assert.match(await page.text(),/calendar-callback.mjs/);
 const complete=await fetch(base+'/api/calendar/complete',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({code:'synthetic',state:'a'.repeat(64)})});assert.equal(complete.status,401);assert.equal(complete.headers.get('referrer-policy'),'no-referrer');
});
