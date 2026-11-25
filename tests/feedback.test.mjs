import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';

const origin = 'https://mentra.test';

async function environment() {
  const DB = integrationDB(), env = {DB};
  async function call(path, {method = 'GET', data, cookie} = {}) {
    const r = await worker.fetch(new Request(origin + '/api/' + path, {method, headers: {Origin: origin, 'Content-Type': 'application/json', ...(cookie ? {Cookie: cookie} : {})}, body: data ? JSON.stringify(data) : undefined}), env);
    let body; try { body = await r.json(); } catch { body = null; }
    return {status: r.status, body, cookie: r.headers.get('set-cookie')?.split(';')[0]};
  }
  const users = [];
  for (const name of ['ana', 'bia', 'chefe']) {
    const r = await call('register', {method: 'POST', data: {name, email: name + '@feedback.test', password: 'synthetic-feedback-password', plan: 'plus'}});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const id = DB.sql.prepare('SELECT id FROM users WHERE email=?').get(name + '@feedback.test').id;
    users.push({id, cookie: r.cookie});
  }
  DB.sql.prepare("UPDATE users SET role='admin' WHERE email=?").run('chefe@feedback.test');
  return {DB, call, users};
}

test('feedback is stored for the authenticated account only and validated', async () => {
  const c = await environment(), [ana, bia] = c.users;
  try {
    assert.equal((await c.call('feedback', {method: 'POST', data: {kind: 'problema', page: 'dinheiro', message: 'ok'}})).status, 401);
    for (const data of [{kind: 'outro', page: 'hoje', message: 'Mensagem válida'}, {kind: 'problema', page: '', message: 'Mensagem válida'}, {kind: 'problema', page: 'hoje', message: 'x'}, {kind: 'problema', page: 'hoje', message: 'x'.repeat(2001)}])
      assert.equal((await c.call('feedback', {method: 'POST', cookie: ana.cookie, data})).status, 400);
    const sent = await c.call('feedback', {method: 'POST', cookie: ana.cookie, data: {kind: 'problema', page: 'dinheiro/planejamento', message: 'O gráfico não aparece no celular.', userId: bia.id}});
    assert.equal(sent.status, 201);
    const row = c.DB.sql.prepare('SELECT user_id,kind,status FROM feedback WHERE id=?').get(sent.body.id);
    assert.deepEqual({...row}, {user_id: ana.id, kind: 'problema', status: 'novo'}, 'a conta vem da sessão, nunca do corpo');
    assert.equal((await c.call('feedback', {cookie: ana.cookie})).body.items.length, 1);
    assert.equal((await c.call('feedback', {cookie: bia.cookie})).body.items.length, 0, 'outra conta não vê o relato');
    const exported = await c.call('account/export', {cookie: ana.cookie});
    assert.equal(exported.body.feedback.length, 1);
    assert.equal((await c.call('account/export', {cookie: bia.cookie})).body.feedback.length, 0);
  } finally { c.DB.sql.close(); }
});

test('only admins read the feedback inbox and change its status', async () => {
  const c = await environment(), [ana, bia, chefe] = c.users;
  try {
    const sent = await c.call('feedback', {method: 'POST', cookie: ana.cookie, data: {kind: 'sugestao', page: 'hoje', message: 'Seria ótimo ter metas semanais.'}});
    assert.equal((await c.call('admin/feedback', {cookie: bia.cookie})).status, 403);
    assert.equal((await c.call('admin/feedback', {method: 'POST', cookie: bia.cookie, data: {id: sent.body.id, status: 'lido'}})).status, 403);
    const inbox = await c.call('admin/feedback', {cookie: chefe.cookie});
    assert.equal(inbox.status, 200);
    assert.equal(inbox.body.items[0].email, 'ana@feedback.test');
    assert.equal((await c.call('admin/feedback', {method: 'POST', cookie: chefe.cookie, data: {id: sent.body.id, status: 'resolvido'}})).status, 200);
    assert.equal((await c.call('admin/feedback?status=resolvido', {cookie: chefe.cookie})).body.items.length, 1);
    assert.equal((await c.call('admin/feedback?status=novo', {cookie: chefe.cookie})).body.items.length, 0);
    assert.equal((await c.call('admin/feedback?status=qualquer', {cookie: chefe.cookie})).status, 400);
  } finally { c.DB.sql.close(); }
});

test('deleting an account removes its feedback (cascade)', async () => {
  const c = await environment(), [ana] = c.users;
  try {
    await c.call('feedback', {method: 'POST', cookie: ana.cookie, data: {kind: 'elogio', page: 'momentos', message: 'As frases me ajudaram muito.'}});
    const removed = await c.call('account', {method: 'DELETE', cookie: ana.cookie, data: {password: 'synthetic-feedback-password'}});
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM feedback').get().n, 0);
  } finally { c.DB.sql.close(); }
});
