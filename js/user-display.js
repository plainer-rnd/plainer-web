// Pure helpers for showing the signed-in user.

export function displayNameOf(user) {
  return (user && (user.displayName || user.email)) || 'Account';
}

export function userInitial(user) {
  const first = Array.from(displayNameOf(user).trim())[0];
  return first ? first.toUpperCase() : '?';
}
