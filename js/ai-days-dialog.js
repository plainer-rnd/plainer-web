// "Generate days with AI" for one stop: asks how many days and whether to add or replace, calls the server
// (which only writes the text), then hands the generated days back so the page can save them.
import { el } from './dom.js';
import { openDialog, progressDialog } from './dialogs.js';
import { MAX_AI_DAYS, aiErrorMessage, plural } from './trip-model.js';

// `previous` brings the dialog back after a failure with the same choices and the error message.
export function openGenerateDaysDialog({ api, tripId, stop, existingCount, onGenerated, previous = {} }) {
  let count = previous.count || Math.min(Math.max(stop.plannedDays || 1, 1), MAX_AI_DAYS);
  const value = el('span', { class: 'stepper-value', 'aria-live': 'polite', text: String(count) });
  const minus = el('button', { type: 'button', 'aria-label': 'Fewer days', text: '−' });
  const plus = el('button', { type: 'button', 'aria-label': 'More days', text: '+' });
  const sync = () => {
    value.textContent = String(count);
    minus.disabled = count <= 1;
    plus.disabled = count >= MAX_AI_DAYS;
  };
  minus.addEventListener('click', () => { count -= 1; sync(); });
  plus.addEventListener('click', () => { count += 1; sync(); });
  sync();
  const stepper = el('div', { class: 'stepper', role: 'group', 'aria-label': 'Number of days' }, [minus, value, plus]);

  const radio = (mode, label, checked) => {
    const input = el('input', { type: 'radio', name: 'ai-mode', value: mode });
    input.checked = checked;
    return el('label', { class: 'radio-row' }, [input, el('span', { text: label })]);
  };
  const modes = existingCount
    ? el('fieldset', { class: 'radio-group' }, [
      el('legend', { class: 'label', text: 'Existing days' }),
      radio('append', `Keep the ${plural(existingCount, 'day')} and add these after`, previous.mode !== 'replace'),
      radio('replace', `Replace the ${plural(existingCount, 'existing day')}`, previous.mode === 'replace'),
    ])
    : null;

  const error = el('p', { class: 'error', role: 'alert', text: previous.error || '' });
  const cancel = el('button', { type: 'button', class: 'btn btn-outline', text: 'Cancel' });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Generate days' });
  const form = el('form', { method: 'dialog', novalidate: true }, [
    el('span', { class: 'label', text: 'How many days?' }), stepper,
    modes, error,
    el('div', { class: 'dialog-actions' }, [cancel, submit]),
  ]);
  const { close } = openDialog({
    title: `Generate days for ${stop.name}`,
    description: 'AI writes a suggested plan for each day. You can edit everything afterwards.',
    content: [form],
  });
  cancel.addEventListener('click', close);
  plus.focus();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = modes && form.elements['ai-mode'].value === 'replace' ? 'replace' : 'append';
    // The form gives way to a progress dialog; on failure it comes back with the same choices and the error.
    close();
    const waiting = progressDialog('Generating trip days…');
    let failure = '';
    try {
      const days = await api.post(`trips/${tripId}/route-stops/${stop.id}/generate-days`, { numberOfDays: count });
      waiting.close();
      if (days && days.length) {
        onGenerated(days, mode);
        return;
      }
      failure = 'No days came back. Please try again.';
    } catch (caught) {
      waiting.close();
      failure = aiErrorMessage(caught.status, caught.message);
    }
    openGenerateDaysDialog({ api, tripId, stop, existingCount, onGenerated, previous: { count, mode, error: failure } });
  });
}
