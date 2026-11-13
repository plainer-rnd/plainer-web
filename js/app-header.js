// Behaviour shared by the signed-in pages: account menu, log out, verify-email banner.
import { refreshUser, resendVerification, signOut } from './firebase.js';
import { displayNameOf, userInitial } from './user-display.js';
import { el } from './dom.js';

function initAccountMenu(user) {
  const button = document.getElementById('account-button');
  const menu = document.getElementById('account-menu');
  button.textContent = userInitial(user);
  document.getElementById('account-name').textContent = displayNameOf(user);
  document.getElementById('account-email').textContent = user.email || '';

  function setOpen(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }

  button.addEventListener('click', () => {
    const open = menu.hidden;
    setOpen(open);
    if (open) menu.querySelector('a, button').focus();
  });
  document.addEventListener('click', (event) => {
    if (!menu.hidden && !menu.contains(event.target) && !button.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menu.hidden) return;
    setOpen(false);
    button.focus();
  });
  menu.addEventListener('focusout', (event) => {
    if (!menu.contains(event.relatedTarget) && event.relatedTarget !== button) setOpen(false);
  });

  document.getElementById('logout').addEventListener('click', async () => {
    await signOut();
    location.replace('/login/');
  });
}

async function initVerifyBanner(user) {
  if (user.emailVerified) return;
  // The user may have confirmed in another tab since this session started.
  await refreshUser(user).catch(() => {});
  if (user.emailVerified) return;

  const status = el('span', { role: 'status' });
  const resend = el('button', { type: 'button', text: 'Resend email' });
  resend.addEventListener('click', async () => {
    resend.disabled = true;
    try {
      await resendVerification(user);
      status.textContent = 'Sent. Check your inbox.';
    } catch (error) {
      status.textContent = 'Couldn’t send it right now. Try again in a minute.';
      resend.disabled = false;
    }
  });
  const banner = el('div', { class: 'banner' }, [
    el('span', { text: 'Verify your email: we sent a link to ' + user.email + '.' }),
    resend,
    status,
  ]);
  document.getElementById('banner-slot').replaceChildren(banner);
}

export function initAppHeader(user) {
  initAccountMenu(user);
  initVerifyBanner(user);
}
