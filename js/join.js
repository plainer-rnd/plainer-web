// Page behind a share link: /join-shared-trip?code=<guid>.
// - iPhone/iPad: offers the app (if it isn't installed the link lands here), with the trip viewable as a second choice.
// - Everywhere else: shows the trip read-only, without logging in, with one action: log in to add it to your list.
// - Already signed in: that one action is "Add to my trips".
import { el, svg } from './dom.js';
import { createApi } from './api.js';
import { fetchLinkPreview } from './public-api.js';
import { createTripMap } from './trip-map.js';
import { parseStartDate } from './trips-model.js';
import {
  stopFromDto, dayFromDto, buildItinerary, tripDatesLabel, dayDateLabel, stopMeta, plural, mapPins,
} from './trip-model.js';
import {
  APP_STORE_URL, appOpenUrl, isIosDevice, joinErrorMessage, loginUrl, parseJoinCode, previewErrorKind, previewErrorText,
} from './join-model.js';

const nodes = {
  skeleton: document.getElementById('skeleton'),
  message: document.getElementById('message'),
  landing: document.getElementById('app-landing'),
  app: document.getElementById('join-app'),
  cta: document.getElementById('join-cta'),
  barTitle: document.getElementById('join-bar-title'),
  barSub: document.getElementById('join-bar-sub'),
  error: document.getElementById('join-error'),
  name: document.getElementById('join-name'),
  meta: document.getElementById('join-meta'),
  mapPane: document.getElementById('pane-map'),
  daysList: document.getElementById('days-list'),
  routeList: document.getElementById('route-list'),
  daysSub: document.getElementById('days-sub'),
  routeSub: document.getElementById('route-sub'),
};

const state = { code: null, trip: null, groups: [], expanded: new Set(), user: null, api: null };
const tripMap = createTripMap({ section: nodes.mapPane, canvas: document.getElementById('trip-map') });

function showMessage(title, text, action) {
  nodes.skeleton.hidden = true;
  nodes.app.hidden = true;
  nodes.landing.hidden = true;
  nodes.message.hidden = false;
  nodes.message.replaceChildren(el('div', { class: 'state', role: 'alert' }, [el('h2', { text: title }), el('p', { class: 'muted', text }), action]));
}

function chevron(open) {
  const icon = svg(open ? '<path d="M6 15l6-6 6 6"></path>' : '<path d="M6 9l6 6 6-6"></path>');
  icon.setAttribute('viewBox', '0 0 24 24');
  ['width', 'height'].forEach((name) => icon.setAttribute(name, '18'));
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

// ---- the one action ----

async function addToMyTrips(button) {
  button.disabled = true;
  nodes.error.textContent = '';
  try {
    const trip = await state.api.get(`links/${state.code}`);
    location.assign('/trip/?id=' + encodeURIComponent(trip.id));
  } catch (failure) {
    nodes.error.textContent = joinErrorMessage(failure.status, failure.message);
    button.disabled = false;
  }
}

function renderCta() {
  if (state.user) {
    nodes.barSub.textContent = 'It’s read-only. Add it to your list to see it in the app and on the web.';
    const add = el('button', { type: 'button', class: 'btn btn-primary', text: 'Add to my trips' });
    add.addEventListener('click', () => addToMyTrips(add));
    nodes.cta.replaceChildren(add);
  } else {
    nodes.barSub.textContent = 'It’s read-only. Log in, or create an account, to add it to your list.';
    nodes.cta.replaceChildren(el('a', { class: 'btn btn-primary', href: loginUrl(state.code, location.pathname), text: 'Log in to add this trip to your list' }));
  }
}

// ---- the trip, read-only ----

function dayRow(day) {
  const open = state.expanded.has(day.id);
  const date = dayDateLabel(state.trip.startDate, day);
  const toggle = el('button', {
    type: 'button', class: 'icon-btn plain sm', 'aria-expanded': String(open), 'aria-controls': `day-${day.id}-plan`,
    'aria-label': `${open ? 'Collapse' : 'Expand'} day ${day.number}`,
  }, chevron(open));
  toggle.addEventListener('click', () => {
    if (state.expanded.has(day.id)) state.expanded.delete(day.id);
    else state.expanded.add(day.id);
    renderDays();
    document.querySelector(`[aria-controls="day-${day.id}-plan"]`).focus();
  });
  const row = el('div', { class: 'hrow day-row' }, [
    el('span', { class: 'num', text: String(day.number) }),
    el('div', { class: 'day-text' }, [
      el('span', { class: 'day-title', text: day.title || `Day ${day.number}` }),
      date ? el('span', { class: 'muted small', text: date }) : null,
      !open && day.plan[0] ? el('span', { class: 'muted small clamp1', text: day.plan[0] }) : null,
    ]),
    toggle,
  ]);
  const parts = [row];
  if (open) {
    parts.push(el('div', { class: 'day-plan', id: `day-${day.id}-plan` }, [
      el('span', { class: 'label', text: 'Plan' }),
      ...(day.plan.length ? day.plan.map((line) => el('p', { class: 't2', text: line })) : [el('p', { class: 'muted', text: 'Nothing planned for this day yet.' })]),
    ]));
  }
  return el('div', {}, parts);
}

function renderDays() {
  const groups = state.groups.map((group) => el('div', { class: 'group', ...(group.stop.id !== null ? { 'data-stop-id': String(group.stop.id) } : {}) }, [
    el('div', { class: 'ghead' }, el('b', { text: `${group.stop.name} · ${plural(group.days.length, 'day')}` })),
    ...(group.days.length ? group.days.map(dayRow) : [el('p', { class: 'muted empty-note', text: 'No days planned yet.' })]),
  ]));
  nodes.daysList.replaceChildren(...(groups.length ? groups : [el('p', { class: 'muted empty-note', text: 'No stops or days yet.' })]));
  pointAtStop(pointed);
}

function renderRoute() {
  const rows = state.groups.filter((group) => group.stop.id !== null).map((group, index) => el('div', { class: 'stop-row', 'data-stop-id': String(group.stop.id) }, [
    el('span', { class: 'num', text: String(index + 1) }),
    el('span', { class: 'day-text' }, [el('span', { class: 'day-title', text: group.stop.name }), el('span', { class: 'muted small', text: stopMeta(group.stop, group.days.length) })]),
  ]));
  nodes.routeList.replaceChildren(...(rows.length ? rows : [el('p', { class: 'muted empty-note', text: 'This trip has no stops yet.' })]));
  pointAtStop(pointed);
}

// Pointing at a stop (mouse or keyboard) lights it up in both lists and on the map, like on the trip page.
let pointed = null;
function pointAtStop(id) {
  pointed = id;
  tripMap.highlight(id);
  document.querySelectorAll('[data-stop-id]').forEach((node) => {
    node.classList.toggle('is-pointed', id !== null && node.dataset.stopId === String(id));
  });
}

function watchStops(list) {
  const idOf = (event) => {
    const holder = event.target.closest && event.target.closest('[data-stop-id]');
    return holder && list.contains(holder) ? Number(holder.dataset.stopId) : null;
  };
  if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    list.addEventListener('mouseover', (event) => pointAtStop(idOf(event)));
    list.addEventListener('mouseleave', () => pointAtStop(null));
  }
  list.addEventListener('focusin', (event) => pointAtStop(idOf(event)));
  list.addEventListener('focusout', () => pointAtStop(null));
}

