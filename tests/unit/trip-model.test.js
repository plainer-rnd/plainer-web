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
  assert.deepEqual(stopFromDto({ id: 1, order: 2, location: { name: 'Oslo' }, transport: 'Train', plannedDays: 3 }), { id: 1, order: 2, name: 'Oslo', plannedDays: 3, transport: 'Train' });
  assert.deepEqual(stopFromDto({ id: 2 }), { id: 2, order: 0, name: 'Unnamed stop', plannedDays: 1, transport: null });
  assert.deepEqual(dayFromDto({ id: 5, routeStopId: 1, order: 0, title: ' Hi ', description: '<p>x</p>' }), { id: 5, order: 0, stopId: 1, title: 'Hi', plan: ['x'] });
});

test('stopMeta reads like the app', () => {
  assert.equal(stopMeta({ plannedDays: 1, transport: 'Train' }, 7), 'Planned: 1 · Actual: 7 · Train');
  assert.equal(stopMeta({ plannedDays: 7, transport: null }, 3), 'Planned: 7 · Actual: 3');
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

import { insertIndexForStop, dayMoveIndex, stopMoveIds, duplicateDayBody, newTripBody } from '../../js/trip-model.js';

test('structure helpers: insertion index, day moves, stop moves', () => {
  const stops = [{ id: 1, order: 0, name: 'A' }, { id: 2, order: 1, name: 'B' }, { id: 3, order: 2, name: 'C' }];
  const days = [
    { id: 10, stopId: 1, order: 0, plan: [] }, { id: 11, stopId: 1, order: 1, plan: [] },
    { id: 20, stopId: 2, order: 2, plan: [] },
  ];
  const groups = buildItinerary(stops, days);
  assert.equal(insertIndexForStop(groups, 1), 2);
  assert.equal(insertIndexForStop(groups, 2), 3);
  assert.equal(insertIndexForStop(groups, 3), 3); // a stop with no days: after everything before it

  assert.equal(dayMoveIndex(groups, groups[0].days[0], 1), 1);
  assert.equal(dayMoveIndex(groups, groups[0].days[1], -1), 0);
  assert.equal(dayMoveIndex(groups, groups[0].days[0], -1), null);
  assert.equal(dayMoveIndex(groups, groups[0].days[1], 1), null); // does not cross into the next stop

  assert.deepEqual(stopMoveIds(stops, 2, -1), [2, 1, 3]);
  assert.deepEqual(stopMoveIds(stops, 2, 1), [1, 3, 2]);
  assert.equal(stopMoveIds(stops, 1, -1), null);
  assert.equal(stopMoveIds(stops, 3, 1), null);
});

test('duplicateDayBody and newTripBody', () => {
  assert.deepEqual(duplicateDayBody({ stopId: 4, title: 'T', plan: ['a & b'] }, 7), { routeStopId: 4, order: 7, title: 'T', description: '<p>a &amp; b</p>' });
  assert.equal(duplicateDayBody({ stopId: 4, title: '', plan: [] }, 0).title, null);
  assert.deepEqual(newTripBody('Rome', new Date(2026, 4, 1)), { name: 'Rome', startDate: '2026-05-01T00:00:00Z', description: null, isDraft: true });
});

import { moveItem, stopDropIds, dayDropOrder } from '../../js/trip-model.js';

test('drag and drop helpers', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(moveItem(items, 1, 3, true).map((i) => i.id), [2, 3, 1]);
  assert.deepEqual(moveItem(items, 3, 1, false).map((i) => i.id), [3, 1, 2]);
  assert.equal(moveItem(items, 9, 1, false), items);

  const stops = [{ id: 1, order: 0 }, { id: 2, order: 1 }, { id: 3, order: 2 }];
  assert.deepEqual(stopDropIds(stops, 1, 3, true), [2, 3, 1]);
  assert.equal(stopDropIds(stops, 2, 1, true), null); // dropped where it already is
  assert.equal(stopDropIds(stops, 2, 3, false), null);

  const groups = buildItinerary(
    [{ id: 1, order: 0, name: 'A' }, { id: 2, order: 1, name: 'B' }],
    [{ id: 10, stopId: 1, order: 0, plan: [] }, { id: 11, stopId: 1, order: 1, plan: [] }, { id: 12, stopId: 1, order: 2, plan: [] }, { id: 20, stopId: 2, order: 3, plan: [] }],
  );
  const [a, b, c] = groups[0].days;
  assert.equal(dayDropOrder(groups, a, c, true), 2);
  assert.equal(dayDropOrder(groups, c, a, false), 0);
  assert.equal(dayDropOrder(groups, a, b, false), null);
  assert.equal(dayDropOrder(groups, a, groups[1].days[0], false), null); // other stop
  const second = groups[1].days[0];
  assert.equal(dayDropOrder(groups, second, second, true), null);
});

import { shareErrorMessage, pdfFileName } from '../../js/trip-model.js';

test('share error messages and pdf file names', () => {
  assert.match(shareErrorMessage(404, 'a@x.co'), /a@x\.co doesn’t have a Plainer account/);
  assert.match(shareErrorMessage(0, 'a@x.co'), /internet/);
  assert.match(shareErrorMessage(500, 'a@x.co'), /Couldn’t share/);
  assert.equal(pdfFileName('2 weeks in Norway'), 'Plainer – 2 weeks in Norway.pdf');
  assert.equal(pdfFileName('a/b:c*?"<>|d'), 'Plainer – a b c d.pdf');
  assert.equal(pdfFileName('   '), 'Plainer – Trip.pdf');
});

test('importFileProblem checks presence, size and type', async () => {
  const { importFileProblem } = await import('../../js/trip-model.js');
  assert.equal(importFileProblem(null), 'Choose a PDF file first.');
  assert.equal(importFileProblem({ name: 'a.pdf', size: 0 }), 'That file is empty.');
  assert.equal(importFileProblem({ name: 'a.pdf', size: 3 * 1024 * 1024 + 1 }), 'That file is larger than 3 MB.');
  assert.equal(importFileProblem({ name: 'a.docx', size: 10, type: '' }), 'Choose a PDF file.');
  assert.equal(importFileProblem({ name: 'plan.PDF', size: 10, type: '' }), null);
  assert.equal(importFileProblem({ name: 'plan', size: 10, type: 'application/pdf' }), null);
});

test('importOutcome separates rejected, clean and partial imports', async () => {
  const { importOutcome } = await import('../../js/trip-model.js');
  assert.deepEqual(importOutcome({ rejectionReason: 'Not a trip.', tripId: null }), { created: false, reason: 'Not a trip.' });
  assert.equal(importOutcome({ tripId: null }).created, false);
  const clean = importOutcome({ tripId: 9, tripName: 'Rome', routeStopCount: 2, dayCount: 5, routeStops: [{ name: 'Rome', daysMissing: false }], unresolvedStopNames: [] });
  assert.equal(clean.needsReview, false);
  assert.equal(clean.dayCount, 5);
  const partial = importOutcome({ tripId: 9, tripName: 'Rome', routeStopCount: 2, dayCount: 5, routeStops: [{ name: 'Rome', daysMissing: true }], unresolvedStopNames: ['Atlantis'] });
  assert.deepEqual([partial.needsReview, partial.partial, partial.unresolved], [true, ['Rome'], ['Atlantis']]);
});

test('importErrorMessage', async () => {
  const { importErrorMessage } = await import('../../js/trip-model.js');
  assert.match(importErrorMessage(0), /internet/);
  assert.equal(importErrorMessage(400, 'The file is not a PDF.'), 'The file is not a PDF.');
  assert.equal(importErrorMessage(400, 'Request failed with status 400'), 'That file can’t be imported.');
  assert.match(importErrorMessage(500, 'x'), /Couldn’t import/);
});

test('AI helpers', async () => {
  const m = await import('../../js/trip-model.js');
  assert.equal(m.expressProblem('  '), 'Describe your trip first.');
  assert.equal(m.expressProblem('x'.repeat(501)), 'Please keep it under 500 characters.');
  assert.equal(m.expressProblem('Rome'), null);
  assert.match(m.aiErrorMessage(0), /internet/);
  assert.match(m.aiErrorMessage(429), /Too many/);
  assert.equal(m.aiErrorMessage(400, 'Instructions are required.'), 'Instructions are required.');
  const groups = [{ stop: { id: 1 }, days: [{}, {}] }, { stop: { id: 2 }, days: [{}] }, { stop: { id: 3 }, days: [] }];
  assert.equal(m.daysBeforeStop(groups, 1), 0);
  assert.equal(m.daysBeforeStop(groups, 2), 2);
  assert.equal(m.daysBeforeStop(groups, 3), 3);
  assert.deepEqual(m.generatedDaysBody(2, 2, [{ name: 'A', description: '<p>x</p>' }, { name: '', description: null }]),
    { routeStopId: 2, order: 2, days: [{ title: 'A', description: '<p>x</p>' }, { title: null, description: '' }] });
  assert.equal(m.importOutcome({ tripId: null }, 'custom').reason, 'custom');
});
