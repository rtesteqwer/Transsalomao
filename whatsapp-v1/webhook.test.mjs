import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

// Exercise the route with isolated database and HTTP dependencies; no customer data.
const source = stripTypeScriptTypes(fs.readFileSync(new URL('./api-whatsapp-webhook.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '')
  .replace('export const Route', 'const Route');
const factory = new Function('createHmac', 'randomUUID', 'timingSafeEqual', 'createFileRoute', 'getSql', 'process', 'fetch',
  source + '\nreturn { verifyWebhook, receiveWebhook, collectMessages };');

function fixture({ env = {}, drivers = [], parsed = { kind: 'unknown', confidence: 0.2 }, failDb = false } = {}) {
  const audit = new Map();
  let aiCalls = 0;
  const sql = async (strings, ...values) => {
    if (failDb) throw new Error('database unavailable');
    const query = strings.join('?').replace(/\s+/g, ' ').trim();
    if (query.startsWith('insert into whatsapp_messages')) {
      if (audit.has(values[1])) return [];
      const row = { id: values[0], status: 'received', sender_phone: values[2], group_id: values[4] };
      audit.set(values[1], row);
      return [{ id: row.id }];
    }
    if (query.includes('from whatsapp_messages')) return [audit.get(values[0])].filter(Boolean);
    if (query.startsWith('update whatsapp_messages')) {
      const row = [...audit.values()].find((r) => r.id === values.at(-1));
      assert.ok(row);
      if (query.includes("status='ai_error'")) row.status = 'ai_error';
      else if (query.includes("status='pending_media'")) row.status = 'pending_media';
      else if (query.includes('set status=?')) row.status = values[0];
      else if (query.includes('set parsed_action=')) row.parsed = JSON.parse(values[0]);
      return [];
    }
    if (query.includes('from drivers')) return drivers;
    throw new Error('Unexpected SQL in test: ' + query);
  };
  const fetchMock = async (url) => {
    assert.equal(url, 'https://api.openai.com/v1/responses', 'No outgoing WhatsApp messages during ingestion tests');
    aiCalls++;
    return Response.json({ output_text: JSON.stringify(parsed) });
  };
  const runtime = { env: { WHATSAPP_APP_SECRET: 'unit-test-secret', WHATSAPP_VERIFY_TOKEN: 'unit-test-verify',
    WHATSAPP_PHONE_NUMBER_ID: 'business-phone-id', OPENAI_API_KEY: 'unit-test-only', ...env } };
  const api = factory(createHmac, randomUUID, timingSafeEqual, () => (route) => route, async () => sql, runtime, fetchMock);
  return { ...api, audit, aiCalls: () => aiCalls };
}

function payload({ groupId, receiver = 'business-phone-id', sender = '5527999991111', type = 'text' } = {}) {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: receiver },
    contacts: [{ wa_id: sender, profile: { name: 'Motorista Teste' } }],
    messages: [{ from: sender, id: 'wamid.unit-test', group_id: groupId, type,
      text: { body: '41,860 toneladas a R$ 14 por tonelada' }, image: { id: 'media-test' } }]
  } }] }] };
}

function signed(body) {
  const raw = JSON.stringify(body);
  return new Request('https://example.test/api/whatsapp/webhook', { method: 'POST', body: raw,
    headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'unit-test-secret').update(raw).digest('hex') } });
}
const driver = { id: 'driver-test', name: 'Motorista Teste', phone: '(27) 99999-1111', status: 'ativo' };

test('Meta verification accepts only the configured token', async () => {
  const api = fixture();
  const ok = await api.verifyWebhook(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=unit-test-verify&hub.challenge=12345'));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '12345');
  assert.equal((await api.verifyWebhook(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=wrong'))).status, 403);
});

test('Unsigned requests cannot reach the database or AI', async () => {
  const api = fixture();
  const res = await api.receiveWebhook(new Request('https://example.test/', { method: 'POST', body: '{}' }));
  assert.equal(res.status, 401);
  assert.equal(api.audit.size, 0);
  assert.equal(api.aiCalls(), 0);
});

test('Missing credentials leave the webhook disabled', async () => {
  assert.equal((await fixture({ env: { WHATSAPP_APP_SECRET: '' } }).receiveWebhook(signed(payload()))).status, 503);
  assert.equal((await fixture({ env: { WHATSAPP_PHONE_NUMBER_ID: '' } }).receiveWebhook(signed(payload()))).status, 503);
});

test('Rejects a signed object from another product', async () => {
  const api = fixture();
  assert.equal((await api.receiveWebhook(signed({ ...payload(), object: 'other' }))).status, 400);
  assert.equal(api.audit.size, 0);
});

test('Group identity is preserved and direct conversations store null', () => {
  const api = fixture();
  assert.equal(api.collectMessages(payload({ groupId: 'group-test' }), 'business-phone-id')[0].groupId, 'group-test');
  assert.equal(api.collectMessages(payload(), 'business-phone-id')[0].groupId, null);
});

test('Messages for another business number cannot be ingested', async () => {
  const api = fixture();
  const res = await api.receiveWebhook(signed(payload({ receiver: 'other-business' })));
  assert.equal((await res.json()).received, 0);
  assert.equal(api.audit.size, 0);
});

test('A group must be selected before its messages reach AI', async () => {
  const api = fixture({ drivers: [driver] });
  await api.receiveWebhook(signed(payload({ groupId: 'unselected-group' })));
  assert.equal([...api.audit.values()][0].status, 'pending_group_authorization');
  assert.equal(api.aiCalls(), 0);
});

test('A name in a message cannot authorize an unknown sender', async () => {
  const api = fixture();
  await api.receiveWebhook(signed(payload()));
  assert.equal([...api.audit.values()][0].status, 'pending_sender_authorization');
  assert.equal(api.aiCalls(), 0);
});

test('Concurrent redelivery creates a single audit entry and a single AI call', async () => {
  const api = fixture({ drivers: [driver], env: { WHATSAPP_ALLOWED_GROUP_IDS: 'group-test' } });
  const responses = await Promise.all([api.receiveWebhook(signed(payload({ groupId: 'group-test' }))),
    api.receiveWebhook(signed(payload({ groupId: 'group-test' })))]);
  const results = await Promise.all(responses.map((r) => r.json()));
  assert.equal(api.audit.size, 1);
  assert.equal(api.aiCalls(), 1);
  assert.equal(results.filter((r) => r.results[0].duplicate).length, 1);
  assert.equal([...api.audit.values()][0].status, 'pending_review');
});

test('Even confident extraction stays pending until automatic posting is enabled', async () => {
  const api = fixture({ drivers: [driver], parsed: { kind: 'trip', confidence: 0.99, driver: driver.name } });
  await api.receiveWebhook(signed(payload()));
  assert.equal([...api.audit.values()][0].status, 'pending_review');
});

test('Media without text remains pending; no OCR or transcription is claimed', async () => {
  const api = fixture({ drivers: [driver] });
  await api.receiveWebhook(signed(payload({ type: 'image' })));
  assert.equal([...api.audit.values()][0].status, 'pending_media');
  assert.equal(api.aiCalls(), 0);
});

test('Failure to save a receipt returns 503 so the provider can retry', async () => {
  const api = fixture({ failDb: true });
  assert.equal((await api.receiveWebhook(signed(payload()))).status, 503);
});
