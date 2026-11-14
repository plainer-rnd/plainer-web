// Trip assistant: a chat where the owner asks for changes in plain language. The server proposes what it would do,
// nothing changes until the user confirms, and the page then reads the trip back. The conversation lives in memory
// for this page visit; closing the window doesn't lose it, and a reply that arrives meanwhile is kept.
import { el } from './dom.js';
import { openDialog } from './dialogs.js';
import {
  EXAMPLE_PROMPTS, MAX_MESSAGE_CHARS, canAddMessage, changeCards, changedTheTrip, chatErrorMessage, historyAfterReply, kindLabel, messageProblem, needsConfirmation,
} from './chat-model.js';

let nextId = 0;
const newId = () => `m${++nextId}`;

export function createTripChat({ api, tripId, onChanged }) {
  let messages = [];
  let history = [];
  let sending = false;
  let view = null;

  async function exchange(outgoing, actionPlanId, onError) {
    sending = true;
    render();
    try {
      const response = await api.post(`trips/${tripId}/chat`, { messages: outgoing, actionPlanId });
      history = historyAfterReply(outgoing, response.reply);
      const pending = needsConfirmation(response);
      messages.push({
        id: newId(),
        role: 'assistant',
        text: response.reply,
        actions: (response.proposedActions || []).map((action) => action.description),
        cards: changeCards(response),
        planId: pending ? response.actionPlanId : null,
        resolved: false,
      });
      if (changedTheTrip(response)) {
        try { await onChanged(); } catch (error) { /* the reply is still shown; reloading the page picks the changes up */ }
      }
    } catch (failure) {
      messages.push({ id: newId(), role: 'error', text: chatErrorMessage(failure.status, failure.message), retry: onError });
    }
    sending = false;
    render();
  }

  function send(text) {
    const trimmed = text.trim();
    if (sending || messageProblem(trimmed) || !canAddMessage(history)) return false;
    messages.push({ id: newId(), role: 'user', text: trimmed });
    exchange([...history, { role: 'user', content: trimmed }], undefined, { kind: 'send', text: trimmed });
    return true;
  }

  function confirm(message) {
    if (sending || !message.planId) return;
    message.resolved = true;
    exchange(history, message.planId, { kind: 'confirm', message });
  }

  function cancel(message) {
    if (sending) return;
    message.resolved = true;
    send('No, cancel that.');
  }

  function retry(message) {
    if (sending) return;
    messages = messages.filter((m) => m.id !== message.id);
    if (message.retry.kind === 'confirm') exchange(history, message.retry.message.planId, message.retry);
    else exchange([...history, { role: 'user', content: message.retry.text }], undefined, message.retry);
  }

  function newChat() {
    if (sending) return;
    messages = [];
    history = [];
    render();
    if (view) view.input.focus();
  }

  const button = (text, className, handler) => {
    const node = el('button', { type: 'button', class: `btn ${className} btn-sm`, text });
    node.addEventListener('click', handler);
    return node;
  };

  function assistantGroup(message) {
    const parts = [el('div', { class: 'chat-row' }, [
      el('span', { class: 'chat-avatar', 'aria-hidden': 'true', text: '✦' }),
      el('div', { class: 'chat-bubble assistant', text: message.text }),
    ])];
    message.actions.forEach((description) => parts.push(el('div', { class: 'chat-card' }, [el('span', { class: 'chat-card-icon', 'aria-hidden': 'true', text: '✓' }), el('span', { text: description })])));
    message.cards.forEach((card) => parts.push(el('div', { class: 'chat-card' }, [
      el('span', { class: 'chat-card-icon', 'aria-hidden': 'true', text: card.kind === 'other' ? '✓' : kindLabel(card.kind)[0] }),
      el('span', { text: card.name }),
      el('span', { class: `chat-badge ${card.badge === 'Deleted' ? 'deleted' : ''}`, text: card.badge }),
    ])));
    if (message.planId && !message.resolved) {
      parts.push(el('div', { class: 'chat-confirm' }, [
        button('Cancel', 'btn-outline', () => cancel(message)),
        button('Apply changes', 'btn-primary', () => confirm(message)),
      ]));
    }
    return el('div', { class: 'chat-group' }, parts);
  }

  function messageNode(message) {
    if (message.role === 'user') return el('div', { class: 'chat-row user' }, el('div', { class: 'chat-bubble user', text: message.text }));
    if (message.role === 'error') {
      return el('div', { class: 'chat-error', role: 'alert' }, [el('span', { text: message.text }), message.retry ? button('Retry', 'btn-outline', () => retry(message)) : null]);
    }
    return assistantGroup(message);
  }

  function emptyState() {
    const chips = EXAMPLE_PROMPTS.map((example) => button(`“${example}”`, 'btn-outline', () => send(example)));
    return el('div', { class: 'chat-empty' }, [
      el('span', { class: 'chat-avatar big', 'aria-hidden': 'true', text: '✦' }),
      el('b', { text: 'Ask me to change your trip' }),
      el('span', { class: 'muted', text: 'Describe what you want in plain language: add days, create stops, or edit the plan. I’ll show what I’m going to do and wait for your OK.' }),
      el('div', { class: 'chat-examples' }, chips),
    ]);
  }

  function render() {
    if (!view) return;
    const full = !canAddMessage(history);
    view.list.replaceChildren(...[
      messages.length ? null : emptyState(),
      ...messages.map(messageNode),
      sending ? el('div', { class: 'chat-row', role: 'status' }, [
        el('span', { class: 'chat-avatar', 'aria-hidden': 'true', text: '✦' }),
        el('div', { class: 'chat-bubble assistant typing' }, [el('span', { class: 'visually-hidden', text: 'The assistant is thinking' }), el('i'), el('i'), el('i')]),
      ]) : null,
      full ? el('p', { class: 'muted small chat-note', text: 'This conversation is getting long. Start a new chat to continue.' }) : null,
    ].filter(Boolean));
    view.send.disabled = sending || full;
    view.newChat.hidden = messages.length === 0;
    view.list.setAttribute('aria-busy', String(sending));
    view.list.scrollTop = view.list.scrollHeight;
  }

  function open() {
    const list = el('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
    const input = el('textarea', { class: 'picker-input chat-input', rows: '2', maxlength: String(MAX_MESSAGE_CHARS), 'aria-label': 'Message to the assistant', placeholder: 'e.g. Add 2 days in Bergen' });
    const sendButton = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Send' });
    const newChatButton = button('New chat', 'btn-outline', newChat);
    const close = el('button', { type: 'button', class: 'btn btn-outline', text: 'Close' });
    const note = el('p', { class: 'error', role: 'alert' });
    const form = el('form', { method: 'dialog', class: 'chat-form', novalidate: true }, [
      note, input,
      el('div', { class: 'chat-form-actions' }, [newChatButton, el('span', { class: 'spacer' }), close, sendButton]),
    ]);
    const dialog = openDialog({
      title: 'Trip assistant',
      description: 'Changes happen only after you confirm them.',
      content: [list, form],
    });
    dialog.dialog.classList.add('chat-dialog');
    view = { list, input, send: sendButton, newChat: newChatButton };
    dialog.dialog.addEventListener('close', () => { view = null; });
    close.addEventListener('click', dialog.close);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const problem = messageProblem(input.value);
      if (sending) return;
      if (problem) { note.textContent = problem; input.focus(); return; }
      note.textContent = '';
      if (send(input.value)) input.value = '';
      input.focus();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
    });
    render();
    input.focus();
  }

  return { open };
}
