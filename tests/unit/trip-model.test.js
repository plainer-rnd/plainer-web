import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stopFromDto, dayFromDto, plainLines, stopMeta, buildItinerary, tripDatesLabel, dayDateLabel,
  overviewOf, validationValue, sharedPeople, parseTripId, plural,
} from '../../js/trip-model.js';

test('plainLines turns rich text into safe plain lines', () => {
  assert.deepEqual(plainLines('<p>Visit <b>Akershus</b> &amp; the park.</p><p>Lunch</p>'), ['Visit Akershus & the park.', 'Lunch']);
  assert.deepEqual(plainLines('<ul><li>One</li><li>Two</li></ul>'), ['• One', '• Two']);
  assert.deepEqual(plainLines('Line one<br>Line two'), ['Line one', 'Line two']);
  assert.deepEqual(plainLines('<p>&nbsp;</p>'), []);
  assert.deepEqual(plainLines(null), []);
  assert.deepEqual(plainLines('<script>alert(1)</script>Hi'), ['alert(1)Hi']); // tags dropped; the text is only ever shown via textContent
});

test('stopFromDto and dayFromDto fall back gracefully', () => {
  assert.deepEqual(stopFromDto({ id: 1, order: 2, location: { name: 'Oslo' }, transport: 'Train', plannedDays: 3 }), { id: 1, order: 2, name: 'Oslo', nights: 3, transport: 'Train' });
  assert.deepEqual(stopFromDto({ id: 2 }), { id: 2, order: 0, name: 'Unnamed stop', nights: 1, transport: null });
  assert.deepEqual(dayFromDto({ id: 5, routeStopId: 1, order: 0, title: ' Hi ', description: '<p>x</p>' }), { id: 5, order: 0, stopId: 1, title: 'Hi', plan: ['x'] });
});

test('stopMeta reads like the app', () => {
  assert.equal(stopMeta({ nights: 1, transport: 'Train' }, 0), '1 night · Train · no days planned');
  assert.equal(stopMeta({ nights: 7, transport: null }, 3), '7 nights · 3 days planned');
});

test('buildItinerary orders stops and days and numbers days across the trip', () => {
  const stops = [{ id: 2, order: 1, name: 'B' }, { id: 1, order: 0, name: 'A' }];
  const days = [
    { id: 30, stopId: 2, order: 2, plan: [] },
    { id: 10, stopId: 1, order: 0, plan: [] },
    { id: 20, stopId: 1, order: 1, plan: [] },
    { id: 99, stopId: 77, order: 5, plan: [] },
  ];
  const groups = buildItinerary(stops, days);
  assert.deepEqual(groups.map((g) => g.stop.name), ['A', 'B', 'Other days']);
  assert.deepEqual(groups.flatMap((g) => g.days.map((d) => `${d.id}:${d.number}`)), ['10:1', '20:2', '30:3', '99:4']);
});

test('trip dates are a range when the number of days is known', () => {
  const start = new Date(2026, 10, 8);
  assert.equal(tripDatesLabel(start, 14), '8 – 21 Nov 2026');
  assert.equal(tripDatesLabel(new Date(2026, 10, 28), 5), '28 Nov – 2 Dec 2026');
  assert.equal(tripDatesLabel(start, 1), 'Starts 8 Nov 2026');
  assert.equal(tripDatesLabel(null, 5), 'Dates not set');
  assert.equal(tripDatesLabel(new Date(2026, 11, 30), 5), '30 Dec 2026 – 3 Jan 2027');
  assert.equal(dayDateLabel(start, { number: 2 }), 'Mon 9 Nov');
  assert.equal(dayDateLabel(null, { number: 2 }), '');
});

test('overview mirrors the app: progress by days with a plan, validation count or OK', () => {
  const days = [{ plan: ['a'] }, { plan: [] }, { plan: ['b'] }];
  const overview = overviewOf([{}, {}], days, { errorCount: 1, warningCount: 2 });
  assert.equal(overview.progressPercent, 67);
  assert.equal(overview.progressLabel, '2 of 3 days have a plan');
  assert.equal(validationValue(overview), '3');
  assert.equal(validationValue(overviewOf([], [], { errorCount: 0, warningCount: 0 })), 'OK');
  assert.equal(validationValue(overviewOf([], [], null)), '–');
  assert.equal(overviewOf([], [], null).progressLabel, 'No days planned yet');
});

test('sharedPeople, parseTripId and plural', () => {
  assert.deepEqual(sharedPeople([{ sharedWith: 'olena@x.co' }, { sharedWith: null }]).map((p) => p.initial), ['O']);
  assert.equal(parseTripId('?id=42'), '42');
  assert.equal(parseTripId('?id=abc'), null);
  assert.equal(parseTripId(''), null);
  assert.equal(plural(1, 'day'), '1 day');
  assert.equal(plural(2, 'validation issue'), '2 validation issues');
});
