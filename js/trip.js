import { requireUser, signOut } from './firebase.js';
import { initAppHeader } from './app-header.js';
import { createApi } from './api.js';
import { tripFromDto, resolveStatus, isShared } from './trips-model.js';
import {
  stopFromDto, dayFromDto, buildItinerary, tripDatesLabel, dayDateLabel, overviewOf, validationValue,
  stopMeta, sharedPeople, parseTripId, plural, hasPlan,
} from './trip-model.js';
import { el, svg } from './dom.js';

const STATUS_LABEL = { draft: 'Draft', upcoming: 'Upcoming', active: 'Active' };

// One plain object holds everything the page shows, so later editing only has to change it and re-render.
const state = {
  trip: null,
  stops: [],
  days: [],
  groups: [],
  validation: null,
  people: [],
  sharedBy: null,
  expanded: new Set(),
  pane: 'overview',
};

const nodes = {
  skeleton: document.getElementById('skeleton'),
  message: document.getElementById('message'),
  app: document.getElementById('trip-app'),
  name: document.getElementById('trip-name'),
  status: document.getElementById('trip-status'),
  dates: document.getElementById('trip-dates'),
  owner: document.getElementById('trip-owner'),
  people: document.getElementById('trip-people'),
  overview: document.getElementById('pane-overview'),
  daysSub: document.getElementById('days-sub'),
  daysList: document.getElementById('days-list'),
  routeSub: document.getElementById('route-sub'),
  routeList: document.getElementById('route-list'),
  panes: Array.from(document.querySelectorAll('.pane[data-pane]')),
  paneTabs: Array.from(document.querySelectorAll('.pane-tabs [data-pane]')),
};

function chevron(open) {
  const icon = svg('<path d="M6 9l6 6 6-6"></path>');
  ['width', 'height'].forEach((name) => icon.setAttribute(name, '18'));
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  if (open) icon.style.transform = 'rotate(180deg)';
  return icon;
}

function statBlock(value, label, className) {
  return el('div', { class: 'stat' }, [el('b', { class: className, text: value }), el('span', { class: 'muted', text: label })]);
}

function renderOverview() {
  const overview = overviewOf(state.stops, state.days, state.validation);
  const stats = el('div', { class: 'panel stats' }, [
    statBlock(String(overview.stopCount), 'Stops'),
    statBlock(String(overview.dayCount), 'Days'),
    statBlock(validationValue(overview), 'Validation', overview.issues ? 'warn' : ''),
  ]);

  const progress = el('div', { class: 'panel card-pad' }, [
    el('b', { class: 'card-title', text: 'Planning progress' }),
    el('span', { class: 't2', text: overview.progressLabel }),
    el('div', {
      class: 'bar', role: 'progressbar', 'aria-label': 'Planning progress',
      'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(overview.progressPercent),
    }, el('i', { style: `width:${overview.progressPercent}%` })),
  ]);

  const cards = [stats, progress];
  if (overview.issues > 0) {
    cards.push(el('div', { class: 'panel card-pad attention' }, [
      el('b', { class: 'card-title', text: `Fix ${plural(overview.issues, 'validation issue')}` }),
      el('span', { class: 't2', text: 'Open this trip in the Plainer app to review the suggestions.' }),
    ]));
  }
  nodes.overview.replaceChildren(...cards);
}

function dayRow(day) {
  const open = state.expanded.has(day.id);
  const date = dayDateLabel(state.trip.startDate, day);
  const preview = day.plan[0];

  const toggle = el('button', {
    type: 'button', class: 'icon-btn plain sm',
    'aria-expanded': String(open), 'aria-controls': `day-${day.id}-plan`,
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
      !open && preview ? el('span', { class: 'muted small clamp1', text: preview }) : null,
    ]),
    toggle,
  ]);

  const parts = [row];
  if (open) {
    const plan = day.plan.length
      ? day.plan.map((line) => el('p', { class: 't2', text: line }))
      : [el('p', { class: 'muted', text: 'Nothing planned for this day yet.' })];
    parts.push(el('div', { class: 'day-plan', id: `day-${day.id}-plan` }, [el('span', { class: 'label', text: 'Plan' }), ...plan]));
  }
  return el('div', {}, parts);
}

function renderDays() {
  const groups = state.groups.map((group) => {
    const body = group.days.length
      ? group.days.map(dayRow)
      : [el('p', { class: 'muted empty-note', text: 'No days planned yet.' })];
    return el('div', { class: 'group' }, [
      el('div', { class: 'ghead' }, el('b', { text: `${group.stop.name} · ${plural(group.days.length, 'day')}` })),
      ...body,
    ]);
  });
  nodes.daysList.replaceChildren(...(groups.length ? groups : [el('p', { class: 'muted empty-note', text: 'No stops or days yet. Plan them in the Plainer app.' })]));
}

