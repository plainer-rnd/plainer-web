import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  issueFromDto, groupIssues, activeIssues, reviewCounts, readDismissed, writeDismissed, fixRequestFrom, fixErrorMessage, issuesFromValidation,
} from '../../js/validation-model.js';

const dto = (over) => ({ hash: 'h1', severity: 'Warning', code: 'TOO_MANY_DAYS_AT_STOP', name: 'Too many days', message: 'Msg', suggestion: 'Tip', scope: 'RouteStop', entityId: 5, ...over });

test('issueFromDto maps tier, defaults and fix availability', () => {
  assert.equal(issueFromDto(dto({ severity: 'Error' })).tier, 'critical');
  assert.equal(issueFromDto(dto()).tier, 'advisory');
  assert.equal(issueFromDto(dto({ code: 'LOCATION_NOT_FOUND' })).hasFixOptions, false);
  assert.equal(issueFromDto(dto()).hasFixOptions, true);
  const bare = issueFromDto({ severity: 'Error' });
  assert.deepEqual([bare.code, bare.name, bare.message, bare.hash], ['Unknown', 'Unknown', 'No details available', null]);
});

test('groupIssues keeps first-seen order and groups by name', () => {
  const issues = [dto({ hash: 'a', name: 'B' }), dto({ hash: 'b', name: 'A' }), dto({ hash: 'c', name: 'B' })].map(issueFromDto);
  assert.deepEqual(groupIssues(issues).map((g) => [g.title, g.items.map((i) => i.hash)]), [['B', ['a', 'c']], ['A', ['b']]]);
});

test('dismissed issues drop out of the active list and the counts', () => {
  const validation = { errorCount: 1, warningCount: 2, issues: [dto({ hash: 'a', severity: 'Error' }), dto({ hash: 'b' }), dto({ hash: 'c' })] };
  const issues = issuesFromValidation(validation);
  assert.equal(activeIssues(issues, new Set(['b'])).length, 2);
  assert.deepEqual(reviewCounts(validation, new Set(['b'])), { errorCount: 1, warningCount: 1 });
  assert.deepEqual(reviewCounts({ errorCount: 3, warningCount: 4, issues: [] }, new Set(['x'])), { errorCount: 3, warningCount: 4 });
  assert.equal(reviewCounts(null, new Set()), null);
});

test('dismissed hashes round-trip through storage and survive bad data', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  writeDismissed(storage, 7, new Set(['a', 'b']));
  assert.deepEqual([...readDismissed(storage, 7)], ['a', 'b']);
  writeDismissed(storage, 7, new Set());
  assert.equal(store.size, 0);
  store.set('plainerDismissed-7', '{nope');
  assert.equal(readDismissed(storage, 7).size, 0);
  assert.equal(readDismissed({ getItem() { throw new Error('blocked'); } }, 7).size, 0);
});

test('fixRequestFrom only accepts writes to this trip’s stops and days', () => {
  const ok = fixRequestFrom({ method: 'post', url: '/api/trips/12/route-stops/reorder', body: { orderedStopIds: [2, 1] } }, 12);
  assert.deepEqual(ok, { method: 'POST', endpoint: 'trips/12/route-stops/reorder', body: { orderedStopIds: [2, 1] }, generateForStop: null });
  assert.equal(fixRequestFrom({ method: 'DELETE', url: '/api/trips/12/days/9' }, 12).body, undefined);
  assert.equal(fixRequestFrom({ method: 'PUT', url: '/api/trips/12/route-stops/3', body: null }, 12).body.constructor, Object);
  assert.equal(fixRequestFrom({ method: 'POST', url: '/api/trips/12/route-stops/4/generate-days', body: { numberOfDays: 2 } }, 12).generateForStop, 4);
  for (const bad of [
    { method: 'GET', url: '/api/trips/12/days' },
    { method: 'POST', url: 'https://evil.example/api/trips/12/days' },
    { method: 'POST', url: '/api/trips/13/days/1' },
    { method: 'POST', url: '/api/trips/12/../../profile' },
    { method: 'DELETE', url: '/api/trips/12' },
    { method: 'POST', url: '/api/trips/12/days?x=1' },
    { method: 'POST' },
  ]) assert.equal(fixRequestFrom(bad, 12), null, JSON.stringify(bad));
  assert.equal(fixRequestFrom(null, 12), null);
});

test('fixErrorMessage prefers the server message', () => {
  assert.equal(fixErrorMessage(400, 'Days cannot be merged.'), 'Days cannot be merged.');
  assert.match(fixErrorMessage(500, 'Request failed with status 500'), /Couldn’t apply/);
  assert.match(fixErrorMessage(0), /didn’t get an answer/);
});
