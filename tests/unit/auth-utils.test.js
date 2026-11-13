import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext, isValidEmail, describeAuthError } from '../../js/auth-utils.js';

test('safeNext keeps same-site paths, including the query string', () => {
  assert.equal(safeNext('/trips/'), '/trips/');
  assert.equal(safeNext('/trip/?id=42'), '/trip/?id=42');
});

test('safeNext rejects anything that could leave the site', () => {
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'trips', '', null, undefined]) {
    assert.equal(safeNext(bad), '/trips/', String(bad));
  }
});

test('isValidEmail', () => {
  assert.equal(isValidEmail(' a@b.co '), true);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail(''), false);
});

test('describeAuthError maps known codes to plain language and never leaks the code', () => {
  const known = describeAuthError({ code: 'auth/email-already-in-use' });
  assert.equal(known.field, 'email');
  assert.ok(!known.message.includes('auth/'));
  const unknown = describeAuthError({ code: 'auth/something-new' });
  assert.equal(unknown.field, 'form');
  assert.ok(!unknown.message.includes('auth/'));
  assert.equal(describeAuthError(undefined).field, 'form');
});

test('wrong password and unknown user give the same message', () => {
  assert.deepEqual(describeAuthError({ code: 'auth/wrong-password' }), describeAuthError({ code: 'auth/user-not-found' }));
});
