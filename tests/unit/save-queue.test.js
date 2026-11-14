import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue } from '../../js/save-queue.js';
import { textToLines, linesToHtml, sameLines, escapeHtml, dateInputValue, parseDateInput, dateToApi } from '../../js/trip-model.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('applies at once, reports saving then saved', async () => {
  const seen = [];
  const queue = createSaveQueue({ onChange: (s) => seen.push(s) });
  let applied = false;
  await queue.submit({ key: 'a', apply: () => { applied = true; }, send: async () => {} });
  assert.equal(applied, true);
  assert.deepEqual(seen, ['saving', 'saved']);
  assert.equal(queue.status(), 'saved');
});

test('sends for the same key run in order, different keys in parallel', async () => {
  const queue = createSaveQueue();
  const log = [];
  const first = deferred();
  const p1 = queue.submit({ key: 'a', send: async () => { log.push('a1 start'); await first.promise; log.push('a1 end'); } });
  const p2 = queue.submit({ key: 'a', send: async () => { log.push('a2'); } });
  const p3 = queue.submit({ key: 'b', send: async () => { log.push('b'); } });
  await p3;
  assert.deepEqual(log, ['a1 start', 'b']);
  assert.equal(queue.status(), 'saving');
  first.resolve();
  await Promise.all([p1, p2]);
  assert.deepEqual(log, ['a1 start', 'b', 'a1 end', 'a2']);
  assert.equal(queue.status(), 'saved');
});

test('a failed send reverts, reports error, and retry sends the edit again', async () => {
  const queue = createSaveQueue();
  let value = 'old';
  let fail = true;
  const job = {
    key: 'a',
    apply: () => { value = 'new'; },
    send: async () => { if (fail) throw new Error('boom'); },
    revert: () => { value = 'old'; },
  };
  await queue.submit(job);
  assert.equal(value, 'old');
  assert.equal(queue.status(), 'error');
  assert.equal(queue.lastError().message, 'boom');

  fail = false;
  await queue.retry();
  assert.equal(value, 'new');
  assert.equal(queue.status(), 'saved');
  assert.equal(queue.lastError(), null);
});

test('an error stays visible until the retry, even if later edits succeed', async () => {
  const queue = createSaveQueue();
  await queue.submit({ key: 'a', send: async () => { throw new Error('x'); } });
  await queue.submit({ key: 'b', send: async () => {} });
  assert.equal(queue.status(), 'error');
});

test('plan text helpers', () => {
  assert.deepEqual(textToLines('  one  \n\n two   words \n'), ['one', 'two words']);
  assert.equal(linesToHtml(['a & b', '<i>']), '<p>a &amp; b</p><p>&lt;i&gt;</p>');
  assert.equal(escapeHtml(`"'`), '&quot;&#39;');
  assert.equal(sameLines(['a'], ['a']), true);
  assert.equal(sameLines(['a'], ['a', 'b']), false);
});

test('date helpers round-trip the calendar day', () => {
  const date = new Date(2026, 10, 8);
  assert.equal(dateInputValue(date), '2026-11-08');
  assert.equal(dateInputValue(null), '');
  assert.equal(dateToApi(date), '2026-11-08T00:00:00Z');
  assert.deepEqual(parseDateInput('2026-11-08'), date);
  assert.equal(parseDateInput(''), null);
  assert.equal(parseDateInput('0001-01-01'), null);
});
