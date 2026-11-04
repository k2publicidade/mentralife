import {webcrypto} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const output=resolve(process.argv[2]||'.dev.vars.push');if(!/^\.dev\.vars(?:[.-].*)?$/.test(output.split(/[\\/]/).at(-1)))throw Error('Use um arquivo .dev.vars para manter as chaves fora do pacote.');
const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=Buffer.from(await webcrypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),privateKey=(await webcrypto.subtle.exportKey('jwk',pair.privateKey)).d;
writeFileSync(output,['VAPID_PUBLIC_KEY='+publicKey,'VAPID_PRIVATE_KEY='+privateKey,''].join(String.fromCharCode(10)),{flag:'wx',mode:0o600});console.log('Chaves VAPID geradas em arquivo privado .dev.vars. A chave privada não foi exibida. Configure VAPID_SUBJECT com o contato real do operador.');
