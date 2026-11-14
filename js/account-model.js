// Pure logic for deleting the account (no DOM, no network).

// Deleting needs the password again, so only accounts that sign in with one can do it here.
// (No provider list at all, as in a bare test user, counts as a password account if it has an email.)
export function canDeleteWithPassword(user) {
  if (!user || !user.email) return false;
  const providers = Array.isArray(user.providerData) ? user.providerData.map((entry) => entry.providerId) : [];
  return providers.length === 0 || providers.includes('password');
}

const MESSAGES = {
  'auth/invalid-credential': 'That password isn’t right. Try again.',
  'auth/wrong-password': 'That password isn’t right. Try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/requires-recent-login': 'For your security, log out, log in again and then delete your account.',
  'auth/user-disabled': 'This account has been disabled. Contact support if you think this is a mistake.',
};

export const deleteErrorMessage = (error) => MESSAGES[error && error.code] || 'Couldn’t delete your account. Please try again.';

export const LOCAL_KEY_PREFIXES = ['plainerChat-', 'plainerDismissed-'];
export const SIGNED_IN_HINT = 'plainerSignedIn';

// Forgets what this browser kept about the account: assistant conversations, dismissed review issues, the signed-in hint.
// The theme choice isn't personal data and stays.
export function clearLocalAccountData(...storages) {
  for (const storage of storages) {
    try {
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) keys.push(storage.key(index));
      keys.filter((key) => key && (key === SIGNED_IN_HINT || LOCAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))))
        .forEach((key) => storage.removeItem(key));
    } catch (error) { /* storage blocked: nothing was kept there */ }
  }
}
