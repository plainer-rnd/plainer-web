import { el } from './dom.js';
import { confirmDialog, openDialog } from './dialogs.js';
import { isValidEmail } from './auth-utils.js';
import { shareErrorMessage } from './trip-model.js';
import { joinLink } from './join-model.js';

// "Share trip" dialog: a link anyone can open to view the trip (they need an account to add it to their list), and
// invitations by email, one person at a time (they must already have a Plainer account), with the people the trip is
// shared with. onChange(shares) lets the page update its avatars.
export function openShareDialog({ api, tripId, tripName, onChange, origin = location.origin }) {
  let shares = [];
  const list = el('ul', { class: 'share-list' });
  const empty = el('p', { class: 'muted small', text: 'Not shared with anyone yet.' });
  const status = el('p', { class: 'error', role: 'alert' });
  const input = el('input', { type: 'email', class: 'picker-input', id: 'share-email', placeholder: 'friend@example.com', autocomplete: 'off', 'aria-label': 'Email address' });
  const send = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Share' });
  const close = el('button', { type: 'button', class: 'btn btn-outline', text: 'Done' });
  const form = el('form', { class: 'share-form', novalidate: true }, [input, send]);

  // ---- share by link ----
  let link = null;
  const linkBox = el('div', { class: 'link-box' });
  const linkStatus = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const linkError = el('p', { class: 'error', role: 'alert', hidden: true });
  const showLinkError = (text) => { linkError.textContent = text; linkError.hidden = !text; };

  function drawLink() {
    if (!link) {
      const create = el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Create link' });
      create.addEventListener('click', async () => {
        create.disabled = true;
        showLinkError('');
        try {
          link = await api.post('links', { tripId: Number(tripId), accessMode: 'View' });
          drawLink();
        } catch (error) {
          showLinkError('Couldn’t create the link. Please try again.');
          create.disabled = false;
        }
      });
      linkBox.replaceChildren(el('p', { class: 'muted small', text: 'No link yet. Anyone with the link can view the trip; they need a Plainer account to add it to their list.' }), create);
      return;
    }
    const url = joinLink(origin, link.code);
    const field = el('input', { type: 'text', class: 'picker-input', readonly: true, value: url, 'aria-label': 'Link to this trip' });
    field.addEventListener('focus', () => field.select());
    const copy = el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Copy link' });
    copy.addEventListener('click', async () => {
      linkStatus.textContent = '';
      try {
        await navigator.clipboard.writeText(url);
        linkStatus.textContent = 'Link copied to the clipboard.';
      } catch (error) {
        field.focus(); // the browser blocked the clipboard: the link is selected, so Ctrl/Cmd+C works
        linkStatus.textContent = 'Press Ctrl+C (Cmd+C on a Mac) to copy the selected link.';
      }
    });
    const regenerate = el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Regenerate' });
    regenerate.addEventListener('click', () => confirmDialog({
      title: 'Regenerate the link?',
      text: 'The current link will stop working and everyone who joined with it will lose access.',
      okLabel: 'Regenerate',
      run: async () => {
        await api.delete(`links/${link.id}`);
        link = await api.post('links', { tripId: Number(tripId), accessMode: 'View' });
        linkStatus.textContent = 'New link created. The old one no longer works.';
        drawLink();
      },
    }));
    const turnOff = el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Turn off link' });
    turnOff.addEventListener('click', () => confirmDialog({
      title: 'Turn off the link?',
      text: 'The link will stop working and everyone who joined with it will lose access.',
      okLabel: 'Turn off',
      run: async () => {
        await api.delete(`links/${link.id}`);
        link = null;
        linkStatus.textContent = 'The link is turned off.';
        drawLink();
      },
    }));
    linkBox.replaceChildren(
      el('p', { class: 'muted small', text: 'Anyone with this link can view the trip, even without logging in. They need a Plainer account to add it to their list.' }),
      el('div', { class: 'link-row' }, [field, copy]),
      el('div', { class: 'link-actions' }, [regenerate, turnOff]),
    );
  }

  async function loadLink() {
    const links = (await api.get('links')) || [];
    link = links.find((item) => String(item.tripId) === String(tripId)) || null;
    drawLink();
  }

  const dialog = openDialog({
    title: 'Share trip',
    description: `Share “${tripName}”. People you share it with get view-only access, and it shows up under “Shared with me”.`,
    content: [
      el('h3', { class: 'share-heading', text: 'Share by link' }), linkBox, linkStatus, linkError,
      el('h3', { class: 'share-heading', text: 'Invite by email' }), form, status,
      el('h3', { class: 'share-heading', text: 'Shared with' }), list, empty,
      el('div', { class: 'dialog-actions' }, close),
    ],
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
  loadLink().catch(() => showLinkError('Couldn’t load the link for this trip.'));
  input.focus();
}
