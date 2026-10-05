import test from 'node:test';
import assert from 'node:assert/strict';
import { googleAccount, googleSignupReady, ownsPlugin } from '../lib/account-policy.js';

const profile = { sub: '123', email: 'one@example.com', name: 'One', email_verified: true };
const account = { provider: 'google', providerAccountId: '123' };

test('repeated Google login and email changes retain the same account', () => {
  const first = googleAccount(profile, account);
  assert.deepEqual(googleAccount(profile, account), first);
  assert.equal(googleAccount({ ...profile, email: 'two@example.com' }, account).id, first.id);
  assert.notEqual(googleAccount({ ...profile, sub: '456' }, { ...account, providerAccountId: '456' }).id, first.id);
  assert.deepEqual(Object.keys(first).sort(), ['email', 'id', 'name']);
});

test('only a matching Google identity with verified email can register', () => {
  for (const invalid of [null, {}, { ...profile, sub: '' }, { ...profile, email_verified: false },
    { ...profile, email_verified: 'true' }, { ...profile, email: null }, { ...profile, email: 'bad' }]) {
    assert.throws(() => googleAccount(invalid, account));
  }
  assert.throws(() => googleAccount(profile, { ...account, provider: 'github' }));
  assert.throws(() => googleAccount(profile, { ...account, providerAccountId: 'other' }));
});

test('plugins are isolated across accounts, including pre-login guest credentials', () => {
  assert.equal(ownsPlugin({ ownerId: 'alice' }, 'alice'), true);
  assert.equal(ownsPlugin({ ownerId: 'alice' }, 'bob'), false);
  assert.equal(ownsPlugin({ ownerId: 'alice' }, null), false);
  assert.equal(ownsPlugin({ accessToken: 'legacy' }, 'alice'), false);
  assert.equal(ownsPlugin({ accessToken: 'legacy' }, null), true);
});

test('signup stays unavailable until credentials, session secret, and private storage are configured', () => {
  const env = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', AUTH_SECRET: 'session', BLOB_READ_WRITE_TOKEN: 'storage' };
  assert.equal(googleSignupReady(env), true);
  for (const key of Object.keys(env)) assert.equal(googleSignupReady({ ...env, [key]: '' }), false);
  assert.equal(googleSignupReady({ ...env, AUTH_SECRET: '', PLUGIN_SESSION_SECRET: 'existing' }), true);
});
