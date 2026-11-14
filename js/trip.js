import { requireUser, signOut } from './firebase.js';
import { initAppHeader } from './app-header.js';
import { createApi } from './api.js';
import { tripFromDto, resolveStatus, isShared } from './trips-model.js';
import {
  stopFromDto, dayFromDto, buildItinerary, tripDatesLabel, dayDateLabel, overviewOf, validationValue,
  stopMeta, sharedPeople, parseTripId, plural, hasPlan,
  textToLines, linesToHtml, sameLines, dateInputValue, parseDateInput, dateToApi, TRANSPORT_TYPES,
} from './trip-model.js';
import { el, svg } from './dom.js';
import { editable } from './inline-edit.js';
import { createSaveQueue } from './save-queue.js';

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
  editingStop: null,
  api: null,
  id: null,
};

const canEdit = () => !isShared(state.trip);

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
  saveStatus: document.getElementById('save-status'),
  saveText: document.getElementById('save-text'),
  saveRetry: document.getElementById('save-retry'),
  live: document.getElementById('trip-status-live'),
  readonlyNote: document.getElementById('readonly-note'),
  menuWrap: document.getElementById('trip-menu-wrap'),
  menuButton: document.getElementById('trip-menu-button'),
  menu: document.getElementById('trip-menu'),
  confirm: document.getElementById('confirm'),
};

// ---- autosave ----

const SAVE_TEXT = { saving: 'Saving…', saved: '✓ All changes saved', error: 'Couldn’t save' };

const queue = createSaveQueue({
  onChange(status) {
    nodes.saveStatus.hidden = status === 'idle';
    nodes.saveStatus.dataset.status = status;
    nodes.saveText.textContent = SAVE_TEXT[status] || '';
    nodes.saveRetry.hidden = status !== 'error';
    nodes.live.textContent = status === 'error' ? 'Couldn’t save your last change. Retry is available.' : SAVE_TEXT[status] || '';
    if (status === 'error') render();
  },
});

nodes.saveRetry.addEventListener('click', () => queue.retry().then(render));
window.addEventListener('beforeunload', (event) => {
  if (queue.isBusy()) event.preventDefault();
});

// Applies a change on screen straight away and sends it in the background.
function save({ key, apply, send, revert }) {
  queue.submit({ key, apply: () => { apply(); render(); }, send, revert: (error) => { revert(error); render(); } });
}

function tripBody() {
  const { trip } = state;
  return { name: trip.name, startDate: trip.startDate ? dateToApi(trip.startDate) : '0001-01-01T00:00:00Z', description: trip.description, isDraft: trip.isDraft };
}

function editTrip(field, value) {
  const previous = state.trip[field];
  save({
    key: 'trip',
    apply: () => { state.trip[field] = value; },
    send: () => state.api.put(`trips/${state.id}`, tripBody()),
    revert: () => { state.trip[field] = previous; },
  });
}

function editDay(day, patch, body) {
  const previous = {};
  Object.keys(patch).forEach((name) => { previous[name] = day[name]; });
  save({
    key: `day-${day.id}`,
    apply: () => Object.assign(day, patch),
    send: () => state.api.put(`trips/${state.id}/days/${day.id}`, body),
    revert: () => Object.assign(day, previous),
  });
}