function renderTrip() {
  const { trip } = state;
  document.title = `${trip.name} | Plainer`;
  nodes.name.textContent = trip.name;
  const days = state.groups.reduce((count, group) => count + group.days.length, 0);
  const stops = state.groups.filter((group) => group.stop.id !== null).length;
  nodes.meta.replaceChildren(
    el('span', { text: tripDatesLabel(trip.startDate, days) }),
    el('span', { class: 'muted', 'aria-hidden': 'true', text: '·' }),
    el('span', { text: `${plural(stops, 'stop')} · ${plural(days, 'day')}` }),
  );
  nodes.daysSub.textContent = '';
  nodes.routeSub.textContent = `· ${plural(stops, 'stop')}`;
  renderCta();
  renderDays();
  renderRoute();
  tripMap.update(mapPins(state.groups));
}

function showTrip() {
  nodes.skeleton.hidden = true;
  nodes.message.hidden = true;
  nodes.landing.hidden = true;
  nodes.app.hidden = false;
  renderTrip();
}

// ---- iPhone and iPad ----

function showAppLanding() {
  nodes.skeleton.hidden = true;
  nodes.app.hidden = true;
  nodes.landing.hidden = false;
  const open = el('a', { class: 'btn btn-primary', href: appOpenUrl(state.code), text: 'Open in the Plainer app' });
  const store = el('a', { class: 'btn btn-outline', href: APP_STORE_URL, text: 'Get Plainer on the App Store' });
  const view = el('button', { type: 'button', class: 'link-btn', text: 'Just view the trip here' });
  view.addEventListener('click', showTrip);
  nodes.landing.replaceChildren(
    el('b', { id: 'landing-title', class: 'card-title', text: state.trip.name }),
    el('span', { class: 't2', text: 'A trip was shared with you on Plainer. Open it in the app to add it to your trips, or get the app first.' }),
    el('div', { class: 'join-landing-actions' }, [open, store]),
    view,
  );
}

// ---- start ----

async function currentUser() {
  try {
    const firebase = await import('./firebase.js');
    return await firebase.getUser();
  } catch (error) {
    return null; // no login available here (for example the Prod Firebase config isn't set): the trip is still shown
  }
}

async function start() {
  state.code = parseJoinCode(location.search);
  if (!state.code) {
    showMessage('This link doesn’t look right', 'Check that you copied the whole link, or ask for a new one.', el('a', { class: 'btn btn-primary', href: '/', text: 'Go to plainer.co.uk' }));
    return;
  }
  let preview;
  try {
    preview = await fetchLinkPreview(state.code);
  } catch (failure) {
    const kind = previewErrorKind(failure.status);
    const retry = kind === 'expired'
      ? el('a', { class: 'btn btn-primary', href: '/', text: 'Go to plainer.co.uk' })
      : el('button', { type: 'button', class: 'btn btn-primary', text: 'Try again' });
    if (kind !== 'expired') retry.addEventListener('click', () => { nodes.message.hidden = true; nodes.skeleton.hidden = false; start(); });
    showMessage(kind === 'expired' ? 'This link has expired' : 'We couldn’t load this trip', previewErrorText(kind), retry);
    return;
  }
  const trip = preview.trip || {};
  state.trip = { name: trip.name || 'Shared trip', startDate: parseStartDate(trip.startDate), description: trip.description || null };
  const stops = (preview.routeStops || []).map(stopFromDto);
  const days = (preview.days || []).map(dayFromDto);
  state.groups = buildItinerary(stops, days);
  const first = state.groups.flatMap((group) => group.days)[0];
  if (first) state.expanded.add(first.id);
  watchStops(nodes.routeList);
  watchStops(nodes.daysList);
  tripMap.onPoint(pointAtStop);

  state.user = await currentUser();
  if (state.user) state.api = createApi(state.user);

  if (isIosDevice({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints })) showAppLanding();
  else showTrip();
}

start();
