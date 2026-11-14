// Trip assistant: a chat where the owner asks for changes in plain language. The server proposes what it would do,
// nothing changes until the user confirms, and the page then reads the trip back.
// It is a side panel, not a modal window: the trip stays visible and editable next to it. Hiding the panel keeps the
// conversation, the unsent draft and whether it was open; they also survive a reload of the page (this browser tab only).
import { el } from './dom.js';
import {
  EXAMPLE_PROMPTS, MAX_MESSAGE_CHARS, canAddMessage, changeCards, changedTheTrip, chatErrorMessage, historyAfterReply, kindLabel, messageProblem, needsConfirmation,
} from './chat-model.js';

let nextId = 0;
const newId = () => `m${++nextId}`;

const storageKey = (tripId) => `plainerChat-${tripId}`;

function readSaved(tripId) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(storageKey(tripId)) || 'null');
    if (!saved || !Array.isArray(saved.messages) || !Array.isArray(saved.history)) return null;
    const messages = saved.messages
      .filter((m) => m && ['user', 'assistant', 'error'].includes(m.role) && typeof m.text === 'string')
      .map((m) => ({ ...m, id: newId() }));
    const history = saved.history.filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string');
    return { messages, history, draft: typeof saved.draft === 'string' ? saved.draft : '', open: saved.open === true };
  } catch (error) {
    return null;
  }
}

function writeSaved(tripId, value) {
  try {
    if (!value.messages.length && !value.draft && !value.open) window.sessionStorage.removeItem(storageKey(tripId));
    else window.sessionStorage.setItem(storageKey(tripId), JSON.stringify(value));
  } catch (error) { /* storage blocked: the conversation just lasts until the page is reloaded */ }
}

export function createTripChat({ api, tripId, onChanged, opener }) {
  const saved = readSaved(tripId);
  let messages = saved ? saved.messages : [];
  let history = saved ? saved.history : [];
  let sending = false;
  let isOpen = false;

  const list = el('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  const input = el('textarea', { class: 'picker-input chat-input', rows: '2', maxlength: String(MAX_MESSAGE_CHARS), 'aria-label': 'Message to the assistant', placeholder: 'e.g. Add 2 days in Bergen' });
  input.value = saved ? saved.draft : '';
  const note = el('p', { class: 'error', role: 'alert' });
  const sendButton = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Send' });
  const newChatButton = el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'New chat' });
  const closeButton = el('button', { type: 'button', class: 'icon-btn plain sm', 'aria-label': 'Hide the assistant', title: 'Hide the assistant', text: '✕' });
  const form = el('form', { class: 'chat-form', novalidate: true }, [note, input, el('div', { class: 'chat-form-actions' }, [el('span', { class: 'chat-hint muted small', text: 'Enter to send' }), sendButton])]);
  const panel = el('aside', { class: 'chat-panel', id: 'chat-panel', 'aria-label': 'Trip assistant', hidden: true }, [
    el('div', { class: 'chat-head' }, [
      el('div', {}, [el('h2', { text: 'Trip assistant' }), el('p', { class: 'muted small', text: 'Changes happen only after you confirm them.' })]),
      el('div', { class: 'chat-head-actions' }, [newChatButton, closeButton]),
    ]),
    list, form,
  ]);
  document.body.append(panel);

  function persist() {
    writeSaved(tripId, {
      messages: messages.map(({ id, ...rest }) => rest),
      history,
      draft: input.value,
      open: isOpen,
    });
  }

  async function exchange(outgoing, actionPlanId, retryInfo) {
    sending = true;
    render();
    let changed = false;
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
      changed = changedTheTrip(response);
    } catch (failure) {
      messages.push({ id: newId(), role: 'error', text: chatErrorMessage(failure.status, failure.message), retry: retryInfo });
    }
    sending = false;
    render();
    // The reply is on screen first; the trip is read back afterwards (the page may hold this until the user stops typing).
    if (changed) {
      try { await onChanged(); } catch (error) { /* the next refresh picks the changes up */ }
    }
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
    exchange(history, message.planId, { kind: 'confirm', planId: message.planId });
  }

  function cancel(message) {
    if (sending) return;
    message.resolved = true;
    send('No, cancel that.');
  }

  function retry(message) {
    if (sending) return;
    messages = messages.filter((m) => m.id !== message.id);
    if (message.retry.kind === 'confirm') exchange(history, message.retry.planId, message.retry);
    else exchange([...history, { role: 'user', content: message.retry.text }], undefined, message.retry);
  }

  function newChat() {
    if (sending) return;
    messages = [];
    history = [];
    render();
    input.focus();
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
    (message.actions || []).forEach((description) => parts.push(el('div', { class: 'chat-card' }, [el('span', { class: 'chat-card-icon', 'aria-hidden': 'true', text: '✓' }), el('span', { text: description })])));
    (message.cards || []).forEach((card) => parts.push(el('div', { class: 'chat-card' }, [
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
    const full = !canAddMessage(history);
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80; // keep the place if they scrolled up to read
    list.replaceChildren(...[
      messages.length ? null : emptyState(),
      ...messages.map(messageNode),
      sending ? el('div', { class: 'chat-row', role: 'status' }, [
        el('span', { class: 'chat-avatar', 'aria-hidden': 'true', text: '✦' }),
        el('div', { class: 'chat-bubble assistant typing' }, [el('span', { class: 'visually-hidden', text: 'The assistant is thinking' }), el('i'), el('i'), el('i')]),
      ]) : null,
      full ? el('p', { class: 'muted small chat-note', text: 'This conversation is getting long. Start a new chat to continue.' }) : null,
    ].filter(Boolean));
    sendButton.disabled = sending || full;
    newChatButton.hidden = messages.length === 0;
    list.setAttribute('aria-busy', String(sending));
    if (stick || sending) list.scrollTop = list.scrollHeight;
    persist();
  }

  function setOpen(open, { focus = true } = {}) {
    if (open === isOpen) return;
    isOpen = open;
    panel.hidden = !open;
    document.documentElement.classList.toggle('chat-open', open);
    if (opener) opener.setAttribute('aria-expanded', String(open));
    // the page changed width: let the map redraw
    window.dispatchEvent(new Event('resize'));
    if (open) {
      list.scrollTop = list.scrollHeight;
      if (focus) input.focus();
    } else if (focus && opener) {
      opener.focus();
    }
    persist();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (sending) return;
    const problem = messageProblem(input.value);
    if (problem) { note.textContent = problem; input.focus(); return; }
    note.textContent = '';
    if (send(input.value)) input.value = '';
    persist();
    input.focus();
  });
  input.addEventListener('input', persist);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); setOpen(false); }
  });
  newChatButton.addEventListener('click', newChat);
  closeButton.addEventListener('click', () => setOpen(false));

  render();
  return {
    toggle: () => setOpen(!isOpen),
    open: (options) => setOpen(true, options),
    close: () => setOpen(false),
    wasOpen: Boolean(saved && saved.open),
  };
}
