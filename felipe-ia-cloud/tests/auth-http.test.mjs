import test from 'node:test';
import assert from 'node:assert/strict';
import { encode } from 'next-auth/jwt';
import { EncryptJWT } from 'jose';
import { createHash } from 'node:crypto';

// Opt-in integration checks against a LOCAL server with synthetic credentials.
// AUTH_SECRET=local-test-only-not-a-production-secret AUTH_URL=http://localhost:3127
// GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=local-test-client
// BLOB_READ_WRITE_TOKEN=local-test-storage npm run start -- --port 3127
const origin = 'http://localhost:3127';
const enabled = process.env.RUN_LOCAL_AUTH_TESTS === '1';
const secret = 'local-test-only-not-a-production-secret';
const sessionName = 'authjs.session-token';

async function localSession(sub, maxAge = 3600) {
  const token = await encode({ token: { sub, name: 'Test ' + sub, email: sub + '@example.com' }, secret, salt: sessionName, maxAge });
  return sessionName + '=' + token;
}

test('HTTP login uses minimal scopes and rejects forgery, expired sessions and cross-account plugins', { skip: !enabled }, async () => {
  let response = await fetch(origin + '/login');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Continuar com Google/);
  response = await fetch(origin + '/api/auth/session');
  assert.equal(await response.json(), null);

  response = await fetch(origin + '/api/auth/csrf');
  const csrf = await response.json();
  const cookie = response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  response = await fetch(origin + '/api/auth/signin/google', {
    method: 'POST', redirect: 'manual', headers: { Cookie: cookie },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: origin })
  });
  assert.equal(response.status, 302);
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.origin, 'https://accounts.google.com');
  assert.equal(destination.searchParams.get('redirect_uri'), origin + '/api/auth/callback/google');
  assert.equal(destination.searchParams.get('scope'), 'openid email profile');
  for (const check of ['state', 'nonce', 'code_challenge']) assert.ok(destination.searchParams.get(check));

  response = await fetch(origin + '/api/auth/signin/google', {
    method: 'POST', redirect: 'manual', body: new URLSearchParams({ csrfToken: 'forged' })
  });
  assert.ok(!String(response.headers.get('location')).startsWith('https://accounts.google.com'));
  response = await fetch(origin + '/api/auth/callback/google?code=forged&state=forged', { redirect: 'manual' });
  assert.match(response.headers.get('location'), /error=/);
  assert.ok(!response.headers.getSetCookie().some(value => value.startsWith(sessionName + '=')));

  response = await fetch(origin + '/api/auth/session', { headers: { Cookie: sessionName + '=tampered' } });
  assert.equal(await response.json(), null);
  response = await fetch(origin + '/api/auth/session', { headers: { Cookie: await localSession('alice', -60) } });
  assert.equal(await response.json(), null);

  const alice = await localSession('alice');
  response = await fetch(origin + '/', { headers: { Cookie: alice } });
  const page = await response.text();
  assert.match(page, /alice@example.com/);
  assert.match(page, /Sair/);
  const pluginToken = await new EncryptJWT({ provider: 'github', ownerId: 'alice', accessToken: 'local-test-only-token' })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setExpirationTime('1h')
    .encrypt(createHash('sha256').update(secret).digest());
  const plugin = 'felipe_plugin_github=' + pluginToken;
  for (const [session, expected] of [[alice, true], [await localSession('bob'), false], ['', false]]) {
    response = await fetch(origin + '/api/plugins', { headers: { Cookie: [session, plugin].filter(Boolean).join('; ') } });
    const data = await response.json();
    assert.equal(data.plugins.find(item => item.id === 'github').connected, expected);
  }
});
