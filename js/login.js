import { getUser, signIn, resetPassword, nextUrl } from './firebase.js';
import { describeAuthError, isValidEmail } from './auth-utils.js';
import { setBusy, showError, clearErrors, showAuthError } from './auth-ui.js';

const form = document.getElementById('login-form');
const email = document.getElementById('email');
const password = document.getElementById('password');
const submit = document.getElementById('login-submit');
const notice = document.getElementById('form-notice');
const fields = {
  email: { input: email, error: document.getElementById('email-error') },
  password: { input: password, error: document.getElementById('password-error') },
  form: { input: null, error: document.getElementById('form-error') },
};

// Someone arriving from a share link may need an account first: the sign-up page must also bring them back.
const signupLink = document.querySelector('a[href="/signup/"]');
const next = new URLSearchParams(location.search).get('next');
if (signupLink && next) signupLink.href = '/signup/?next=' + encodeURIComponent(nextUrl());

getUser().then((user) => {
  if (user) location.replace(nextUrl());
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(form);
  notice.textContent = '';

  if (!isValidEmail(email.value)) {
    showError(fields.email.error, 'Enter your email address.', email);
    email.focus();
    return;
  }
  if (!password.value) {
    showError(fields.password.error, 'Enter your password.', password);
    password.focus();
    return;
  }

  setBusy(submit, true);
  try {
    await signIn(email.value, password.value);
    location.replace(nextUrl());
  } catch (error) {
    showAuthError(form, describeAuthError(error), fields);
    setBusy(submit, false);
  }
});

document.getElementById('forgot-password').addEventListener('click', async (event) => {
  event.preventDefault();
  clearErrors(form);
  notice.textContent = '';

  if (!isValidEmail(email.value)) {
    showError(fields.email.error, 'Enter your email above, then choose “Forgot password?” again.', email);
    email.focus();
    return;
  }

  try {
    await resetPassword(email.value);
  } catch (error) {
    const described = describeAuthError(error);
    // Don't reveal whether an account exists: only connection or format problems are shown.
    if (error.code !== 'auth/user-not-found') {
      showAuthError(form, described, fields);
      return;
    }
  }
  notice.textContent = 'If an account exists for ' + email.value.trim() + ', we’ve sent a link to reset the password. Check your inbox.';
});

// Handlers are attached; E2E tests wait for this before interacting.
form.dataset.ready = 'true';
