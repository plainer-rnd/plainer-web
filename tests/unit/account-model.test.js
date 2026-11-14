import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteWithPassword, deleteErrorMessage, clearLocalAccountData } from '../../js/account-model.js';

test('only password accounts can be deleted here', () => {
  assert.equal(canDeleteWithPassword({ email: 'a@b.co', providerData: [{ providerId: 'password' }] }), true);
  assert.equal(canDeleteWithPassword({ email: 'a@b.co', providerData: [{ providerId: 'password' }, { providerId: 'google.com' }] }), true);
  assert.equal(canDeleteWithPassword({ email: 'a@b.co', providerData: [{ providerId: 'apple.com' }] }), false);
  assert.equal(canDeleteWithPassword({ email: 'a@b.co' }), true);
  assert.equal(canDeleteWithPassword({ providerData: [{ providerId: 'password' }] }), false);
  assert.equal(canDeleteWithPassword(null), false);
});

test('delete errors are plain and never show a raw code', () => {
  assert.equal(deleteErrorMessage({ code: 'auth/invalid-credential' }), 'That password isn’t right. Try again.');
  assert.equal(deleteErrorMessage({ code: 'auth/wrong-password' }), 'That password isn’t right. Try again.');
  assert.match(deleteErrorMessage({ code: 'auth/requires-recent-login' }), /log in again/);
  assert.match(deleteErrorMessage({ code: 'auth/network-request-failed' }), /No connection/);
  assert.equal(deleteErrorMessage({ code: 'auth/something-new' }), 'Couldn’t delete your account. Please try again.');
  assert.equal(deleteErrorMessage(null), 'Couldn’t delete your account. Please try again.');
});

function fakeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => map.delete(key),
    keys: () => [...map.keys()],
  };
}

test('clearLocalAccountData removes personal keys only and survives blocked storage', () => {
  const local = fakeStorage({ plainerSignedIn: '1', plainerTheme: 'dark', 'plainerDismissed-7': '["a"]', other: 'x' });
  const session = fakeStorage({ 'plainerChat-7': '{}', 'plainerChat-9': '{}', fakeUser: 'x' });
  clearLocalAccountData(local, session);
  assert.deepEqual(local.keys(), ['plainerTheme', 'other']);
  assert.deepEqual(session.keys(), ['fakeUser']);
  assert.doesNotThrow(() => clearLocalAccountData({ get length() { throw new Error('blocked'); } }));
});
