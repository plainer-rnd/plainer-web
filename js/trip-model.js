// Pure trip-details logic (no DOM, no network): maps backend DTOs to the shapes the page renders.
// The day "plan" is rich text (HTML) written by the iOS app, so it is reduced to plain lines here and
// never injected as markup.

export function stopFromDto(dto) {
  return {
    id: dto.id,
    order: dto.order ?? 0,
    name: (dto.location && dto.location.name) || 'Unnamed stop',
    plannedDays: dto.plannedDays ?? 1,
    transport: dto.transport || null,
  };
}

export function dayFromDto(dto) {
  return {
    id: dto.id,
    order: dto.order ?? 0,
    stopId: dto.routeStopId,
    title: (dto.title || '').trim(),
    plan: plainLines(dto.description),
  };
}

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

// Rich text → array of plain lines. List items get a bullet; everything else is text only.
export function plainLines(html) {
  if (!html) return [];
  return String(html)
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity])
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && line !== '•');
}

export function hasPlan(day) {
  return day.plan.length > 0;
}

export function plural(count, one, many = one + 's') {
  return `${count} ${count === 1 ? one : many}`;
}

export function stopMeta(stop, dayCount) {
  // Same wording as the iOS route list: the target number of days vs the days actually added.
  const parts = [`Planned: ${stop.plannedDays} · Actual: ${dayCount}`];
  if (stop.transport) parts.push(stop.transport);
  return parts.join(' · ');
}

// Stops in route order, each with its days. Days are numbered across the whole trip in that order.
export function buildItinerary(stops, days) {
  const orderedStops = [...stops].sort((a, b) => a.order - b.order);
  const known = new Set(orderedStops.map((stop) => stop.id));
  const byStop = (stopId) => days.filter((day) => day.stopId === stopId).sort((a, b) => a.order - b.order);

  const groups = orderedStops.map((stop) => ({ stop, days: byStop(stop.id) }));
  const orphans = days.filter((day) => !known.has(day.stopId)).sort((a, b) => a.order - b.order);
  if (orphans.length) groups.push({ stop: { id: null, name: 'Other days' }, days: orphans });

  let number = 0;
  groups.forEach((group) => group.days.forEach((day) => { day.number = ++number; }));
  return groups;
}

export function addDays(date, count) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + count);
  return result;
}

const shortDate = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const longDate = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const weekdayDate = (date) => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// "8 – 21 Nov 2026" when the number of days is known, "Starts 8 Nov 2026" otherwise.
export function tripDatesLabel(startDate, dayCount) {
  if (!startDate) return 'Dates not set';
  if (dayCount < 2) return 'Starts ' + longDate(startDate);
  const end = addDays(startDate, dayCount - 1);
  const sameYear = startDate.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && startDate.getMonth() === end.getMonth();
  const from = sameMonth ? String(startDate.getDate()) : sameYear ? shortDate(startDate) : longDate(startDate);
  return `${from} – ${longDate(end)}`;
}

export function dayDateLabel(startDate, day) {
  return startDate && day.number ? weekdayDate(addDays(startDate, day.number - 1)) : '';
}

// Same figures as the iOS overview: stats, planning progress (days with a plan) and the validation count.
export function overviewOf(stops, days, validation) {
  const withPlan = days.filter(hasPlan).length;
  const issues = validation ? validation.errorCount + validation.warningCount : null;
  return {
    stopCount: stops.length,
    dayCount: days.length,
    daysWithPlan: withPlan,
    progressPercent: days.length === 0 ? 0 : Math.round((withPlan / days.length) * 100),
    progressLabel: days.length === 0
      ? 'No days planned yet'
      : `${withPlan} of ${days.length} ${days.length === 1 ? 'day has' : 'days have'} a plan`,
    issues, // null when validation could not be loaded
  };
}

export function validationValue(overview) {
  if (overview.issues === null) return '–';
  return overview.issues === 0 ? 'OK' : String(overview.issues);
}

const AVATAR_COLOURS = ['#7B6FD6', '#C2603F', '#2F8F83', '#B0488B', '#4B7BC4'];

export function sharedPeople(shares) {
  return (shares || [])
    .filter((share) => share && share.sharedWith)
    .map((share, index) => ({
      label: share.sharedWith,
      initial: Array.from(share.sharedWith)[0].toUpperCase(),
      colour: AVATAR_COLOURS[index % AVATAR_COLOURS.length],
    }));
}

export function parseTripId(search) {
  const raw = new URLSearchParams(search).get('id');
  return raw && /^\d+$/.test(raw) ? raw : null;
}

