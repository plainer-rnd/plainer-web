import { requireUser, signOut } from './firebase.js';
import { initAppHeader } from './app-header.js';
import { createApi } from './api.js';
import { userInitial } from './user-display.js';
import {
  tripFromDto, splitTrips, filterTrips, resolveStatus, coverFor, initialOf, datesLabel, ownerLabel,
  tripsCountLabel, isShared,
} from './trips-model.js';
import { el, svg } from './dom.js';

const VIEW_KEY = 'plainerTripsView';
const STATUS_LABEL = { draft: 'Draft', upcoming: 'Upcoming', active: 'Active' };
const APP_STORE_URL = 'https://apps.apple.com/app/id6740170760';

const state = {
  mine: [],
  shared: [],
  sharedWithCounts: new Map(),
  tab: 'mine',
  status: 'all',
  query: '',
  view: readView(),
};

const nodes = {
  skeleton: document.getElementById('skeleton'),
  app: document.getElementById('trips-app'),
  sub: document.getElementById('page-sub'),
  tabs: Array.from(document.querySelectorAll('[data-tab]')),
  chips: Array.from(document.querySelectorAll('[data-status]')),
  views: Array.from(document.querySelectorAll('[data-view]')),
  search: document.getElementById('search'),
  results: document.getElementById('results'),
  announce: document.getElementById('results-status'),
};

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards';
  } catch (e) {
    return 'cards';
  }
}

function saveView(view) {
  try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* storage blocked: the choice just isn't remembered */ }
}

function tripHref(trip) {
  return '/trip/?id=' + encodeURIComponent(trip.id);
}

function routeLine() {
  const line = svg('<path d="M-10 100 C 60 60, 110 120, 170 80 S 260 30, 320 40" fill="none" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"></path>');
  line.setAttribute('viewBox', '0 0 300 132');
  line.setAttribute('preserveAspectRatio', 'none');
  line.setAttribute('aria-hidden', 'true');
  return line;
}

function statusBadge(trip) {
  const status = resolveStatus(trip);
  return el('span', { class: 'badge b-' + status, text: STATUS_LABEL[status] });
}

function ownerInitial(trip, user) {
  return isShared(trip) ? initialOf(trip.sharedBy || '?') : userInitial(user);
}

function tripCard(trip, user) {
  const owner = ownerLabel(trip, state.sharedWithCounts.get(trip.id) || 0);
  return el('a', { class: 'tcard cover-' + coverFor(trip.id), href: tripHref(trip) }, [
    el('div', { class: 'cover' }, [
      routeLine(),
      statusBadge(trip),
      el('span', { class: 'cover-letter', 'aria-hidden': 'true', text: initialOf(trip.name) }),
    ]),
    el('div', { class: 'tcard-body' }, [
      el('h2', { class: 'clamp1', text: trip.name }),
      el('span', { class: 'muted', text: datesLabel(trip) }),
    ]),
    el('div', { class: 'tcard-foot' }, [
      el('span', { class: 'avatar xs', 'aria-hidden': 'true', text: ownerInitial(trip, user) }),
      el('span', { class: 'muted clamp1', text: owner }),
    ]),
  ]);
}

function tripRow(trip) {
  const dates = datesLabel(trip);
  return el('tr', { class: 'trow cover-' + coverFor(trip.id) }, [
    el('td', { class: 'col-trip' }, el('div', { class: 'ttrip' }, [
      el('span', { class: 'ticon', 'aria-hidden': 'true', text: initialOf(trip.name) }),
      el('div', { class: 'tname' }, [
        el('a', { class: 'clamp1', href: tripHref(trip), text: trip.name }),
        el('span', { class: 'tsub', text: dates }),
      ]),
    ])),
    el('td', { class: 'col-dates', text: dates }),
    el('td', { class: 'col-status' }, statusBadge(trip)),
    el('td', { class: 'col-owner', text: ownerLabel(trip, state.sharedWithCounts.get(trip.id) || 0) }),
  ]);
}

function tripTable(trips) {
  const head = el('tr', {}, [
    el('th', { scope: 'col', text: 'Trip' }),
    el('th', { scope: 'col', class: 'col-dates', text: 'Dates' }),
    el('th', { scope: 'col', class: 'col-status', text: 'Status' }),
    el('th', { scope: 'col', class: 'col-owner', text: 'Owner' }),
  ]);
  return el('div', { class: 'tlist' }, el('table', {}, [
    el('thead', {}, head),
    el('tbody', {}, trips.map(tripRow)),
  ]));
}

