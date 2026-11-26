// Consentimentos (LGPD), "apagar meus dados" e exclusão da conta com retenção legal dos pagamentos.
import {LEGAL} from '../dist/legal.mjs';

const COLUMN={terms:'terms_version',ai:'ai_consent_at',health:'health_consent_at'};

/** Registra o aceite dos Termos ou a concessão/revogação de um consentimento, com prova em consent_log. */
export async function recordConsent(db,userId,kind,granted){
 if(!COLUMN[kind])throw Error('unknown consent');
 const now=Date.now(),version=kind==='terms'?LEGAL.termsVersion:LEGAL.privacyVersion;
 const update=kind==='terms'
  ?db.prepare('UPDATE users SET terms_version=?,terms_accepted_at=? WHERE id=?').bind(LEGAL.termsVersion,now,userId)
  :db.prepare(`UPDATE users SET ${COLUMN[kind]}=? WHERE id=?`).bind(granted?now:null,userId);
 await db.batch([update,db.prepare('INSERT INTO consent_log(id,user_id,kind,granted,version,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,kind,granted?1:0,version,now)]);
}

/**
 * Apaga todo o conteúdo e as integrações, mantendo conta, login, plano, pagamentos, cota de IA,
 * consentimentos e registros de segurança. Outras sessões são encerradas para que nenhum aparelho
 * reenvie a cópia antiga sem revisão.
 */
export async function eraseAccountData(db,userId,currentSessionHash=null){
 const byUser=['user_state_chunks','user_states','integration_inbox','audio_requests','reminder_jobs','reminder_settings','ai_requests','feedback','push_subscriptions','native_push_devices','calendar_connections','calendar_oauth','whatsapp_links','whatsapp_link_codes'];
 await db.batch([
  ...byUser.map(table=>db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(userId)),
  db.prepare('DELETE FROM document_shares WHERE owner_id=?').bind(userId),
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash IS NOT ?').bind(userId,currentSessionHash)
 ]);
}

// Fim do 5º ano seguinte ao pagamento (1º de janeiro do ano + 6), em milissegundos.
const deleteAfter=column=>`(CAST(strftime('%s',(CAST(strftime('%Y',${column}/1000,'unixepoch') AS INTEGER)+${LEGAL.paymentRetentionYears+1})||'-01-01') AS INTEGER)*1000)`;

/**
 * Exclui a conta. Pagamentos não impedem a exclusão: os registros são copiados para retained_payments
 * (só nome, e-mail e dados do pagamento) e apagados da conta. Todas as instruções carregam a mesma
 * condição, então um PIX em aberto impede o lote inteiro e nada fica pela metade.
 * Retorna false quando há PIX em aberto.
 */
export async function deleteAccount(db,user,{waitOpenPix=true}={}){
 const now=Date.now();
 const guard=waitOpenPix?`AND NOT EXISTS(SELECT 1 FROM six7pay_orders WHERE user_id=?1 AND status IN ('creating','pending','unknown'))`:'';
 const results=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO retained_payments(id,former_user_id,name,email,source,record,occurred_at,retained_at,delete_after)
   SELECT 'six7pay_order:'||o.id,o.user_id,u.name,u.email,'six7pay_order',
    json_object('order',o.id,'plan',o.plan,'amount',o.amount,'days',o.days,'promotional',o.promotional,'status',o.status,'created_at',o.created_at,'paid_at',o.paid_at,'refunded_at',o.refunded_at,'refund_amount',o.refund_amount,'transaction_id',o.transaction_id,'terms_version',o.terms_version),
    COALESCE(o.paid_at,o.created_at),?2,${deleteAfter('COALESCE(o.paid_at,o.created_at)')}
   FROM six7pay_orders o JOIN users u ON u.id=o.user_id
   WHERE o.user_id=?1 AND (o.paid_at IS NOT NULL OR o.status IN ('paid','refunded')) ${guard}`).bind(user.id,now),
  db.prepare(`INSERT OR IGNORE INTO retained_payments(id,former_user_id,name,email,source,record,occurred_at,retained_at,delete_after)
   SELECT 'payment_event:'||e.event_id,e.user_id,u.name,u.email,'payment_event',
    json_object('event_id',e.event_id,'payload',json(e.payload),'created_at',e.created_at),
    e.created_at,?2,${deleteAfter('e.created_at')}
   FROM payment_events e JOIN users u ON u.id=e.user_id WHERE e.user_id=?1 ${guard}`).bind(user.id,now),
  db.prepare(`DELETE FROM payment_events WHERE user_id=?1 ${guard}`).bind(user.id),
  db.prepare(`DELETE FROM users WHERE id=?1 ${guard}`).bind(user.id)
 ]);
 return Boolean(results.at(-1).meta.changes);
}
