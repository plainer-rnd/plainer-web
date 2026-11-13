// Pure helpers for the auth pages (no DOM, no Firebase), so they can be unit tested.

const DEFAULT_NEXT = '/trips/';

// Only same-site absolute paths are allowed as a post-login target; anything else
// (full URLs, protocol-relative "//host", backslashes) falls back to the trips page.
export function safeNext(value) {
  if (typeof value !== 'string') return DEFAULT_NEXT;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return DEFAULT_NEXT;
  return value;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const MESSAGES = {
  'auth/invalid-credential': { field: 'form', message: 'That email and password don’t match. Check them and try again.' },
  'auth/wrong-password': { field: 'form', message: 'That email and password don’t match. Check them and try again.' },
  'auth/user-not-found': { field: 'form', message: 'That email and password don’t match. Check them and try again.' },
  'auth/invalid-email': { field: 'email', message: 'Enter a valid email address.' },
  'auth/email-already-in-use': { field: 'email', message: 'An account with this email already exists. Try logging in instead.' },
  'auth/weak-password': { field: 'password', message: 'Choose a password with at least 8 characters.' },
  'auth/too-many-requests': { field: 'form', message: 'Too many attempts. Wait a few minutes and try again.' },
  'auth/network-request-failed': { field: 'form', message: 'No connection. Check your internet and try again.' },
  'auth/user-disabled': { field: 'form', message: 'This account has been disabled. Contact support if you think this is a mistake.' },
};

const FALLBACK = { field: 'form', message: 'Something went wrong. Please try again.' };

// Maps a Firebase error to a field and a plain-language message. Raw codes are never shown.
export function describeAuthError(error) {
  return MESSAGES[error && error.code] || FALLBACK;
}