function renderRoute() {
  const rows = state.groups.filter((group) => group.stop.id !== null).map((group, index) => (
    el('div', { class: 'hrow stop-row' }, [
      el('span', { class: 'num', text: String(index + 1) }),
      el('div', { class: 'day-text' }, [
        el('span', { class: 'day-title', text: group.stop.name }),
        el('span', { class: 'muted small', text: stopMeta(group.stop, group.days.length) }),
      ]),
    ])
  ));
  nodes.routeList.replaceChildren(...(rows.length ? rows : [el('p', { class: 'muted empty-note', text: 'This trip has no stops yet.' })]));
}

function renderHeader() {
  const { trip } = state;
  const status = resolveStatus(trip);
  document.title = `${trip.name} | Plainer`;
  nodes.name.textContent = trip.name;
  nodes.status.className = `badge b-${status}`;
  nodes.status.textContent = STATUS_LABEL[status];
  nodes.dates.textContent = tripDatesLabel(trip.startDate, state.days.length);
  nodes.owner.textContent = isShared(trip) ? `Shared by ${trip.sharedBy || 'a traveler'}` : 'Owned by you';

  nodes.people.replaceChildren();
  if (state.people.length) {
    nodes.people.append(el('span', { text: 'Shared with ' }));
    state.people.forEach((person, index) => {
      nodes.people.append(el('span', {
        class: 'avatar xs', style: `background:${person.colour};${index ? 'margin-left:-6px' : ''}`,
        title: person.label, 'aria-label': person.label, text: person.initial,
      }));
    });
  }
}

function renderPanes() {
  nodes.panes.forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === state.pane));
  nodes.paneTabs.forEach((tab) => {
    const on = tab.dataset.pane === state.pane;
    tab.classList.toggle('on', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
}

function render() {
  renderHeader();
  renderOverview();
  renderDays();
  renderRoute();
  renderPanes();
  nodes.daysSub.textContent = `· ${plural(state.days.filter(hasPlan).length, 'day')} with a plan`;
  nodes.routeSub.textContent = `· ${plural(state.stops.length, 'stop')}`;
}

function showMessage(title, text, action, role) {
  nodes.skeleton.hidden = true;
  nodes.app.hidden = true;
  nodes.message.hidden = false;
  nodes.message.replaceChildren(el('div', { class: 'state', role }, [el('h2', { text: title }), el('p', { class: 'muted', text }), action]));
}

function notFound() {
  showMessage('Trip not found', 'It may have been deleted, or you may not have access to it.', el('a', { class: 'btn btn-primary', href: '/trips/', text: 'Back to all trips' }), 'alert');
}

function failed(error, retry) {
  const button = el('button', { type: 'button', class: 'btn btn-primary', text: 'Try again' });
  button.addEventListener('click', retry);
  const text = error.status === 0
    ? 'Check your internet connection and try again.'
    : 'Something went wrong on our side. Please try again in a moment.';
  showMessage('We couldn’t load this trip', text, button, 'alert');
}

// Optional extras never block the page: a failure just leaves that part out.
const optional = (promise, fallback) => promise.catch(() => fallback);

async function load(api, id) {
  const [dto, stops, days, validation, shares, sharedWithMe] = await Promise.all([
    api.get(`trips/${id}`),
    api.get(`trips/${id}/route-stops`),
    api.get(`trips/${id}/days`),
    optional(api.get(`trips/${id}/validate`), null),
    optional(api.get(`trip-shares/${id}`), []),
    optional(api.get('trip-shares'), []),
  ]);
  state.trip = tripFromDto(dto);
  const asShared = (sharedWithMe || []).find((trip) => String(trip.id) === String(id));
  if (asShared && !isShared(state.trip)) Object.assign(state.trip, { shareId: asShared.shareId ?? 0, sharedBy: asShared.sharedBy ?? null });
  state.stops = (stops || []).map(stopFromDto);
  state.days = (days || []).map(dayFromDto);
  state.groups = buildItinerary(state.stops, state.days);
  state.validation = validation;
  state.people = isShared(state.trip) ? [] : sharedPeople(shares);
  const first = state.groups.flatMap((group) => group.days)[0];
  if (first) state.expanded.add(first.id);
}

function wirePaneTabs() {
  nodes.paneTabs.forEach((tab) => tab.addEventListener('click', () => {
    state.pane = tab.dataset.pane;
    renderPanes();
  }));
}

async function start() {
  const id = parseTripId(location.search);
  const user = await requireUser();
  initAppHeader(user);
  if (!id) return notFound();

  nodes.skeleton.hidden = false;
  nodes.message.hidden = true;
  try {
    await load(createApi(user), id);
  } catch (error) {
    if (error.status === 401) {
      await signOut();
      location.replace('/login/');
      return;
    }
    if (error.status === 403 || error.status === 404) return notFound();
    return failed(error, start);
  }
  render();
  nodes.skeleton.hidden = true;
  nodes.app.hidden = false;
}

wirePaneTabs();
start();
