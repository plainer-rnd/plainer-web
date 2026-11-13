import { requireUser, signOut } from './firebase.js';
import { initAppHeader } from './app-header.js';
import { createApi } from './api.js';
import { displayNameOf } from './user-display.js';

async function start() {
  const user = await requireUser();
  initAppHeader(user);

  document.getElementById('profile-name').textContent = displayNameOf(user);
  document.getElementById('profile-email').textContent = user.email || '';

  // The backend profile is what people you share trips with see, so prefer it when it answers.
  try {
    const profile = await createApi(user).get('profile');
    if (profile && profile.displayName) document.getElementById('profile-name').textContent = profile.displayName;
    if (profile && profile.email) document.getElementById('profile-email').textContent = profile.email;
  } catch (error) { /* keep the Firebase values already shown */ }

  document.getElementById('profile-logout').addEventListener('click', async () => {
    await signOut();
    location.replace('/login/');
  });
  document.getElementById('profile-skeleton').hidden = true;
  document.getElementById('profile-app').hidden = false;
}

start();
