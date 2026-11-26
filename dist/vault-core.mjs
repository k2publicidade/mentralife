// Cofre de senhas: tudo é cifrado neste aparelho antes de salvar.
// O servidor, a sincronização, os backups e a Mentra IA só recebem texto cifrado.
// Chave: PBKDF2-SHA256 (600 mil iterações) a partir da senha mestra → AES-GCM 256.
// Sem a senha mestra não há como recuperar o conteúdo — nem a equipe Mentra consegue.
export const VAULT_VERSION=1;
export const KDF_ITERATIONS=600000;
export const MIN_MASTER_LENGTH=10;
const VERIFIER_TEXT='mentra-vault-ok';
const LIMITS={title:120,username:200,password:500,url:500,note:2000};
const enc=new TextEncoder(),dec=new TextDecoder();
const subtle=()=>{const s=globalThis.crypto?.subtle;if(!s)throw Error('Este navegador não oferece criptografia segura. Atualize-o para usar o cofre.');return s;};
export const toB64=bytes=>{let s='';const b=new Uint8Array(bytes);for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(s);};
export const fromB64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const random=n=>globalThis.crypto.getRandomValues(new Uint8Array(n));

export function isVault(v){return Boolean(v&&typeof v==='object'&&v.version===VAULT_VERSION&&typeof v.salt==='string'&&Number.isInteger(v.iterations)&&v.verifier&&typeof v.verifier.iv==='string'&&typeof v.verifier.ct==='string'&&Array.isArray(v.items));}

export async function deriveKey(master,salt,iterations=KDF_ITERATIONS){
 const base=await subtle().importKey('raw',enc.encode(master),'PBKDF2',false,['deriveKey']);
 return subtle().deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(key,text){const iv=random(12);const ct=await subtle().encrypt({name:'AES-GCM',iv},key,enc.encode(text));return {iv:toB64(iv),ct:toB64(ct)};}
async function open(key,box){return dec.decode(await subtle().decrypt({name:'AES-GCM',iv:fromB64(box.iv)},key,fromB64(box.ct)));}

export function checkMaster(master,confirm){
 if(typeof master!=='string'||master.length<MIN_MASTER_LENGTH)throw Error(`A senha mestra precisa ter pelo menos ${MIN_MASTER_LENGTH} caracteres.`);
 if(master.length>200)throw Error('A senha mestra pode ter até 200 caracteres.');
 if(confirm!==undefined&&master!==confirm)throw Error('As duas senhas mestras não são iguais.');
}

/** Cria um cofre vazio. Devolve {vault,key}. */
export async function createVault(master,{iterations=KDF_ITERATIONS}={}){
 checkMaster(master);const salt=random(16),key=await deriveKey(master,salt,iterations);
 return {vault:{version:VAULT_VERSION,salt:toB64(salt),iterations,verifier:await seal(key,VERIFIER_TEXT),items:[],createdAt:new Date().toISOString()},key};
}

/** Abre o cofre. Lança erro se a senha mestra estiver errada. */
export async function unlockVault(vault,master){
 if(!isVault(vault))throw Error('Cofre não encontrado.');
 const key=await deriveKey(String(master||''),fromB64(vault.salt),vault.iterations);
 let ok=false;try{ok=await open(key,vault.verifier)===VERIFIER_TEXT;}catch{ok=false;}
 if(!ok)throw Error('Senha mestra incorreta.');
 return key;
}

export function validateEntry(raw){
 const out={};for(const [k,max] of Object.entries(LIMITS)){const v=typeof raw?.[k]==='string'?(k==='password'?raw[k]:raw[k].trim()):'';if(v.length>max)throw Error(`O campo ${k==='title'?'nome':k==='username'?'usuário':k==='password'?'senha':k==='url'?'site':'anotação'} pode ter até ${max} caracteres.`);out[k]=v;}
 if(!out.title)throw Error('Dê um nome para identificar esta senha (ex.: Banco, E-mail).');
 if(!out.password)throw Error('Informe a senha que deseja guardar.');
 return out;
}

export async function encryptEntry(key,raw,{id,createdAt}={}){
 const entry=validateEntry(raw),now=new Date().toISOString();
 return {id,...await seal(key,JSON.stringify(entry)),createdAt:createdAt||now,updatedAt:now};
}
export async function decryptEntry(key,item){const data=JSON.parse(await open(key,item));return validateEntry(data);}

/** Troca a senha mestra, recifrando todos os itens. */
export async function changeMaster(vault,oldKey,newMaster,{iterations=KDF_ITERATIONS}={}){
 checkMaster(newMaster);const {vault:fresh,key}=await createVault(newMaster,{iterations});
 const items=[];for(const item of vault.items){const data=await decryptEntry(oldKey,item);items.push({...await encryptEntry(key,data,{id:item.id,createdAt:item.createdAt}),updatedAt:item.updatedAt});}
 return {vault:{...fresh,createdAt:vault.createdAt||fresh.createdAt,items},key};
}

const SETS=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghijkmnopqrstuvwxyz','23456789','!@#$%&*?-_=+'];
/** Gera uma senha forte sem viés de módulo, com ao menos um caractere de cada grupo. */
export function generatePassword(length=20){
 const below=n=>{const limit=256-256%n;for(;;){const [b]=random(1);if(b<limit)return b%n;}};
 const all=SETS.join(''),pick=set=>set[below(set.length)];
 const chars=SETS.map(pick);while(chars.length<length)chars.push(pick(all));
 for(let i=chars.length-1;i>0;i--){const j=below(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
 return chars.join('');
}

export function passwordStrength(pw){
 if(!pw)return {score:0,label:''};let score=0;if(pw.length>=12)score++;if(pw.length>=16)score++;const groups=[/[a-z]/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/].filter(r=>r.test(pw)).length;if(groups>=3)score++;if(groups===4&&pw.length>=12)score++;
 return {score,label:['Fraca','Fraca','Razoável','Boa','Forte'][score]};
}