function editStop(stop, patch, body) {
  const previous = {};
  Object.keys(patch).forEach((name) => { previous[name] = stop[name]; });
  save({
    key: `stop-${stop.id}`,
    apply: () => Object.assign(stop, patch),
    send: () => state.api.put(`trips/${state.id}/route-stops/${stop.id}`, body),
    revert: () => Object.assign(stop, previous),
  });
}


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
      canEdit()
        ? editable({ value: day.title, display: day.title || `Day ${day.number}`, label: `title of day ${day.number}`, className: 'day-title', onCommit: (title) => editDay(day, { title }, { title }) })
        : el('span', { class: 'day-title', text: day.title || `Day ${day.number}` }),
      date ? el('span', { class: 'muted small', text: date }) : null,
      !open && preview ? el('span', { class: 'muted small clamp1', text: preview }) : null,
    ]),
    toggle,
  ]);

  const parts = [row];
  if (open) {
    const commitPlan = (text) => {
      const lines = textToLines(text);
      if (sameLines(lines, day.plan)) return;
      editDay(day, { plan: lines }, { description: linesToHtml(lines) });
    };
    const plan = canEdit()
      ? [editable({ value: day.plan.join('\n'), label: `plan for day ${day.number}`, placeholder: 'Add a plan for this day', multiline: true, className: 'plan-edit t2', onCommit: commitPlan })]
      : day.plan.length
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

function stepperFor(stop) {
  const planned = (delta) => {
    const next = stop.plannedDays + delta;
    if (next < 1) return;
    editStop(stop, { plannedDays: next }, { plannedDays: next });
  };
  const minus = el('button', { type: 'button', 'aria-label': `Fewer planned days for ${stop.name}`, text: '−' });
  const plus = el('button', { type: 'button', 'aria-label': `More planned days for ${stop.name}`, text: '+' });
  minus.disabled = stop.plannedDays <= 1;
  minus.addEventListener('click', () => planned(-1));
  plus.addEventListener('click', () => planned(1));
  return el('div', { class: 'stepper', role: 'group', 'aria-label': `Planned days for ${stop.name}` }, [minus, el('span', { text: String(stop.plannedDays) }), plus]);
}

function transportSelect(stop) {
  const select = el('select', { class: 'transport-select', id: `transport-${stop.id}`, 'aria-label': `Getting to ${stop.name}` }, [
    el('option', { value: '', text: 'Not set' }),
    ...TRANSPORT_TYPES.map((type) => el('option', { value: type, text: type })),
  ]);
  select.value = stop.transport || '';
  select.addEventListener('change', () => {
    if (!select.value) { select.value = stop.transport || ''; return; }
    editStop(stop, { transport: select.value }, { transport: select.value });
  });
  return select;
}

const PENCIL = '<path d="M4 20h4L19 9l-4-4L4 16z"></path>';

function closeStopEditor() {
  const id = state.editingStop;
  state.editingStop = null;
  render();
  const opener = id === null ? null : document.querySelector(`[data-stop-open="${id}"]`);
  if (opener) opener.focus();
}

// One compact row per stop. Opening a stop turns just that row into an editor; only one is open at a time.
function stopRow(group, index) {
  const { stop } = group;
  const number = el('span', { class: 'num', text: String(index + 1) });

  if (canEdit() && state.editingStop === stop.id) {
    const done = el('button', { type: 'button', class: 'btn btn-primary btn-sm done-btn', 'aria-label': 'Done', title: 'Done', text: '✅' });
    done.addEventListener('click', closeStopEditor);
    const editor = el('div', { class: 'stop-row stop-edit', role: 'group', 'aria-label': `Editing ${stop.name}` }, [
      number,
      el('div', { class: 'stop-edit-body' }, [
        el('span', { class: 'day-title', text: stop.name }),
        el('div', { class: 'stop-edit-fields' }, [
          el('div', { class: 'edit-field' }, [el('span', { class: 'field-label', 'aria-hidden': 'true', text: 'Planned days' }), stepperFor(stop)]),
          el('div', { class: 'edit-field' }, [el('label', { class: 'field-label', for: `transport-${stop.id}`, text: 'Transport' }), transportSelect(stop)]),
          done,
        ]),
      ]),
    ]);
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); closeStopEditor(); }
    });
    return editor;
  }

  const text = el('span', { class: 'day-text' }, [
    el('span', { class: 'day-title', text: stop.name }),
    el('span', { class: 'muted small', text: stopMeta(stop, group.days.length) }),
  ]);
  if (!canEdit()) return el('div', { class: 'stop-row' }, [number, text]);

  const open = el('button', { type: 'button', class: 'stop-open', 'data-stop-open': String(stop.id), 'aria-label': `Edit stop ${stop.name}`, 'aria-expanded': 'false' }, [
    text,
    (() => { const icon = svg(PENCIL); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('width', '16'); icon.setAttribute('height', '16'); icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '2'); icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round'); icon.setAttribute('aria-hidden', 'true'); icon.classList.add('pencil'); return icon; })(),
  ]);
  open.addEventListener('click', () => {
    state.editingStop = stop.id;
    render();
    const done = document.querySelector('.stop-edit .stepper button:not(:disabled)');
    if (done) done.focus();
  });
  return el('div', { class: 'stop-row' }, [number, open]);
}

function renderRoute() {
  const rows = state.groups.filter((group) => group.stop.id !== null).map(stopRow);
  nodes.routeList.replaceChildren(...(rows.length ? rows : [el('p', { class: 'muted empty-note', text: 'This trip has no stops yet.' })]));
}