// ---- editing helpers ----

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The plan is edited as plain text, one paragraph per line, and saved back as simple <p> paragraphs.
export function textToLines(text) {
  return String(text).split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function linesToHtml(lines) {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

export function sameLines(a, b) {
  return a.length === b.length && a.every((line, index) => line === b[index]);
}

// <input type="date"> uses "2026-11-08"; the API wants a UTC timestamp for the same calendar day.
export function dateInputValue(date) {
  if (!date) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match || Number(match[1]) < 1900) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function dateToApi(date) {
  return `${dateInputValue(date)}T00:00:00Z`;
}

export const TRANSPORT_TYPES = ['Flight', 'Car', 'Train', 'Bus', 'Ferry', 'Cruise', 'Bicycle', 'Hiking'];

// ---- structure helpers (add / move / remove) ----
// Days are ordered across the whole trip: a day's "order" is its 0-based index in that single list, and the
// stops' days sit one after another in route order. So adding a day at the end of a stop means inserting it
// at the index right after that stop's last day.

export function insertIndexForStop(groups, stopId) {
  let count = 0;
  for (const group of groups) {
    count += group.days.length;
    if (group.stop.id === stopId) return count;
  }
  return count;
}

// New global index for a day moved one place up (-1) or down (+1) inside its own stop, or null at the edge.
export function dayMoveIndex(groups, day, direction) {
  const group = groups.find((g) => g.days.includes(day));
  if (!group) return null;
  const neighbour = group.days[group.days.indexOf(day) + direction];
  return neighbour ? neighbour.number - 1 : null;
}

// Stop ids in their new order after moving one stop up (-1) or down (+1), or null at the edge.
export function stopMoveIds(stops, stopId, direction) {
  const ids = [...stops].sort((a, b) => a.order - b.order).map((stop) => stop.id);
  const from = ids.indexOf(stopId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

export function duplicateDayBody(day, order) {
  return { routeStopId: day.stopId, order, title: day.title || null, description: linesToHtml(day.plan) };
}

export function newTripBody(name, startDate) {
  return { name, startDate: startDate ? dateToApi(startDate) : '0001-01-01T00:00:00Z', description: null, isDraft: true };
}

// ---- drag and drop ----

// A copy of `items` with the one that has `id` taken out and put just before or after the one with `targetId`.
export function moveItem(items, id, targetId, after) {
  const moving = items.find((item) => item.id === id);
  const rest = items.filter((item) => item.id !== id);
  const at = rest.findIndex((item) => item.id === targetId);
  if (!moving || at < 0) return items;
  rest.splice(after ? at + 1 : at, 0, moving);
  return rest;
}

// Stop ids in their new order after dropping a stop next to another, or null if nothing changes.
export function stopDropIds(stops, id, targetId, after) {
  const ordered = [...stops].sort((a, b) => a.order - b.order);
  const next = moveItem(ordered, id, targetId, after);
  const ids = next.map((stop) => stop.id);
  return ids.every((value, index) => value === ordered[index].id) ? null : ids;
}

// New global index for a day dropped next to another day of the same stop, or null if nothing changes
// (or the two days are in different stops, which the API can't do).
export function dayDropOrder(groups, day, target, after) {
  const group = groups.find((g) => g.days.includes(day));
  if (!group || !group.days.includes(target) || day === target) return null;
  const next = moveItem(group.days, day.id, target.id, after);
  const from = group.days.indexOf(day);
  const to = next.indexOf(day);
  return from === to ? null : group.days[0].number - 1 + to;
}

// ---- sharing and export ----

export function shareErrorMessage(status, email) {
  if (status === 404) return `${email} doesn’t have a Plainer account yet. Ask them to sign up first, then share again.`;
  if (status === 0) return 'Check your internet connection and try again.';
  if (status === 400) return 'That email address doesn’t look right.';
  return 'Couldn’t share the trip. Please try again.';
}

// "Plainer – Scotland.pdf": safe for any file system.
export function pdfFileName(tripName) {
  const clean = String(tripName).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `Plainer – ${clean || 'Trip'}.pdf`;
}

// ---- import PDF ----

export const IMPORT_MAX_BYTES = 3 * 1024 * 1024;

// Why a chosen file can't be imported, or null if it looks fine. The server checks again (and also the %PDF- signature).
export function importFileProblem(file) {
  if (!file) return 'Choose a PDF file first.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > IMPORT_MAX_BYTES) return 'That file is larger than 3 MB.';
  if (!/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') return 'Choose a PDF file.';
  return null;
}

// What the import produced. `created` is false when the server declined the file (nothing was added).
export function importOutcome(result) {
  if (!result || !result.tripId) {
    return { created: false, reason: (result && result.rejectionReason) || 'That PDF doesn’t look like a trip plan.' };
  }
  const stops = result.routeStops || [];
  const unresolved = result.unresolvedStopNames || [];
  const partial = stops.filter((stop) => stop.daysMissing).map((stop) => stop.name);
  return {
    created: true,
    tripId: result.tripId,
    tripName: result.tripName || 'Imported trip',
    stopCount: result.routeStopCount ?? stops.length,
    dayCount: result.dayCount ?? 0,
    unresolved,
    partial,
    needsReview: unresolved.length > 0 || partial.length > 0,
  };
}

export function importErrorMessage(status, serverMessage) {
  if (status === 0) return 'Check your internet connection and try again.';
  if (status === 400 || status === 413) return serverMessage && !/^Request failed/.test(serverMessage) ? serverMessage : 'That file can’t be imported.';
  return 'Couldn’t import the PDF. Please try again.';
}
