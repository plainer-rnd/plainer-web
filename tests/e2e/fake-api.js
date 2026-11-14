// Mocks plainer-trips-server (config.apiBaseUrl is https://api.test in tests).
const farPast = '2020-01-01T00:00:00Z';
const farFuture = '2099-06-12T00:00:00Z';

const sampleTrips = [
  { id: 1, name: '2 weeks in Norway', startDate: farPast, isDraft: false },
  { id: 2, name: 'Scotland', startDate: farFuture, isDraft: false },
  { id: 3, name: 'Long weekend in Rome', startDate: '0001-01-01T00:00:00Z', isDraft: true },
  { id: 4, name: 'France', startDate: '0001-01-01T00:00:00Z', isDraft: true },
  { id: 5, name: 'Lisbon with Olena', startDate: farFuture, isDraft: false, shareId: 50, sharedBy: 'Olena' },
  { id: 6, name: 'Max’s Alps', startDate: farPast, isDraft: false, shareId: 60, sharedBy: 'Max' },
];

const place = (name) => ({ id: 'g-' + name, name, type: 'locality', address: name, latitude: 0, longitude: 0 });

const sampleDetails = {
  1: {
    trip: sampleTrips[0],
    stops: [
      { id: 12, tripId: 1, order: 1, distance: 0, location: place('Bergen'), transport: 'Train', plannedDays: 1 },
      { id: 11, tripId: 1, order: 0, distance: 0, location: place('Oslo'), transport: 'Flight', plannedDays: 2 },
      { id: 13, tripId: 1, order: 2, distance: 0, location: place('Flåm'), plannedDays: 3 },
    ],
    days: [
      { id: 102, tripId: 1, routeStopId: 11, order: 1, title: 'Art and Culture', description: '<p>Visit the <b>National</b> Museum &amp; Munch.</p><ul><li>Lunch at Mathallen</li></ul>' },
      { id: 101, tripId: 1, routeStopId: 11, order: 0, title: 'Historic Core', description: '<p>Akershus Fortress.</p>' },
      { id: 103, tripId: 1, routeStopId: 12, order: 2, title: '', description: '' },
    ],
    validation: { tripId: 1, isValid: false, errorCount: 1, warningCount: 2, issues: [] },
  },
  2: {
    trip: sampleTrips[1],
    stops: [],
    days: [],
    validation: { tripId: 2, isValid: true, errorCount: 0, warningCount: 0, issues: [] },
  },
  5: {
    trip: sampleTrips[4],
    stops: [{ id: 51, tripId: 5, order: 0, distance: 0, location: place('Lisbon'), plannedDays: 4 }],
    days: [{ id: 501, tripId: 5, routeStopId: 51, order: 0, title: 'Alfama', description: '<p>Tram 28.</p>' }],
    validation: { tripId: 5, isValid: true, errorCount: 0, warningCount: 0, issues: [] },
  },
};

async function signIn(page, user = { email: 'olena@example.com', displayName: 'Olena Test' }) {
  await page.addInitScript((u) => {
    // Seed once per tab, so a later sign-out in the test is not undone by the next page load.
    if (sessionStorage.getItem('fakeSeeded')) return;
    sessionStorage.setItem('fakeSeeded', '1');
    sessionStorage.setItem('fakeUser', JSON.stringify(u));
  }, user);
}

