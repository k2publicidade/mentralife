import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {mergeStates} from '../dist/sync-merge.mjs';
import {checkReadiness} from '../scripts/readiness.mjs';

test('EC-01: auto-merge mescla mensagens simultâneas do App e do WhatsApp (com ou sem campo id)', () => {
  const base = {
    profile: {name: 'Ana'},
    tasks: [],
    messages: [{role: 'user', text: 'Oi', requestId: 'req-base'}, {role: 'assistant', text: 'Olá!', requestId: 'req-base'}]
  };
  const local = {
    ...base,
    messages: [...base.messages, {id: 'req-app:user', role: 'user', text: 'Gastei 30 no café', requestId: 'req-app'}]
  };
  const remote = {
    ...base,
    messages: [
      ...base.messages,
      {role: 'user', text: 'O que tenho hoje?', requestId: 'wa_123', channel: 'whatsapp'},
      {role: 'assistant', text: 'Você não tem compromissos hoje.', requestId: 'wa_123', channel: 'whatsapp'}
    ]
  };
  const merged = mergeStates(base, local, remote);
  assert.equal(merged.ok, true);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.data.messages.length, 5);
  assert.equal(merged.data.messages[2].requestId, 'req-app');
  assert.equal(merged.data.messages[4].channel, 'whatsapp');
});

test('SEC-02 & EC-03: exclusão de conta permite assinatura expirada por prazo e bloqueia ativa vigente', async () => {
  const DB = integrationDB();
  const origin = 'https://mentra.test';
  const env = {DB};
  const call = async (path, {method = 'GET', data, cookie} = {}) => {
    const r = await worker.fetch(new Request(origin + '/api/' + path, {
      method,
      headers: {Origin: origin, 'Content-Type': 'application/json', ...(cookie ? {Cookie: cookie} : {})},
      body: data ? JSON.stringify(data) : undefined
    }), env);
    return {status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0]};
  };
  try {
    const pw = 'synthetic-delete-expired-2026';
    const reg = await call('register', {method: 'POST', data: {name: 'Expirada', email: 'expirada@mentra.test', password: pw, plan: 'plus'}});
    assert.equal(reg.status, 200);
    DB.sql.prepare("UPDATE subscriptions SET status='active', current_period_end=? WHERE user_id=?").run(Date.now() + 86400000, reg.body.user.id);
    assert.equal((await call('account', {method: 'DELETE', cookie: reg.cookie, data: {password: pw}})).status, 409);
    DB.sql.prepare("UPDATE subscriptions SET status='active', current_period_end=? WHERE user_id=?").run(Date.now() - 60000, reg.body.user.id);
    assert.equal((await call('account', {method: 'DELETE', cookie: reg.cookie, data: {password: pw}})).status, 200);
    assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM users WHERE id=?').get(reg.body.user.id).n, 0);
  } finally {
    DB.sql.close();
  }
});

