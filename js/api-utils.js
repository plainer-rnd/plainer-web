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

// File name from a Content-Disposition header (filename* wins over filename), or null. Only a plain file name
// comes back: any folder part or control character is dropped.
export function fileNameFromDisposition(header) {
  if (typeof header !== 'string') return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  const plain = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/.exec(header);
  let name = null;
  try {
    if (star) name = decodeURIComponent(star[1].trim());
  } catch (error) { name = null; }
  if (!name && plain) name = (plain[1] !== undefined ? plain[1].replace(/\\(.)/g, '$1') : plain[2]).trim();
  if (!name) return null;
  name = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f"<>:*?|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return name && name !== '.' && name !== '..' ? name.slice(0, 150) : null;
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
