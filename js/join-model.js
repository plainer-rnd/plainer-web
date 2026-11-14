// Pure logic for "share a trip by link" (no DOM, no network). A link looks like
//   https://plainer.co.uk/join-shared-trip?code=<guid>
// iOS opens it in the Plainer app when that is installed (universal link); everywhere else this website shows the trip.

export const JOIN_PATH = '/join-shared-trip';
export const APP_STORE_URL = 'https://apps.apple.com/app/id6740170760';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The link code from a query string, or null if it is missing or not a GUID (so nothing odd is ever put in a URL).
export function parseJoinCode(search) {
  const raw = new URLSearchParams(search).get('code');
  return raw && GUID.test(raw.trim()) ? raw.trim().toLowerCase() : null;
}

export const joinLink = (origin, code) => `${origin}${JOIN_PATH}?code=${code}`;

// Opens the app directly when the page is already loaded in the browser (the app registers the "plainer" scheme).
export const appOpenUrl = (code) => `plainer://join-shared-trip?code=${code}`;

// The app is iPhone/iPad only. iPadOS Safari reports itself as a Mac, so touch support gives it away.
export function isIosDevice({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

// Where the "log in" button goes: back to this very page afterwards, whether they log in or sign up.
export const loginUrl = (code) => `/login/?next=${encodeURIComponent(`${JOIN_PATH}?code=${code}`)}`;

export function previewErrorKind(status) {
  if (status === 0) return 'network';
  if (status === 404) return 'expired';
  return 'error';
}

export function previewErrorText(kind) {
  if (kind === 'expired') return 'This link has expired or isn’t valid. Ask the person who shared the trip for a new link.';
  if (kind === 'network') return 'Check your internet connection and try again.';
  return 'We couldn’t load this trip right now. Please try again in a moment.';
}

export function joinErrorMessage(status, serverMessage) {
  if (status === 0) return 'Check your internet connection and try again.';
  if (status === 404) return 'This link has expired or isn’t valid anymore.';
  if (serverMessage && !/^Request failed with status/.test(serverMessage)) return serverMessage;
  return 'Couldn’t add the trip to your list. Please try again.';
}
