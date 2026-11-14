// "Generate days with AI" for one stop: asks how many days and whether to add or replace, calls the server
// (which only writes the text), then hands the generated days back so the page can save them.
import { el } from './dom.js';
import { openDialog } from './dialogs.js';
import { MAX_AI_DAYS, aiErrorMessage, plural } from './trip-model.js';

export function openGenerateDaysDialog({ api, tripId, stop, existingCount, onGenerated }) {
  let count = Math.min(Math.max(stop.plannedDays || 1, 1), MAX_AI_DAYS);
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
      radio('append', `Keep the ${plural(existingCount, 'day')} and add these after`, true),
      radio('replace', `Replace the ${plural(existingCount, 'existing day')}`, false),
    ])
    : null;

  const error = el('p', { class: 'error', role: 'alert' });
  const progress = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite', hidden: true });
  const cancel = el('button', { type: 'button', class: 'btn btn-outline', text: 'Cancel' });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Generate days' });
  const form = el('form', { method: 'dialog', novalidate: true }, [
    el('span', { class: 'label', text: 'How many days?' }), stepper,
    modes, error, progress,
    el('div', { class: 'dialog-actions' }, [cancel, submit]),
  ]);
  const { dialog, close } = openDialog({
    title: `Generate days for ${stop.name}`,
    description: 'AI writes a suggested plan for each day. You can edit everything afterwards.',
    content: [form],
  });
  cancel.addEventListener('click', close);
  plus.focus();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const replace = Boolean(modes && form.elements['ai-mode'].value === 'replace');
    error.textContent = '';
    [submit, minus, plus].forEach((control) => { control.disabled = true; });
    progress.hidden = false;
    progress.textContent = 'Writing your itinerary… this can take a minute.';
    try {
      const days = await api.post(`trips/${tripId}/route-stops/${stop.id}/generate-days`, { numberOfDays: count });
      if (!dialog.isConnected) return; // closed while waiting: don't change the trip behind their back
      if (!days || !days.length) throw new Error('empty');
      close();
      onGenerated(days, replace ? 'replace' : 'append');
      return;
    } catch (failure) {
      if (!dialog.isConnected) return;
      error.textContent = failure.message === 'empty' ? 'No days came back. Please try again.' : aiErrorMessage(failure.status, failure.message);
    }
    progress.hidden = true;
    submit.disabled = false;
    sync();
  });
}
