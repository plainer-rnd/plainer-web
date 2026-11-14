import { getUser, signUp, nextUrl } from './firebase.js';
import { describeAuthError, isValidEmail } from './auth-utils.js';
import { setBusy, showError, clearErrors, showAuthError } from './auth-ui.js';

const MIN_PASSWORD_LENGTH = 8;

// Arriving from a share link: logging in instead must also bring them back to the trip.
const loginLink = document.querySelector('a[href="/login/"]');
if (loginLink && new URLSearchParams(location.search).get('next')) loginLink.href = '/login/?next=' + encodeURIComponent(nextUrl());

const form = document.getElementById('signup-form');
const name = document.getElementById('name');
const email = document.getElementById('email');
const password = document.getElementById('password');
const submit = document.getElementById('signup-submit');
const fields = {
  name: { input: name, error: document.getElementById('name-error') },
  email: { input: email, error: document.getElementById('email-error') },
  password: { input: password, error: document.getElementById('password-error') },
  form: { input: null, error: document.getElementById('form-error') },
};

// Checked once at load only: creating the account signs the user in mid-submit,
// and a live listener would redirect before the display name is saved.
getUser().then((user) => {
  if (user) location.replace(nextUrl());
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(form);

  if (!name.value.trim()) {
    showError(fields.name.error, 'Enter your name.', name);
    name.focus();
    return;
  }
  if (!isValidEmail(email.value)) {
    showError(fields.email.error, 'Enter a valid email address.', email);
    email.focus();
    return;
  }
  if (password.value.length < MIN_PASSWORD_LENGTH) {
    showError(fields.password.error, 'Choose a password with at least 8 characters.', password);
    password.focus();
    return;
  }

  setBusy(submit, true);
  try {
    await signUp(name.value, email.value, password.value);
    location.replace(nextUrl());
  } catch (error) {
    showAuthError(form, describeAuthError(error), fields);
    setBusy(submit, false);
  }
});

// Handlers are attached; E2E tests wait for this before interacting.
form.dataset.ready = 'true';
