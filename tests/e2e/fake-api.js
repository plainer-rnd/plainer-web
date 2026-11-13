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
    options.requests?.push({ path: url.pathname, search: url.search, authorization: request.headers().authorization });
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.pathname === '/api/trips') return options.tripsStatus && options.tripsStatus !== 200
      ? json(options.tripsStatus, { error: 'boom' })
      : json(200, { requestId: 'r', result: trips });
    if (url.pathname === '/api/trip-shares/by') return json(200, { requestId: 'r', result: sharedBy });
    if (url.pathname === '/api/profile') return json(200, { requestId: 'r', result: profile });
    return json(404, { error: 'not mocked' });
  });
}

module.exports = { mockApi, signIn, sampleTrips };