function stateBlock(title, text, action) {
  return el('div', { class: 'state' }, [el('h2', { text: title }), el('p', { class: 'muted', text }), action]);
}

function emptyState(listIsEmpty) {
  if (!listIsEmpty) {
    const clear = el('button', { type: 'button', class: 'btn btn-outline', text: 'Clear search and filters' });
    clear.addEventListener('click', () => {
      state.status = 'all';
      state.query = '';
      nodes.search.value = '';
      render();
    });
    return stateBlock('No trips match your search', 'Try a different name or status.', clear);
  }
  if (state.tab === 'shared') {
    return stateBlock('Nothing shared with you yet', 'When someone shares a trip with you, it shows up here.');
  }
  const getApp = el('a', { class: 'btn btn-primary', href: APP_STORE_URL, text: 'Get the iPhone app' });
  return stateBlock('No trips yet', 'Trips you plan in the Plainer iPhone app show up here.', getApp);
}

function showError(error) {
  nodes.skeleton.hidden = true;
  nodes.app.hidden = false;
  const retry = el('button', { type: 'button', class: 'btn btn-primary', text: 'Try again' });
  retry.addEventListener('click', () => start());
  const message = error.status === 0
    ? 'Check your internet connection and try again.'
    : 'Something went wrong on our side. Please try again in a moment.';
  nodes.results.replaceChildren(el('div', { role: 'alert' }, stateBlock('We couldn’t load your trips', message, retry)));
}

let currentUser = null;

function render() {
  const list = state[state.tab];
  const visible = filterTrips(list, { status: state.status, query: state.query });

  nodes.tabs.forEach((tab) => {
    const selected = tab.dataset.tab === state.tab;
    tab.classList.toggle('on', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.querySelector('.count').textContent = String(state[tab.dataset.tab].length);
  });
  nodes.chips.forEach((chip) => {
    const on = chip.dataset.status === state.status;
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', String(on));
  });
  nodes.views.forEach((button) => {
    const on = button.dataset.view === state.view;
    button.classList.toggle('on', on);
    button.setAttribute('aria-pressed', String(on));
  });
  nodes.sub.textContent = tripsCountLabel(list.length, state.tab);

  if (visible.length === 0) {
    nodes.results.replaceChildren(emptyState(list.length === 0));
    nodes.announce.textContent = list.length === 0 ? '' : 'No trips match.';
    return;
  }
  const content = state.view === 'list'
    ? tripTable(visible)
    : el('div', { class: 'cards' }, visible.map((trip) => tripCard(trip, currentUser)));
  nodes.results.replaceChildren(content);
  nodes.announce.textContent = visible.length + (visible.length === 1 ? ' trip shown.' : ' trips shown.');
}

async function load(api) {
  const [tripDtos, sharedBy] = await Promise.all([
    api.get('trips', { includeShared: true }),
    // Only used for the "shared with N" label, so a failure here must not break the page.
    api.get('trip-shares/by').catch(() => []),
  ]);
  const { mine, shared } = splitTrips((tripDtos || []).map(tripFromDto));
  state.mine = mine;
  state.shared = shared;
  state.sharedWithCounts = new Map((sharedBy || []).map((entry) => [entry.tripId, (entry.shares || []).length]));
}

async function start() {
  nodes.skeleton.hidden = false;
  nodes.app.hidden = true;
  try {
    if (!currentUser) {
      currentUser = await requireUser();
      initAppHeader(currentUser);
    }
    await load(createApi(currentUser));
    nodes.skeleton.hidden = true;
    nodes.app.hidden = false;
    render();
  } catch (error) {
    if (error.status === 401) {
      await signOut();
      location.replace('/login/?next=' + encodeURIComponent('/trips/'));
      return;
    }
    showError(error);
  }
}

nodes.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    state.tab = tab.dataset.tab;
    render();
  });
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = nodes.tabs[(nodes.tabs.indexOf(tab) + 1) % nodes.tabs.length];
    state.tab = next.dataset.tab;
    render();
    next.focus();
  });
});
nodes.chips.forEach((chip) => chip.addEventListener('click', () => {
  state.status = chip.dataset.status;
  render();
}));
nodes.views.forEach((button) => button.addEventListener('click', () => {
  state.view = button.dataset.view;
  saveView(state.view);
  render();
}));
nodes.search.addEventListener('input', () => {
  state.query = nodes.search.value;
  render();
});

start();
