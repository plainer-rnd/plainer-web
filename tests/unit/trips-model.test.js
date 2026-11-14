import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStartDate, tripFromDto, countsLabel, resolveStatus, coverFor, initialOf, datesLabel, ownerLabel,
  splitTrips, filterTrips, tripsCountLabel,
} from '../../js/trips-model.js';

const today = new Date(2026, 10, 13); // 13 Nov 2026

const trip = (overrides) => ({ id: 1, name: 'Trip', isDraft: false, startDate: null, shareId: null, sharedBy: null, ...overrides });

test('parseStartDate keeps the calendar day regardless of time zone and rejects placeholder dates', () => {
  const date = parseStartDate('2026-11-08T00:00:00Z');
  assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2026, 10, 8]);
  assert.equal(parseStartDate('0001-01-01T00:00:00Z'), null);
  assert.equal(parseStartDate(undefined), null);
  assert.equal(parseStartDate('not a date'), null);
});

test('tripFromDto defaults to draft like the app and tolerates missing fields', () => {
  const model = tripFromDto({ id: 7, name: '' });
  assert.equal(model.isDraft, true);
  assert.equal(model.name, 'Untitled trip');
  assert.equal(model.shareId, null);
  assert.deepEqual([model.stopCount, model.dayCount], [null, null]);
});

test('countsLabel says what is known and nothing when the server did not send counts', () => {
  assert.equal(countsLabel(tripFromDto({ id: 1 })), null);
  assert.equal(countsLabel(tripFromDto({ id: 1, stopCount: 0, dayCount: 0 })), 'No stops yet');
  assert.equal(countsLabel(tripFromDto({ id: 1, stopCount: 1, dayCount: 1 })), '1 stop · 1 day');
  assert.equal(countsLabel(tripFromDto({ id: 1, stopCount: 3, dayCount: 7 })), '3 stops · 7 days');
  assert.equal(countsLabel(tripFromDto({ id: 1, stopCount: 2, dayCount: 0 })), '2 stops · 0 days');
  assert.equal(tripFromDto({ id: 1, stopCount: '3', dayCount: 7 }).stopCount, null);
});

test('resolveStatus matches the iOS rules', () => {
  assert.equal(resolveStatus(trip({ isDraft: true, startDate: new Date(2030, 0, 1) }), today), 'draft');
  assert.equal(resolveStatus(trip({ startDate: new Date(2027, 5, 12) }), today), 'upcoming');
  assert.equal(resolveStatus(trip({ startDate: new Date(2026, 10, 13) }), today), 'active', 'starts today');
  assert.equal(resolveStatus(trip({ startDate: new Date(2026, 0, 1) }), today), 'active', 'already started');
  assert.equal(resolveStatus(trip({ startDate: null }), today), 'active', 'no date and not a draft');
});

test('coverFor is stable per id and cycles through three styles', () => {
  assert.equal(coverFor(5), coverFor(5));
  assert.deepEqual([0, 1, 2, 3].map(coverFor), ['a', 'b', 'c', 'a']);
  assert.equal(coverFor(undefined), 'a');
});

test('initialOf handles empty, emoji and lowercase names', () => {
  assert.equal(initialOf('scotland'), 'S');
  assert.equal(initialOf('  rome'), 'R');
  assert.equal(initialOf(''), '?');
  assert.equal(initialOf('\u{1F30D} World'), '\u{1F30D}');
});

test('labels', () => {
  assert.equal(datesLabel(trip({})), 'Dates not set');
  assert.match(datesLabel(trip({ startDate: new Date(2026, 10, 8) })), /^Starts 8 Nov 2026$/);
  assert.equal(ownerLabel(trip({}), 0), 'Owned by you');
  assert.equal(ownerLabel(trip({}), 2), 'Owned by you · shared with 2');
  assert.equal(ownerLabel(trip({ shareId: 3, sharedBy: 'Olena' }), 0), 'Shared by Olena');
  assert.equal(ownerLabel(trip({ shareId: 3 }), 0), 'Shared by a traveler');
});

test('splitTrips separates owned from shared', () => {
  const { mine, shared } = splitTrips([trip({ id: 1 }), trip({ id: 2, shareId: 9 })]);
  assert.deepEqual([mine.map((t) => t.id), shared.map((t) => t.id)], [[1], [2]]);
});

test('filterTrips by status and name', () => {
  const trips = [
    trip({ id: 1, name: 'Norway', startDate: new Date(2026, 0, 1) }),
    trip({ id: 2, name: 'Scotland', startDate: new Date(2027, 5, 12) }),
    trip({ id: 3, name: 'Rome', isDraft: true }),
  ];
  assert.deepEqual(filterTrips(trips, {}, today).map((t) => t.id), [1, 2, 3]);
  assert.deepEqual(filterTrips(trips, { status: 'upcoming' }, today).map((t) => t.id), [2]);
  assert.deepEqual(filterTrips(trips, { status: 'draft' }, today).map((t) => t.id), [3]);
  assert.deepEqual(filterTrips(trips, { query: '  NOR ' }, today).map((t) => t.id), [1]);
  assert.deepEqual(filterTrips(trips, { status: 'active', query: 'rome' }, today), []);
});

test('tripsCountLabel', () => {
  assert.equal(tripsCountLabel(1, 'mine'), '1 trip you own');
  assert.equal(tripsCountLabel(4, 'mine'), '4 trips you own');
  assert.equal(tripsCountLabel(2, 'shared'), '2 trips shared with you');
});
