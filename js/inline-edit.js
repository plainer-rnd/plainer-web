import { el } from './dom.js';

// A piece of text that turns into an input where it sits.
// Enter or leaving the field saves, Esc puts the old text back. Nothing is sent if the value is unchanged.
// options: value, label (for screen readers), placeholder, multiline, type ("text" | "date"), display (text shown), onCommit(value)
export function editable({ value, label, placeholder = 'Add', multiline = false, type = 'text', display, onCommit, className = '' }) {
  const shown = display !== undefined ? display : value;
  const button = el('button', {
    type: 'button',
    class: `editable ${shown ? '' : 'is-empty'} ${className}`.trim(),
    'aria-label': `Edit ${label}${shown ? ': ' + shown : ''}`,
    text: shown || placeholder,
  });

  button.addEventListener('click', () => {
    const field = multiline
      ? el('textarea', { class: 'inline-input', rows: '4', 'aria-label': label })
      : el('input', { class: 'inline-input', type, 'aria-label': label });
    field.value = value || '';
    let finished = false;

    const finish = (save) => {
      if (finished) return;
      finished = true;
      const next = type === 'date' ? field.value : field.value.trim();
      field.replaceWith(button);
      if (save && next !== (value || '')) onCommit(next);
    };

    field.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
        button.focus();
      } else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish(true);
        button.focus();
      }
    });
    field.addEventListener('blur', () => finish(true));

    button.replaceWith(field);
    field.focus();
    if (type !== 'date' && field.select) field.select();
  });
  return button;
}
