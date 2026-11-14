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
  const sharedBy = options.sharedBy || [{ tripId: 2, shares: [{ sharedWith: 'a@x.co', shareId: 1 }, { sharedWith: 'b@x.co', shareId: 2 }] }];
  const profile = options.profile || { email: 'olena@example.com', displayName: 'Olena From API' };
  await page.route('https://api.test/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    options.requests?.push({ method: request.method(), path: url.pathname, search: url.search, authorization: request.headers().authorization, body: request.postData() ? JSON.parse(request.postData()) : null });
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.pathname === '/api/trips') return options.tripsStatus && options.tripsStatus !== 200
      ? json(options.tripsStatus, { error: 'boom' })
      : json(200, { requestId: 'r', result: trips });
    if (url.pathname === '/api/trip-shares/by') return json(200, { requestId: 'r', result: sharedBy });
    if (request.method() !== 'GET') {
      if (options.writeStatus) return json(options.writeStatus, { error: 'boom' });
      if (/\/clone$/.test(url.pathname)) return json(201, { requestId: 'r', result: { id: 77, name: 'Copy' } });
      return json(200, { requestId: 'r', result: {} });
    }
    const tripPath = url.pathname.match(/^\/api\/trips\/(\d+)(\/[a-z-]+)?$/);
    if (tripPath) {
      const detail = (options.details || sampleDetails)[tripPath[1]];
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
