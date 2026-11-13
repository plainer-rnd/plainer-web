// Small DOM helpers shared by the login and sign-up pages.

export function setBusy(button, busy) {
  button.disabled = busy;
  if (busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

// Shows a message under a field (or the form), linked to the input for screen readers.
export function showError(errorElement, message, input) {
  errorElement.textContent = message;
  if (!input) return;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', errorElement.id);
}

export function clearErrors(form) {
  form.querySelectorAll('.error').forEach((element) => { element.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((input) => {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  });
}

// Routes a { field, message } from describeAuthError to the matching error element.
export function showAuthError(form, described, fields) {
  const target = fields[described.field] || fields.form;
  showError(target.error, described.message, target.input);
  if (target.input) target.input.focus();
}
