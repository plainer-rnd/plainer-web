import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, unwrap, errorMessageFrom } from '../../js/api-utils.js';
import { displayNameOf, userInitial } from '../../js/user-display.js';

test('buildUrl joins base, api prefix, endpoint and params', () => {
  const base = 'https://trips.example.run.app';
  assert.equal(buildUrl(base, 'trips', { includeShared: true }), 'https://trips.example.run.app/api/trips?includeShared=true');
  assert.equal(buildUrl(base + '/', '/trip-shares/by'), 'https://trips.example.run.app/api/trip-shares/by');
});

test('unwrap takes result from the envelope, passes plain bodies, tolerates empty', () => {
  assert.deepEqual(unwrap({ requestId: 'x', result: [1, 2] }), [1, 2]);
  assert.deepEqual(unwrap([3]), [3]);
  assert.equal(unwrap(null), null);
  assert.equal(unwrap({ result: null, requestId: 'x' }) !== undefined, true);
});

test('errorMessageFrom prefers the server message', () => {
  assert.equal(errorMessageFrom({ error: 'Nope' }, 400), 'Nope');
  assert.equal(errorMessageFrom({ message: 'Bad' }, 400), 'Bad');
  assert.equal(errorMessageFrom(null, 500), 'Request failed with status 500');
});

test('user display falls back from name to email', () => {
  assert.equal(displayNameOf({ displayName: 'Olena', email: 'o@x.co' }), 'Olena');
  assert.equal(displayNameOf({ displayName: null, email: 'o@x.co' }), 'o@x.co');
  assert.equal(userInitial({ displayName: 'olena' }), 'O');
  assert.equal(userInitial(null), 'A');
});
