// Client for plainer-trips-server: Firebase ID token as Bearer, response envelope unwrapped.
import { config } from './config.js';
import { buildUrl, unwrap, errorMessageFrom, ApiError } from './api-utils.js';

export { ApiError };

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

export function createApi(user) {
  async function send(method, endpoint, { params, body, form } = {}, forceRefresh = false) {
    const token = await user.getIdToken(forceRefresh);
    // A FormData body sets its own multipart Content-Type (with the boundary), so it must not be set here.
    const headers = { Authorization: 'Bearer ' + token };
    if (!form) headers['Content-Type'] = 'application/json';
    return fetch(buildUrl(config.apiBaseUrl, endpoint, params), {
      method,
      headers,
      body: form || (body === undefined ? undefined : JSON.stringify(body)),
    });
  }

  async function request(method, endpoint, options) {
    let response;
    try {
      response = await send(method, endpoint, options);
      // A 401 usually means the cached token just expired: get a fresh one and try once more.
      if (response.status === 401) response = await send(method, endpoint, options, true);
    } catch (error) {
      throw new ApiError(0, 'Network error');
    }
    const parsed = await readBody(response);
    if (!response.ok) throw new ApiError(response.status, errorMessageFrom(parsed, response.status));
    return unwrap(parsed);
  }

  // For files (PDF export): returns the Blob instead of parsed JSON.
  async function download(endpoint) {
    let response;
    try {
      response = await send('GET', endpoint);
      if (response.status === 401) response = await send('GET', endpoint, {}, true);
    } catch (error) {
      throw new ApiError(0, 'Network error');
    }
    if (!response.ok) throw new ApiError(response.status, errorMessageFrom(await readBody(response), response.status));
    return response.blob();
  }

  return {
    download,
    postForm: (endpoint, form) => request('POST', endpoint, { form }),
    get: (endpoint, params) => request('GET', endpoint, { params }),
    post: (endpoint, body) => request('POST', endpoint, { body }),
    put: (endpoint, body) => request('PUT', endpoint, { body }),
    delete: (endpoint) => request('DELETE', endpoint),
  };
}
