import { requireUser, signOut } from './firebase.js';
import { initAppHeader } from './app-header.js';
import { createApi } from './api.js';
import { userInitial } from './user-display.js';
import {
  tripFromDto, splitTrips, filterTrips, resolveStatus, coverFor, initialOf, datesLabel, ownerLabel,
  tripsCountLabel, isShared,
} from './trips-model.js';
import { el, svg } from './dom.js';
import { confirmDialog, openDialog } from './dialogs.js';
import { newTripBody, parseDateInput } from './trip-model.js';

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

let api = null;
let menuState = null;

function closeMenu({ restoreFocus = true } = {}) {
  if (!menuState) return;
  const { menu, button } = menuState;
  menuState = null;
  menu.remove();
  button.setAttribute('aria-expanded', 'false');
  if (restoreFocus) button.focus();
}

async function refresh() {
  await load(api);
  render();
}

async function duplicate(trip) {
  try {
    await api.post(`trips/${trip.id}/clone`);
    await refresh();
    nodes.announce.textContent = `Duplicated “${trip.name}”.`;
  } catch (error) {
    nodes.announce.textContent = 'Couldn’t duplicate that trip. Please try again.';
  }
}

function remove(trip) {
  confirmDialog({
    title: 'Delete this trip?',
    text: `“${trip.name}” and everything in it will be deleted. This can’t be undone.`,
    okLabel: 'Delete trip',
    run: async () => { await api.delete(`trips/${trip.id}`); await refresh(); },
  });
}

function leave(trip) {
  confirmDialog({
    title: 'Leave this trip?',
    text: `“${trip.name}” will disappear from your list. Ask ${trip.sharedBy || 'the owner'} to share it again if you change your mind.`,
    okLabel: 'Leave trip',
    run: async () => { await api.delete(`trip-shares/unsubscribe/${trip.id}`); await refresh(); },
  });
}

// One floating menu for every card and row; it is placed under the button that opened it.
function openMenu(button, trip) {
  const reopen = menuState && menuState.button === button;
  closeMenu({ restoreFocus: false });
  if (reopen) return;

  const item = (text, handler, className = '') => {
    const entry = el('button', { type: 'button', role: 'menuitem', class: className, text });
    entry.addEventListener('click', () => { closeMenu({ restoreFocus: false }); handler(); });
    return entry;
  };
  const items = [
    el('a', { role: 'menuitem', href: tripHref(trip), text: 'Open' }),
    ...(isShared(trip)
      ? [item('Leave trip…', () => leave(trip), 'danger')]
      : [item('Duplicate', () => duplicate(trip)), item('Delete…', () => remove(trip), 'danger')]),
  ];
  const menu = el('div', { class: 'menu trip-menu', role: 'menu', 'aria-label': `Actions for ${trip.name}` }, items);
  const box = button.getBoundingClientRect();
  menu.style.top = `${box.bottom + 6}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - box.right)}px`;
  document.body.append(menu);
  button.setAttribute('aria-expanded', 'true');
  menuState = { menu, button };
  items[0].focus();
}

function menuButton(trip) {
  const button = el('button', {
    type: 'button', class: 'icon-btn plain sm row-menu', 'aria-label': `Actions for ${trip.name}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
  }, svg('<circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle>'));
  const dots = button.firstChild;
  dots.setAttribute('width', '18'); dots.setAttribute('height', '18'); dots.setAttribute('viewBox', '0 0 24 24'); dots.setAttribute('fill', 'currentColor'); dots.setAttribute('aria-hidden', 'true');
  button.addEventListener('click', (event) => { event.stopPropagation(); openMenu(button, trip); });
  return button;
}

document.addEventListener('click', (event) => {
  if (menuState && !menuState.menu.contains(event.target)) closeMenu({ restoreFocus: false });
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuState) { event.preventDefault(); closeMenu(); }
});
window.addEventListener('resize', () => closeMenu({ restoreFocus: false }));

function newTripDialog() {
  const name = el('input', { type: 'text', class: 'picker-input', id: 'new-trip-name', maxlength: '100', autocomplete: 'off', required: true });
  const date = el('input', { type: 'date', class: 'picker-input', id: 'new-trip-date' });
  const error = el('p', { class: 'error', role: 'alert' });
  const cancel = el('button', { type: 'button', class: 'btn btn-outline', text: 'Cancel' });
  const create = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Create trip' });
  const form = el('form', { method: 'dialog', novalidate: true }, [
    el('label', { class: 'label', for: 'new-trip-name', text: 'Trip name' }), name,
    el('label', { class: 'label', for: 'new-trip-date', text: 'Start date (optional)' }), date,
    error,
    el('div', { class: 'dialog-actions' }, [cancel, create]),
  ]);
  const { close } = openDialog({ title: 'New trip', content: [form] });
  cancel.addEventListener('click', close);
  name.focus();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = name.value.trim();
    if (!title) { error.textContent = 'Give your trip a name.'; name.focus(); return; }
    create.disabled = true;
    error.textContent = '';
    try {
      const created = await api.post('trips', newTripBody(title, parseDateInput(date.value)));
      location.assign('/trip/?id=' + encodeURIComponent(created.id));
    } catch (failure) {
      error.textContent = 'Couldn’t create the trip. Please try again.';
      create.disabled = false;
    }
  });
}

function tripCard(trip, user) {
  const owner = ownerLabel(trip, state.sharedWithCounts.get(trip.id) || 0);
  const card = el('a', { class: 'tcard cover-' + coverFor(trip.id), href: tripHref(trip) }, [
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
  return el('div', { class: 'tcard-wrap' }, [card, menuButton(trip)]);
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
    el('td', { class: 'col-menu' }, menuButton(trip)),
  ]);
}

function tripTable(trips) {
  const head = el('tr', {}, [
    el('th', { scope: 'col', text: 'Trip' }),
    el('th', { scope: 'col', class: 'col-dates', text: 'Dates' }),
    el('th', { scope: 'col', class: 'col-status', text: 'Status' }),
    el('th', { scope: 'col', class: 'col-owner', text: 'Owner' }),
    el('th', { scope: 'col', class: 'col-menu' }, el('span', { class: 'visually-hidden', text: 'Actions' })),
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
  const create = el('button', { type: 'button', class: 'btn btn-primary', text: 'New trip' });
  create.addEventListener('click', newTripDialog);
  const getApp = el('a', { class: 'btn btn-outline', href: APP_STORE_URL, text: 'Get the iPhone app' });
  return stateBlock('No trips yet', 'Start a trip here, or plan one in the Plainer iPhone app.', el('div', { class: 'dialog-actions' }, [create, getApp]));
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
    api = createApi(currentUser);
    await load(api);
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

document.getElementById('new-trip').addEventListener('click', newTripDialog);
