// Pure trip logic (no DOM, no network), mirroring the iOS app's TripInfoModel so both clients agree.

const MIN_REAL_YEAR = 1900;
const COVER_STYLES = ['a', 'b', 'c'];

// The API sends UTC timestamps such as "2026-11-08T00:00:00Z". Only the calendar day matters, so it is
// built from the date part to avoid time-zone day shifts. Placeholder dates (year < 1900) mean "no date".
export function parseStartDate(raw) {
  const match = typeof raw === 'string' ? raw.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!match) return null;
  const year = Number(match[1]);
  if (year < MIN_REAL_YEAR) return null;
  return new Date(year, Number(match[2]) - 1, Number(match[3]));
}

export function tripFromDto(dto) {
  return {
    id: dto.id,
    name: dto.name || 'Untitled trip',
    isDraft: dto.isDraft ?? true,
    startDate: parseStartDate(dto.startDate),
    description: dto.description ?? null,
    shareId: dto.shareId ?? null,
    sharedBy: dto.sharedBy ?? null,
    // Older servers don't send these: null means "unknown", which is not the same as 0.
    stopCount: Number.isInteger(dto.stopCount) ? dto.stopCount : null,
    dayCount: Number.isInteger(dto.dayCount) ? dto.dayCount : null,
  };
}

export function isShared(trip) {
  return trip.shareId !== null;
}

// Trips have no end date, so there is no "past": draft, upcoming (starts in the future) or active.
export function resolveStatus(trip, today = new Date()) {
  if (trip.isDraft) return 'draft';
  if (!trip.startDate) return 'active';
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return trip.startDate <= todayStart ? 'active' : 'upcoming';
}

// Stable per trip id, so a trip keeps its colour between visits.
export function coverFor(id) {
  return COVER_STYLES[Math.abs(Number(id) || 0) % COVER_STYLES.length];
}

export function initialOf(name) {
  const first = Array.from(String(name).trim())[0];
  return first ? first.toUpperCase() : '?';
}

export function formatStartDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function datesLabel(trip) {
  return trip.startDate ? 'Starts ' + formatStartDate(trip.startDate) : 'Dates not set';
}

// "3 stops · 7 days", or null when the server didn't say.
export function countsLabel(trip) {
  if (trip.stopCount === null || trip.dayCount === null) return null;
  if (trip.stopCount === 0 && trip.dayCount === 0) return 'No stops yet';
  const stops = `${trip.stopCount} ${trip.stopCount === 1 ? 'stop' : 'stops'}`;
  const days = `${trip.dayCount} ${trip.dayCount === 1 ? 'day' : 'days'}`;
  return `${stops} · ${days}`;
}

export function ownerLabel(trip, sharedWithCount) {
  if (isShared(trip)) return 'Shared by ' + (trip.sharedBy || 'a traveler');
  if (sharedWithCount > 0) return 'Owned by you · shared with ' + sharedWithCount;
  return 'Owned by you';
}

export function splitTrips(trips) {
  return {
    mine: trips.filter((trip) => !isShared(trip)),
    shared: trips.filter(isShared),
  };
}

// status "all" keeps everything; query is a case-insensitive substring match on the name.
export function filterTrips(trips, { status = 'all', query = '' } = {}, today = new Date()) {
  const needle = query.trim().toLowerCase();
  return trips.filter((trip) => {
    if (status !== 'all' && resolveStatus(trip, today) !== status) return false;
    return !needle || trip.name.toLowerCase().includes(needle);
  });
}

export function tripsCountLabel(count, tab) {
  const noun = count === 1 ? 'trip' : 'trips';
  return tab === 'shared' ? `${count} ${noun} shared with you` : `${count} ${noun} you own`;
}
