import test from 'node:test';
import assert from 'node:assert/strict';
import {readUpload,uploadFilename} from '../dist/uploads.mjs';
test('upload preserva bytes, valida tipo, extensão e limite',async()=>{
 const pdf=new File(['%PDF-1.4\nexample'],'recibo.pdf',{type:'application/pdf'}),result=await readUpload(pdf);
 assert.equal(atob(result.fileData),'%PDF-1.4\nexample');assert.equal(result.ext,'PDF');assert.equal(result.sha256.length,64);
 await assert.rejects(readUpload(new File(['<html>bad</html>'],'bad.pdf')),/PDF, PNG ou JPEG/);
 await assert.rejects(readUpload(new File(['%PDF-1.4'],'bad.exe')),/PDF, PNG ou JPEG/);
 await assert.rejects(readUpload(new File([new Uint8Array(512001)],'big.pdf')),/500 KB/);
 assert.equal(await readUpload(null),null);
});
test('download preserva nome original, evita extensão duplicada e neutraliza caracteres de caminho',()=>{
 assert.equal(uploadFilename({originalName:'scan-004.png',title:'Meu contrato',ext:'PNG'}),'scan-004.png');assert.equal(uploadFilename({title:'recibo.pdf',ext:'PDF'}),'recibo.pdf');assert.equal(uploadFilename({title:'Relatório',ext:'PDF'}),'Relatório.pdf');assert.equal(uploadFilename({originalName:'../arquivo:privado.png',ext:'PNG'}),'.._arquivo_privado.png');
 assert.equal(uploadFilename({originalName:'foto.jpeg',ext:'JPG'}),'foto.jpeg');
});
