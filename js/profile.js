import { requireUser, signOut, deleteAccount } from './firebase.js';
import { canDeleteWithPassword, deleteErrorMessage } from './account-model.js';
import { openDialog } from './dialogs.js';
import { el } from './dom.js';
import { initAppHeader } from './app-header.js';
import { createApi } from './api.js';
import { displayNameOf } from './user-display.js';

function deleteAccountDialog(user) {
  const cancel = el('button', { type: 'button', class: 'btn btn-outline', text: 'Cancel' });
  if (!canDeleteWithPassword(user)) {
    const { close } = openDialog({
      title: 'Delete your account',
      description: 'This account signs in with Apple or Google, which can only be deleted from the Plainer app: open Profile there and choose Delete profile.',
      role: 'alertdialog',
      content: [el('div', { class: 'dialog-actions' }, cancel)],
    });
    cancel.textContent = 'Close';
    cancel.addEventListener('click', close);
    return;
  }

  const password = el('input', { type: 'password', class: 'picker-input', id: 'delete-password', autocomplete: 'current-password', required: true });
  const error = el('p', { class: 'error', role: 'alert' });
  const confirm = el('button', { type: 'submit', class: 'btn btn-danger', text: 'Delete my account' });
  const form = el('form', { novalidate: true }, [
    el('label', { class: 'label', for: 'delete-password', text: 'Enter your password to confirm' }), password,
    error,
    el('div', { class: 'dialog-actions' }, [cancel, confirm]),
  ]);
  const { close } = openDialog({
    title: 'Delete your account?',
    description: `This permanently deletes the account ${user.email}. You won’t be able to log in with it again, on the web or in the iPhone app, and this can’t be undone. Want to keep a trip? Export it as a PDF first.`,
    role: 'alertdialog',
    content: [form],
  });
  cancel.addEventListener('click', close);
  password.focus();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!password.value) { error.textContent = 'Enter your password to confirm.'; password.focus(); return; }
    error.textContent = '';
    confirm.disabled = true;
    cancel.disabled = true;
    password.disabled = true;
    confirm.textContent = 'Deleting…';
    try {
      await deleteAccount(user, password.value);
      location.replace('/login/?deleted=1');
    } catch (failure) {
      error.textContent = deleteErrorMessage(failure);
      confirm.disabled = false;
      cancel.disabled = false;
      password.disabled = false;
      confirm.textContent = 'Delete my account';
      password.focus();
      password.select();
    }
  });
}

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
  document.getElementById('delete-account').addEventListener('click', () => deleteAccountDialog(user));
  document.getElementById('profile-skeleton').hidden = true;
  document.getElementById('profile-app').hidden = false;
}

start();