// options: trips, sharedBy, profile, tripsStatus (HTTP status for GET trips), requests (array that collects calls)
async function mockApi(page, options = {}) {
  const trips = options.trips || sampleTrips;
  const details = options.details || JSON.parse(JSON.stringify(sampleDetails));
  let nextId = 900;
  const sharedBy = options.sharedBy || [{ tripId: 2, shares: [{ sharedWith: 'a@x.co', shareId: 1 }, { sharedWith: 'b@x.co', shareId: 2 }] }];
  const parseBody = (request) => {
    const data = request.postData();
    if (!data) return null;
    try { return JSON.parse(data); } catch (e) { return { multipart: true, hasPdf: /filename="[^"]+\.pdf"/.test(data) }; }
  };
  const profile = options.profile || { email: 'olena@example.com', displayName: 'Olena From API' };
  await page.route('https://api.test/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    options.requests?.push({ method: request.method(), path: url.pathname, search: url.search, authorization: request.headers().authorization, body: parseBody(request) });
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.pathname === '/api/trips' && request.method() === 'GET') return options.tripsStatus && options.tripsStatus !== 200
      ? json(options.tripsStatus, { error: 'boom' })
      : json(200, { requestId: 'r', result: trips });
    if (url.pathname === '/api/trip-shares/by') return json(200, { requestId: 'r', result: sharedBy });
    if (url.pathname === '/api/trips/import' && request.method() === 'POST') {
      if (options.importStatus) return json(options.importStatus, { error: { message: options.importMessage || 'boom' } });
      const created = { rejectionReason: null, tripId: 88, tripName: 'Imported Rome', routeStopCount: 2, dayCount: 4, routeStops: [{ routeStopId: 1, name: 'Rome', dayIds: [1], daysMissing: false }], unresolvedStopNames: [] };
      return json(created.rejectionReason || options.importResult?.tripId === null ? 200 : 201, { requestId: 'r', result: { ...created, ...(options.importResult || {}) } });
    }
    if (url.pathname === '/api/trips/express' && request.method() === 'POST') {
      if (options.expressStatus) return json(options.expressStatus, { error: { message: options.expressMessage || 'boom' } });
      const made = { rejectionReason: null, tripId: 99, tripName: 'Portugal food trip', routeStopCount: 3, dayCount: 7, routeStops: [{ id: 1, name: 'Lisbon', dayIds: [1], daysMissing: false }], unresolvedStopNames: [] };
      return json(made.rejectionReason || options.expressResult?.tripId === null ? 200 : 201, { requestId: 'r', result: { ...made, ...(options.expressResult || {}) } });
    }
    const generate = url.pathname.match(/^\/api\/trips\/(\d+)\/route-stops\/(\d+)\/generate-days$/);
    if (generate && request.method() === 'POST') {
      if (options.generateStatus) return json(options.generateStatus, { error: { message: options.generateMessage || 'boom' } });
      const { numberOfDays } = JSON.parse(request.postData());
      return json(200, { requestId: 'r', result: Array.from({ length: numberOfDays }, (_, i) => ({ name: `AI day ${i + 1}`, description: `<p>Plan ${i + 1}</p>`, didYouKnow: null })) });
    }
    const batch = url.pathname.match(/^\/api\/trips\/(\d+)\/days\/batch$/);
    if (batch && request.method() === 'POST' && details[batch[1]]) {
      const detail = details[batch[1]];
      const body = JSON.parse(request.postData());
      const items = [...detail.days].sort((a, b) => a.order - b.order);
      const created = body.days.map((d) => ({ id: ++nextId, tripId: 1, routeStopId: body.routeStopId, order: 0, title: d.title, description: d.description }));
      items.splice(body.order, 0, ...created);
      items.forEach((item, index) => { item.order = index; });
      detail.days = items;
      return json(201, { requestId: 'r', result: created });
    }
    if (url.pathname.endsWith('/export/pdf')) {
      if (options.exportStatus) return json(options.exportStatus, { error: 'boom' });
      return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'access-control-allow-origin': '*' }, body: '%PDF-1.4 fake' });
    }
    if (url.pathname === '/api/trip-shares' && request.method() === 'POST') {
      const body = JSON.parse(request.postData());
      if (!/known/.test(body.emails[0])) return json(404, { error: 'not found' });
      const list = (options.shares = options.shares || {});
      (list[body.tripId] = list[body.tripId] || []).push({ sharedWith: body.emails[0], shareId: 700 + (list[body.tripId].length) });
      return json(201, { requestId: 'r', result: { tripId: body.tripId, shares: [{ sharedWith: body.emails[0], shareId: 700 }] } });
    }
    const unshare = url.pathname.match(/^\/api\/trip-shares\/(\d+)$/);
    if (unshare && request.method() === 'DELETE') {
      for (const id of Object.keys(options.shares || {})) options.shares[id] = options.shares[id].filter((x) => String(x.shareId) !== unshare[1]);
      return json(200, { requestId: 'r', result: {} });
    }
    if (url.pathname.endsWith('/locations') && request.method() === 'GET') {
      return json(200, { requestId: 'r', result: { sessionToken: 'tok', locations: [{ id: 'g-Stavanger', mainText: 'Stavanger', secondaryText: 'Norway' }] } });
    }
    const structure = url.pathname.match(/^\/api\/trips\/(\d+)\/(days|route-stops)(?:\/(\d+|reorder))?$/);
    if (structure && request.method() !== 'GET' && !options.writeStatus && details[structure[1]]) {
      const detail = details[structure[1]];
      const list = structure[2] === 'days' ? detail.days : detail.stops;
      const body = request.postData() ? JSON.parse(request.postData()) : {};
      const byOrder = () => [...list].sort((a, b) => a.order - b.order);
      const renumber = (items) => items.forEach((item, index) => { item.order = index; });
      if (request.method() === 'DELETE') {
        const index = list.findIndex((item) => String(item.id) === structure[3]);
        list.splice(index, 1);
        if (structure[2] === 'route-stops') detail.days = detail.days.filter((d) => String(d.routeStopId) !== structure[3]);
        renumber(byOrder());
      } else if (request.method() === 'POST' && structure[3] === 'reorder') {
        body.orderedStopIds.forEach((id, index) => { list.find((item) => item.id === id).order = index; });
      } else if (request.method() === 'POST') {
        const created = structure[2] === 'days'
          ? { id: ++nextId, tripId: 1, routeStopId: body.routeStopId, order: body.order, title: body.title, description: body.description }
          : { id: ++nextId, tripId: 1, order: body.order, distance: 0, location: place(body.locationId.replace('g-', '')), plannedDays: 1 };
        const items = byOrder();
        items.splice(body.order, 0, created);
        list.push(created);
        renumber(items);
        options.requests?.length;
        return json(201, { requestId: 'r', result: created });
      } else if (request.method() === 'PUT' && body.order !== undefined) {
        const item = list.find((i) => String(i.id) === structure[3]);
        const items = byOrder().filter((i) => i !== item);
        items.splice(body.order, 0, item);
        renumber(items);
      }
      return json(200, { requestId: 'r', result: {} });
    }
    if (request.method() === 'POST' && /\/(days|route-stops|trips)$/.test(url.pathname)) {
      const created = { id: 900, ...(request.postData() ? JSON.parse(request.postData()) : {}) };
      if (!options.writeStatus) return json(201, { requestId: 'r', result: created });
    }
    if (request.method() !== 'GET') {
      if (options.writeStatus) return json(options.writeStatus, { error: 'boom' });
      if (/\/clone$/.test(url.pathname)) return json(201, { requestId: 'r', result: { id: 77, name: 'Copy' } });
      return json(200, { requestId: 'r', result: {} });
    }
    const tripPath = url.pathname.match(/^\/api\/trips\/(\d+)(\/[a-z-]+)?$/);
    if (tripPath) {
      const detail = details[tripPath[1]];
      if (options.detailStatus) return json(options.detailStatus, { error: 'no' });
      if (!detail) return json(404, { error: 'not found' });
      const part = tripPath[2];
      if (!part) return json(200, { requestId: 'r', result: detail.trip });
      if (part === '/route-stops') return json(200, { requestId: 'r', result: detail.stops });
      if (part === '/days') return json(200, { requestId: 'r', result: detail.days });
      if (part === '/validate') return detail.validation
        ? json(200, { requestId: 'r', result: detail.validation })
        : json(500, { error: 'validation down' });
    }
    if (url.pathname === '/api/trip-shares') return json(200, { requestId: 'r', result: options.sharedWithMe || [] });
    const sharesFor = url.pathname.match(/^\/api\/trip-shares\/(\d+)$/);
    if (sharesFor) return json(200, { requestId: 'r', result: (options.shares || {})[sharesFor[1]] || [] });
    if (url.pathname === '/api/profile') return json(200, { requestId: 'r', result: profile });
    return json(404, { error: 'not mocked' });
  });
}

module.exports = { mockApi, signIn, sampleTrips, sampleDetails };
