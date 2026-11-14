import { el } from './dom.js';

// Modal dialogs built on the native <dialog>: it traps focus, closes on Esc, and gives focus back to the
// opener. Each call creates its own dialog and removes it again when closed.
export function openDialog({ title, description, role = 'dialog', content = [] }) {
  const id = 'dlg-' + Math.random().toString(36).slice(2, 8);
  const dialog = el('dialog', { class: 'dialog', role, 'aria-labelledby': id + '-t', ...(description ? { 'aria-describedby': id + '-d' } : {}) }, [
    el('h2', { id: id + '-t', text: title }),
    description ? el('p', { id: id + '-d', class: 'muted', text: description }) : null,
    ...content,
  ]);
  const opener = document.activeElement;
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close: () => dialog.close() };
}

// Asks first; "run" does the work. If it throws, the dialog stays open with a message.
export function confirmDialog({ title, text, okLabel, danger = true, run }) {
  const error = el('p', { class: 'error', role: 'alert', hidden: true });
  const cancel = el('button', { type: 'button', class: 'btn btn-outline', text: 'Cancel' });
  const ok = el('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: okLabel });
  const { close } = openDialog({
    title, description: text, role: 'alertdialog',
    content: [error, el('div', { class: 'dialog-actions' }, [cancel, ok])],
  });
  cancel.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    error.hidden = true;
    try {
      await run();
      close();
    } catch (failure) {
      error.textContent = 'That didn’t work. Please try again.';
      error.hidden = false;
      ok.disabled = false;
    }
  });
}
