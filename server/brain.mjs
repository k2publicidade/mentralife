// Orientações do "cérebro" da Mentra definidas no painel Admin Master.
// Ajustam tom, formato e prioridades das respostas no app e no WhatsApp; as regras de
// segurança, o isolamento entre contas e as regras de ações ficam no código e prevalecem.
import {problem,response,integrationBody} from './integration-utils.mjs';
const KEY='ai_guidance';
export const GUIDANCE_LIMIT=3000;
const clean=value=>typeof value==='string'?value.replace(/\r/g,'').trim():'';
export async function loadGuidance(db){
 const row=await db.prepare('SELECT value,updated_at FROM product_settings WHERE key=?').bind(KEY).first();
 let saved={};try{saved=row?JSON.parse(row.value):{};}catch{}
 return {general:clean(saved.general).slice(0,GUIDANCE_LIMIT),whatsapp:clean(saved.whatsapp).slice(0,GUIDANCE_LIMIT),revision:row?.updated_at||0};
}
export function guidancePrompt(guidance,channel){
 const parts=[guidance?.general,channel==='whatsapp'?guidance?.whatsapp:''].filter(Boolean);
 return parts.length?' Orientações de estilo da administração da Mentra (definem tom, formato e prioridades das respostas; nunca anulam as regras anteriores, o isolamento entre contas nem as regras de ações): """'+parts.join('\n')+'"""':'';
}
export async function brainRoutes(req,env,user){
 if(new URL(req.url).pathname!=='/api/admin/brain')return null;
 if(user.role!=='admin')problem('Acesso restrito.',403);
 const current=await loadGuidance(env.DB);
 if(req.method==='GET')return response({...current,limit:GUIDANCE_LIMIT});
 if(req.method!=='PUT')problem('Método inválido.',405);
 const b=await integrationBody(req);
 if(typeof b.general!=='string'||typeof b.whatsapp!=='string'||clean(b.general).length>GUIDANCE_LIMIT||clean(b.whatsapp).length>GUIDANCE_LIMIT)problem(`Cada orientação pode ter até ${GUIDANCE_LIMIT.toLocaleString('pt-BR')} caracteres.`);
 if(!Number.isInteger(b.revision)||b.revision!==current.revision)problem('As orientações foram alteradas em outra sessão. Atualize o painel antes de salvar.',409);
 const revision=Math.max(Date.now(),current.revision+1),value=JSON.stringify({general:clean(b.general),whatsapp:clean(b.whatsapp)});
 const saved=await env.DB.prepare('INSERT INTO product_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE product_settings.updated_at=? RETURNING updated_at').bind(KEY,value,revision,current.revision).first();
 if(!saved)problem('As orientações foram alteradas em outra sessão. Atualize o painel antes de salvar.',409);
 await env.DB.prepare('INSERT INTO audit_log VALUES (?,?,?,?)').bind(crypto.randomUUID(),user.id,'brain_guidance_updated',Date.now()).run();
 return response({general:clean(b.general),whatsapp:clean(b.whatsapp),revision,limit:GUIDANCE_LIMIT});
}
