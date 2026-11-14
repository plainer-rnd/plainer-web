// Pure logic for the Trip assistant chat (no DOM, no network). The server keeps no conversation: the client sends the
// whole history each time. A reply either answers, asks a question, declines, or proposes changes that run only after the
// user confirms (a second call carrying the plan id and the same history).
import { aiErrorMessage } from './trip-model.js';

export const MAX_CHAT_MESSAGES = 50;
export const MAX_MESSAGE_CHARS = 2000;
export const EXAMPLE_PROMPTS = [
  'Add 3 days in Rome after Florence',
  'Add a train stop from Nice to Barcelona',
  'Make the first day more relaxed',
];

export function messageProblem(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 'Type a message first.';
  if (trimmed.length > MAX_MESSAGE_CHARS) return `Please keep it under ${MAX_MESSAGE_CHARS} characters.`;
  return null;
}

// One more message (the user's) still has to fit in the server's limit.
export const canAddMessage = (history) => history.length + 1 <= MAX_CHAT_MESSAGES;

export const historyAfterReply = (outgoing, reply) => [...outgoing, { role: 'assistant', content: reply }];

export function entityKind(type) {
  const normalised = String(type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalised.includes('day')) return 'day';
  if (normalised.includes('stop')) return 'stop';
  if (normalised === 'trip') return 'trip';
  if (normalised.includes('note')) return 'note';
  return 'other';
}

const KIND_LABEL = { day: 'Day', stop: 'Stop', trip: 'Trip', note: 'Note', other: 'Item' };
export const kindLabel = (type) => KIND_LABEL[entityKind(type)];

// What the assistant did, for the cards under its reply.
export function changeCards(response) {
  const created = (response.createdEntities || []).map((entity) => ({ kind: entityKind(entity.type), name: entity.name, badge: 'New' }));
  const deleted = response.deletedEntities || [];
  const removed = deleted.length === 0 ? [] : deleted.length === 1
    ? [{ kind: entityKind(deleted[0].type), name: deleted[0].name, badge: 'Deleted' }]
    : [{ kind: 'other', name: `${deleted.length} items deleted`, badge: 'Deleted' }];
  return [...created, ...removed];
}

// Plans that ran (fully or part way) may have changed the trip: the page reads everything back.
export function changedTheTrip(response) {
  return response.status === 'Completed' || response.status === 'Failed'
    || (response.createdEntities || []).length > 0 || (response.deletedEntities || []).length > 0;
}

export const needsConfirmation = (response) => response.status === 'PendingConfirmation' && Boolean(response.actionPlanId);

export const chatErrorMessage = (status, serverMessage) => aiErrorMessage(status, serverMessage);
