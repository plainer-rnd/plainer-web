// Pure helpers for talking to plainer-trips-server (no network here, so they can be unit tested).

export function buildUrl(baseUrl, endpoint, params = {}) {
  const url = new URL('api/' + endpoint.replace(/^\/+/, ''), baseUrl.replace(/\/*$/, '/'));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

// Responses are wrapped as { requestId, result, error }; 204 and empty bodies have no content.
export function unwrap(body) {
  if (body === null || body === undefined) return null;
  return body.result ?? body;
}

export function errorMessageFrom(body, status) {
  const message = body && (body.error?.message || body.error || body.message);
  if (typeof message === 'string' && message) return message;
  return 'Request failed with status ' + status;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