test('SEC-03 & SEC-06.5: x-vercel-forwarded-for prevalece, login limita falhas por e-mail e export oculta capability URL push', async () => {
  const DB = integrationDB();
  const origin = 'https://site.mentra.test', backend = 'https://api.mentra.test', secret = 'c'.repeat(64);
  const env = {DB, PUBLIC_ORIGIN: origin, VERCEL_ORIGIN_SECRET: secret};
  const call = async (path, {method = 'POST', data, cookie, xff = '198.51.100.42, 10.0.0.1', realIp = '203.0.113.99'} = {}) => {
    const r = await worker.fetch(new Request(backend + '/api/' + path, {
      method,
      headers: {
        Origin: origin,
        'x-mentra-origin-secret': secret,
        'x-vercel-forwarded-for': xff,
        'x-real-ip': realIp,
        'Content-Type': 'application/json',
        ...(cookie ? {Cookie: cookie} : {})
      },
      body: data ? JSON.stringify(data) : undefined
    }), env);
    return {status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0]};
  };
  try {
    const pw = 'synthetic-bruteforce-2026';
    const reg = await call('register', {data: {name: 'Alvo', email: 'alvo@mentra.test', password: pw, plan: 'plus'}});
    assert.equal(reg.status, 200);
    assert.ok(DB.sql.prepare("SELECT key FROM rate_limits WHERE key LIKE 'auth:198.51.100.42:%'").get());

    for (let i = 1; i <= 12; i++) {
      const failRes = await call('login', {xff: `198.51.100.${i}`, data: {email: 'alvo@mentra.test', password: 'wrong-password-1234'}});
      assert.equal(failRes.status, 401);
    }
    const throttled = await call('login', {xff: '198.51.100.250', data: {email: 'alvo@mentra.test', password: 'wrong-password-1234'}});
    assert.equal(throttled.status, 429);

    DB.sql.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?,?)')
      .run('sub-1', reg.body.user.id, 'https://fcm.googleapis.com/fcm/send/secret-capability-token-xyz', 'k', 'a', Date.now());
    const exp = await call('account/export', {method: 'GET', cookie: reg.cookie});
    assert.equal(exp.status, 200);
    assert.ok(Array.isArray(exp.body.payments));
    assert.equal(exp.body.integrations.pushDevices[0].endpointOrigin, 'https://fcm.googleapis.com');
    assert.ok(!JSON.stringify(exp.body).includes('secret-capability-token-xyz'));
  } finally {
    DB.sql.close();
  }
});

test('SEC-05 & SEC-03.3: PARAR no gateway descarta integration_inbox e readiness exige par completo Vercel', async () => {
  const DB = integrationDB(), origin = 'https://mentra.test', secret = 'd'.repeat(64);
  const env = {DB, WHATSAPP_GATEWAY_SECRET: secret};
  const call = async (path, {method = 'GET', data, cookie} = {}) => {
    const r = await worker.fetch(new Request(origin + '/api/' + path, {
      method,
      headers: {Origin: origin, 'Content-Type': 'application/json', ...(cookie ? {Cookie: cookie} : {})},
      body: data ? JSON.stringify(data) : undefined
    }), env);
    return {status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0]};
  };
  const gw = async body => {
    const raw = JSON.stringify(body), ts = String(Date.now());
    const sig = 'sha256=' + createHmac('sha256', secret).update(ts + '.' + raw).digest('hex');
    const r = await worker.fetch(new Request(origin + '/api/whatsapp/gateway', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-mentra-timestamp': ts, 'x-mentra-signature': sig},
      body: raw
    }), env);
    return {status: r.status, body: await r.json()};
  };
  try {
    const reg = await call('register', {method: 'POST', data: {name: 'Inbox', email: 'inbox@mentra.test', password: 'synthetic-inbox-pw-2026', plan: 'plus'}});
    DB.sql.prepare("UPDATE subscriptions SET status='active'").run();
    await gw({event: 'status', state: 'open', number: '5511900000000'});
    const code = await call('whatsapp/link', {method: 'POST', cookie: reg.cookie, data: {consent: true}});
    await gw({event: 'message', id: 'm-link', from: '5511988887777', timestamp: Date.now(), kind: 'text', text: code.body.command});
    DB.sql.prepare("INSERT INTO integration_inbox(id,user_id,source,kind,payload,status,lease_until,created_at,updated_at) VALUES('ibx1',?,'whatsapp','text',?,'ready',0,?,?)")
      .run(reg.body.user.id, JSON.stringify({text: 'segredo'}), Date.now(), Date.now());
    await gw({event: 'message', id: 'm-stop', from: '5511988887777', timestamp: Date.now(), kind: 'text', text: 'PARAR'});
    const row = DB.sql.prepare("SELECT status, payload FROM integration_inbox WHERE id='ibx1'").get();
    assert.equal(row.status, 'discarded');
    assert.equal(row.payload, '{}');

    const partialChecks = await checkReadiness({vars: {}}, {VERCEL_ORIGIN_SECRET: 'e'.repeat(64)});
    assert.equal(partialChecks.find(c => c.id === 'vercel_public_origin')?.ok, false);
  } finally {
    DB.sql.close();
  }
});
