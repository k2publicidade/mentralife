-- Executar SOMENTE na base isolada restaurada, antes de permitir qualquer acesso.
-- Não muda os originais nem os registros de negócio. Invalida credenciais e envios.
INSERT INTO product_settings(key,value,updated_at) VALUES('restore_quarantine','{"locked":true}',CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
DELETE FROM sessions;
DELETE FROM calendar_oauth;
DELETE FROM calendar_connections;
UPDATE document_shares SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000);
DELETE FROM push_deliveries;
DELETE FROM push_subscriptions;
UPDATE reminder_settings SET enabled=0,last_reconciled=0;
UPDATE reminder_jobs SET status='cancelled' WHERE status='pending';
DELETE FROM whatsapp_link_codes;
DELETE FROM whatsapp_links;
UPDATE integration_inbox SET status='discarded',lease_until=0,next_attempt=0,error='Revisar após restauração isolada.',updated_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE status NOT IN ('confirmed','discarded');
UPDATE audio_requests SET status='failed',lease_until=0 WHERE status='processing';
-- Reconciliar exclusões/alterações posteriores ao backup e situação das assinaturas
-- com os registros do incidente ANTES de ligar esta base a um Worker público.