function renderHeader() {
  const { trip } = state;
  const status = resolveStatus(trip);
  document.title = `${trip.name} | Plainer`;
  if (canEdit()) {
    nodes.name.replaceChildren(editable({ value: trip.name, label: 'trip name', onCommit: (name) => { if (name) editTrip('name', name); } }));
  } else {
    nodes.name.textContent = trip.name;
  }
  nodes.status.className = `badge b-${status}`;
  nodes.status.textContent = STATUS_LABEL[status];
  const datesText = tripDatesLabel(trip.startDate, state.days.length);
  if (canEdit()) {
    nodes.dates.replaceChildren(editable({
      value: dateInputValue(trip.startDate), display: datesText, label: 'start date', type: 'date', placeholder: 'Set start date',
      onCommit: (value) => { const date = parseDateInput(value); if (date) editTrip('startDate', date); },
    }));
  } else {
    nodes.dates.textContent = datesText;
  }
  nodes.readonlyNote.hidden = canEdit();
  nodes.readonlyNote.textContent = `Shared by ${trip.sharedBy || 'a traveler'} · view only`;
  renderMenu();
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
  if (first && !state.expandedInit) { state.expanded.add(first.id); state.expandedInit = true; }
}

// ---- trip actions (⋯ menu) ----

function setMenuOpen(open) {
  nodes.menu.hidden = !open;
  nodes.menuButton.setAttribute('aria-expanded', String(open));
}

function flashError(text) {
  nodes.saveStatus.hidden = false;
  nodes.saveStatus.dataset.status = 'error';
  nodes.saveText.textContent = text;
  nodes.saveRetry.hidden = true;
  nodes.live.textContent = text;
}

function confirmAction({ title, text, okLabel, run }) {
  const ok = document.getElementById('confirm-ok');
  const error = document.getElementById('confirm-error');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  ok.textContent = okLabel;
  ok.disabled = false;
  error.hidden = true;
  ok.onclick = async () => {
    ok.disabled = true;
    try {
      await run();
    } catch (failure) {
      error.textContent = 'That didn’t work. Please try again.';
      error.hidden = false;
      ok.disabled = false;
    }
  };
  nodes.confirm.showModal();
}

document.getElementById('confirm-cancel').addEventListener('click', () => nodes.confirm.close());

async function duplicateTrip() {
  try {
    const copy = await state.api.post(`trips/${state.id}/clone`);
    location.assign('/trip/?id=' + encodeURIComponent(copy.id));
  } catch (error) {
    flashError('Couldn’t duplicate this trip');
  }
}

function deleteTrip() {
  confirmAction({
    title: 'Delete this trip?',
    text: `“${state.trip.name}” and everything in it will be deleted. This can’t be undone.`,
    okLabel: 'Delete trip',
    run: async () => {
      await state.api.delete(`trips/${state.id}`);
      location.replace('/trips/');
    },
  });
}

function leaveTrip() {
  confirmAction({
    title: 'Leave this trip?',
    text: `“${state.trip.name}” will disappear from your list. Ask ${state.trip.sharedBy || 'the owner'} to share it again if you change your mind.`,
    okLabel: 'Leave trip',
    run: async () => {
      await state.api.delete(`trip-shares/unsubscribe/${state.id}`);
      location.replace('/trips/');
    },
  });
}

function renderMenu() {
  const item = (text, handler, className = '') => {
    const button = el('button', { type: 'button', role: 'menuitem', class: className, text });
    button.addEventListener('click', () => { setMenuOpen(false); handler(); });
    return button;
  };
  nodes.menu.replaceChildren(...(canEdit()
    ? [item('Duplicate trip', duplicateTrip), item('Delete trip…', deleteTrip, 'danger')]
    : [item('Leave trip…', leaveTrip, 'danger')]));
}

nodes.menuButton.addEventListener('click', () => {
  const open = nodes.menu.hidden;
  setMenuOpen(open);
  if (open) nodes.menu.querySelector('button').focus();
});
document.addEventListener('click', (event) => {
  if (!nodes.menu.hidden && !nodes.menuWrap.contains(event.target)) setMenuOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || nodes.menu.hidden) return;
  setMenuOpen(false);
  nodes.menuButton.focus();
});

// ---- keep in step with edits made elsewhere (another tab, the phone app) ----

async function refreshWhenIdle() {
  const editing = document.activeElement && document.activeElement.classList.contains('inline-input');
  if (document.hidden || queue.isBusy() || queue.status() === 'error' || editing || !state.trip || nodes.confirm.open) return;
  try {
    await load(state.api, state.id);
    if (!queue.isBusy()) render();
  } catch (error) { /* keep what is on screen; the next return to the tab tries again */ }
}
document.addEventListener('visibilitychange', refreshWhenIdle);
window.addEventListener('focus', refreshWhenIdle);

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
  state.api = createApi(user);
  state.id = id;
  try {
    await load(state.api, id);
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
