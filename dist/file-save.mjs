export async function saveFile(filename,data,type='application/octet-stream'){
 const blob=data instanceof Blob?data:new Blob([data],{type});
 if(globalThis.mentraNativeShare){await globalThis.mentraNativeShare(blob,filename);return;}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
