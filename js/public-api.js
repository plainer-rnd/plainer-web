// The one backend call that needs no login: the read-only preview of a trip behind a share link.
// No Authorization header and no cookies are sent, and the link code never goes out in a Referer.
import { config } from './config.js';
import { buildUrl, unwrap, errorMessageFrom, ApiError } from './api-utils.js';

export async function fetchLinkPreview(code) {
  let response;
  try {
    response = await fetch(buildUrl(config.apiBaseUrl, `links/${code}/preview`), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    throw new ApiError(0, 'Network error');
  }
  let parsed = null;
  try {
    parsed = JSON.parse(await response.text());
  } catch (error) { /* an empty or non-JSON body: the status says enough */ }
  if (!response.ok) throw new ApiError(response.status, errorMessageFrom(parsed, response.status));
  return unwrap(parsed);
}
