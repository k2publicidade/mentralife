import {saveFile} from './file-save.mjs';
export async function readUpload(file){
 if(!file||!file.size)return null;
 if(file.size>500*1024)throw Error('Escolha um arquivo de até 500 KB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const pdf=String.fromCharCode(...bytes.slice(0,5))==='%PDF-',png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10,jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const ext=pdf?'PDF':png?'PNG':jpeg?'JPG':null;if(!ext||!(pdf?/\.pdf$/i:png?/\.png$/i:/\.jpe?g$/i).test(file.name))throw Error('Envie um PDF, PNG ou JPEG com extensão correspondente ao conteúdo.');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {fileData:btoa(binary),fileSize:file.size,mime:pdf?'application/pdf':png?'image/png':'image/jpeg',ext,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')};
}
export function uploadFilename(doc){const ext=String(doc.ext||'bin').toLowerCase(),name=String(doc.originalName||doc.title||'documento').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,230);return (ext==='jpg'?/\.jpe?g$/i.test(name):name.toLowerCase().endsWith('.'+ext))?name:name+'.'+ext;}
export function downloadUpload(doc){const encoded=doc?.fileData||doc?.pdfData;if(!encoded)return;const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));return saveFile(uploadFilename(doc),bytes,doc.mime||'application/octet-stream').catch(()=>{globalThis.alert?.('Não foi possível salvar ou compartilhar o arquivo. Tente novamente.');});}
