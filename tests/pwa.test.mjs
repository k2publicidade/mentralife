import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('manifest instalado usa destino interno e ícone PNG com dimensões reais suficientes',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../dist/manifest.webmanifest',import.meta.url),'utf8'));
 const page=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.match(page,/<link rel="manifest" href="\/manifest.webmanifest">/);
 assert.equal(new URL(manifest.start_url,'https://mentra.test').origin,'https://mentra.test');
 assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){const bytes=readFileSync(new URL('../dist'+icon.src,import.meta.url)),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(width,height);assert.ok(width>=512);assert.equal(icon.sizes,`${width}x${height}`);}
});
