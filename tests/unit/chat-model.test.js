import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  messageProblem, canAddMessage, historyAfterReply, entityKind, kindLabel, changeCards, changedTheTrip, needsConfirmation, chatErrorMessage, MAX_CHAT_MESSAGES,
} from '../../js/chat-model.js';

test('messageProblem checks for empty and too long text', () => {
  assert.equal(messageProblem('  '), 'Type a message first.');
  assert.equal(messageProblem(null), 'Type a message first.');
  assert.equal(messageProblem('x'.repeat(2001)), 'Please keep it under 2000 characters.');
  assert.equal(messageProblem('x'.repeat(2000)), null);
});

test('the history may grow to the server limit, never past it', () => {
  assert.equal(canAddMessage([]), true);
  assert.equal(canAddMessage(new Array(MAX_CHAT_MESSAGES - 1).fill({})), true);
  assert.equal(canAddMessage(new Array(MAX_CHAT_MESSAGES).fill({})), false);
  assert.deepEqual(historyAfterReply([{ role: 'user', content: 'hi' }], 'Hello'), [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello' }]);
});

test('entityKind copes with the server’s inconsistent type names', () => {
  for (const [type, kind] of [['day', 'day'], ['Days', 'day'], ['route-stop', 'stop'], ['RouteStop', 'stop'], ['route_stop', 'stop'], ['trip', 'trip'], ['Note', 'note'], ['thing', 'other'], [null, 'other']]) {
    assert.equal(entityKind(type), kind, String(type));
  }
  assert.equal(kindLabel('route-stop'), 'Stop');
});

test('changeCards lists created items and summarises deletions', () => {
  assert.deepEqual(changeCards({ createdEntities: [{ type: 'day', id: 1, name: 'Rome' }], deletedEntities: [] }), [{ kind: 'day', name: 'Rome', badge: 'New' }]);
  assert.deepEqual(changeCards({ deletedEntities: [{ type: 'day', id: 1, name: 'Old' }] }), [{ kind: 'day', name: 'Old', badge: 'Deleted' }]);
  assert.deepEqual(changeCards({ deletedEntities: [{ type: 'day', id: 1, name: 'A' }, { type: 'day', id: 2, name: 'B' }] }), [{ kind: 'other', name: '2 items deleted', badge: 'Deleted' }]);
  assert.deepEqual(changeCards({}), []);
});

test('only executed plans mean the trip may have changed', () => {
  assert.equal(changedTheTrip({ status: 'Completed' }), true);
  assert.equal(changedTheTrip({ status: 'Failed', createdEntities: [] }), true);
  assert.equal(changedTheTrip({ status: 'PendingConfirmation' }), false);
  assert.equal(changedTheTrip({ status: 'OutOfScope' }), false);
  assert.equal(changedTheTrip({ status: 'ClarificationNeeded', createdEntities: [{ type: 'day', id: 1, name: 'x' }] }), true);
});

test('a plan needs confirming only when the server gives a plan id', () => {
  assert.equal(needsConfirmation({ status: 'PendingConfirmation', actionPlanId: 'p1' }), true);
  assert.equal(needsConfirmation({ status: 'PendingConfirmation', actionPlanId: null }), false);
  assert.equal(needsConfirmation({ status: 'Completed', actionPlanId: 'p1' }), false);
  assert.equal(chatErrorMessage(400, 'Too long.'), 'Too long.');
});
