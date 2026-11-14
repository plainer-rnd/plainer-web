import { el } from './dom.js';
import { openDialog } from './dialogs.js';
import { isValidEmail } from './auth-utils.js';
import { shareErrorMessage } from './trip-model.js';

// "Share trip" dialog: invite one person at a time by email (they must already have a Plainer account),
// and see or remove the people the trip is shared with. onChange(shares) lets the page update its avatars.
export function openShareDialog({ api, tripId, tripName, onChange }) {
  let shares = [];
  const list = el('ul', { class: 'share-list' });
  const empty = el('p', { class: 'muted small', text: 'Not shared with anyone yet.' });
  const status = el('p', { class: 'error', role: 'alert' });
  const input = el('input', { type: 'email', class: 'picker-input', id: 'share-email', placeholder: 'friend@example.com', autocomplete: 'off', 'aria-label': 'Email address' });
  const send = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Share' });
  const close = el('button', { type: 'button', class: 'btn btn-outline', text: 'Done' });
  const form = el('form', { class: 'share-form', novalidate: true }, [input, send]);

  const dialog = openDialog({
    title: 'Share trip',
    description: `Invite people to “${tripName}”. They get view-only access and it shows up under “Shared with me”.`,
    content: [form, status, el('h3', { class: 'share-heading', text: 'Shared with' }), list, empty, el('div', { class: 'dialog-actions' }, close)],
  });
  close.addEventListener('click', dialog.close);

  function draw() {
    empty.hidden = shares.length > 0;
    list.replaceChildren(...shares.map((share) => {
      const remove = el('button', { type: 'button', class: 'action-btn danger', 'aria-label': `Stop sharing with ${share.sharedWith}`, title: 'Stop sharing', text: '✕' });
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        status.textContent = '';
        try {
          await api.delete(`trip-shares/${share.shareId}`);
          await reload();
        } catch (error) {
          status.textContent = 'Couldn’t remove that person. Please try again.';
          remove.disabled = false;
        }
      });
      return el('li', {}, [el('span', { class: 'share-email', text: share.sharedWith }), remove]);
    }));
  }

  async function reload() {
    shares = (await api.get(`trip-shares/${tripId}`) || []).filter((share) => share.sharedWith);
    draw();
    onChange(shares);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!isValidEmail(email)) { status.textContent = 'Enter a valid email address.'; input.focus(); return; }
    send.disabled = true;
    status.textContent = '';
    try {
      await api.post('trip-shares', { tripId: Number(tripId), emails: [email] });
      input.value = '';
      await reload();
      input.focus();
    } catch (error) {
      status.textContent = shareErrorMessage(error.status, email);
    }
    send.disabled = false;
  });

  reload().catch(() => { status.textContent = 'Couldn’t load who this trip is shared with.'; });
  input.focus();
}
