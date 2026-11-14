// Pure logic for the validation "Review" flow (no DOM, no network). Mirrors the iOS app: issues come from
// GET trips/{id}/validate, each has fix suggestions from POST trips/{id}/suggest, and a suggestion's "fixInfo"
// is an ordinary API call the client makes to apply it.

export function issueFromDto(dto) {
  return {
    hash: dto.hash || null,
    tier: dto.severity === 'Error' ? 'critical' : 'advisory',
    code: dto.code || 'Unknown',
    name: dto.name || dto.code || 'Unknown',
    message: dto.message || 'No details available',
    suggestion: dto.suggestion || null,
    entityId: dto.entityId ?? null,
    // The server offers no fix options for a location it couldn't find; the stop has to be re-added by hand.
    hasFixOptions: dto.code !== 'LOCATION_NOT_FOUND',
  };
}

export function issuesFromValidation(validation) {
  return ((validation && validation.issues) || []).map(issueFromDto);
}

// Groups of issues that share a name, in the order they first appear.
export function groupIssues(issues) {
  const groups = new Map();
  issues.forEach((issue) => {
    if (!groups.has(issue.name)) groups.set(issue.name, []);
    groups.get(issue.name).push(issue);
  });
  return [...groups].map(([title, items]) => ({ title, items }));
}

export const isDismissed = (issue, dismissed) => Boolean(issue.hash && dismissed.has(issue.hash));

export function activeIssues(issues, dismissed) {
  return issues.filter((issue) => !isDismissed(issue, dismissed));
}

// Counts for the overview: the server's totals when the issue list is unavailable, otherwise what is not dismissed.
export function reviewCounts(validation, dismissed) {
  if (!validation) return null;
  if (!Array.isArray(validation.issues) || validation.issues.length === 0) {
    return { errorCount: validation.errorCount || 0, warningCount: validation.warningCount || 0 };
  }
  const active = activeIssues(issuesFromValidation(validation), dismissed);
  return {
    errorCount: active.filter((issue) => issue.tier === 'critical').length,
    warningCount: active.filter((issue) => issue.tier === 'advisory').length,
  };
}

export const dismissedKey = (tripId) => `plainerDismissed-${tripId}`;

export function readDismissed(storage, tripId) {
  try {
    const list = JSON.parse(storage.getItem(dismissedKey(tripId)) || '[]');
    return new Set(Array.isArray(list) ? list.filter((hash) => typeof hash === 'string') : []);
  } catch (error) {
    return new Set();
  }
}

export function writeDismissed(storage, tripId, dismissed) {
  try {
    if (dismissed.size) storage.setItem(dismissedKey(tripId), JSON.stringify([...dismissed]));
    else storage.removeItem(dismissedKey(tripId));
  } catch (error) { /* private mode or blocked storage: dismissals just last for this visit */ }
}

const FIX_METHODS = new Set(['POST', 'PUT', 'DELETE']);

// The server describes a fix as {method, url, body}. It is only run if it is a write to this trip's own stops or
// days, so a bad response can never send the user's token or data anywhere else. Returns null if it isn't.
export function fixRequestFrom(fixInfo, tripId) {
  if (!fixInfo || typeof fixInfo.url !== 'string') return null;
  const method = String(fixInfo.method || '').toUpperCase();
  if (!FIX_METHODS.has(method)) return null;
  const match = new RegExp(`^/api/(trips/${String(tripId).replace(/\D/g, '')}/(?:route-stops|days)(?:/[A-Za-z0-9-]+)*)$`).exec(fixInfo.url);
  if (!match) return null;
  const generate = /^trips\/\d+\/route-stops\/(\d+)\/generate-days$/.exec(match[1]);
  return {
    method,
    endpoint: match[1],
    body: fixInfo.body === undefined || fixInfo.body === null ? (method === 'DELETE' ? undefined : {}) : fixInfo.body,
    generateForStop: generate ? Number(generate[1]) : null,
  };
}

export function fixErrorMessage(status, serverMessage) {
  if (status === 0) return 'We didn’t get an answer from the server. Please try again.';
  if (serverMessage && !/^Request failed with status/.test(serverMessage)) return serverMessage;
  return 'Couldn’t apply that fix. Please try again.';
}
