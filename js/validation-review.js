// "Review" dialog: lists the trip's validation issues (critical first), lets people dismiss them, and for each one
// loads the server's fix suggestions and applies the one they pick. Same flow as the Plainer app.
import { el } from './dom.js';
import { openDialog } from './dialogs.js';
import { generatedDaysBody, plural } from './trip-model.js';
import {
  activeIssues, fixErrorMessage, fixRequestFrom, groupIssues, isDismissed, issuesFromValidation,
} from './validation-model.js';

export function openReviewDialog({ api, tripId, getValidation, getDismissed, setDismissed, onFixed, insertIndexFor }) {
  const body = el('div', { class: 'review-body' });
  const { dialog, close } = openDialog({
    title: 'Review your trip',
    description: 'Problems we found in this trip, and ways to fix them. Dismiss anything you’re happy with.',
    content: [body],
  });
  dialog.classList.add('review-dialog');
  let requestId = 0;

  const button = (text, className, handler) => {
    const node = el('button', { type: 'button', class: `btn ${className} btn-sm`, text });
    node.addEventListener('click', handler);
    return node;
  };

  function issueCard(issue) {
    const actions = el('div', { class: 'issue-actions' }, [
      button('Dismiss', 'btn-outline', () => {
        const next = new Set(getDismissed());
        if (issue.hash) next.add(issue.hash);
        setDismissed(next);
        showIssues('Dismissed.');
      }),
      issue.hasFixOptions && issue.hash ? button('Fix this', 'btn-primary', () => showSuggestions(issue)) : null,
    ]);
    return el('article', { class: `issue-card ${issue.tier}` }, [
      el('p', { class: 'issue-message', text: issue.message }),
      issue.suggestion ? el('p', { class: 'muted small issue-tip', text: `Tip: ${issue.suggestion}` }) : null,
      issue.hasFixOptions ? null : el('p', { class: 'muted small issue-tip', text: 'Remove this stop and add it again with a different place.' }),
      actions,
    ]);
  }

  function section(title, tier, issues) {
    if (!issues.length) return null;
    return el('section', { class: `review-section ${tier}` }, [
      el('h3', { class: 'review-h', text: `${title} (${issues.length})` }),
      ...groupIssues(issues).map((group) => el('div', { class: 'issue-group' }, [
        el('h4', { text: group.title }),
        ...group.items.map(issueCard),
      ])),
    ]);
  }

  function showIssues(message = '') {
    requestId += 1;
    const all = issuesFromValidation(getValidation());
    const dismissed = getDismissed();
    const active = activeIssues(all, dismissed);
    const hiddenCount = all.length - active.length;
    const restore = hiddenCount
      ? button(`Show ${plural(hiddenCount, 'dismissed issue')}`, 'btn-outline', () => { setDismissed(new Set()); showIssues(''); })
      : null;
    const done = button('Close', 'btn-outline', close);
    body.replaceChildren(...[
      el('p', { class: 'review-status', role: 'status', 'aria-live': 'polite', text: message }),
      active.length
        ? null
        : el('div', { class: 'review-empty' }, [el('b', { text: 'Your trip looks great!' }), el('span', { class: 'muted', text: 'No active validation issues found.' })]),
      section('Critical', 'critical', active.filter((issue) => issue.tier === 'critical')),
      section('Advisory', 'advisory', active.filter((issue) => issue.tier === 'advisory')),
      el('div', { class: 'dialog-actions' }, [restore, done]),
    ].filter(Boolean));
    const first = body.querySelector('.issue-actions button:last-child') || done;
    if (message) first.focus();
  }

  async function callFix(request) {
    if (request.method === 'DELETE') return api.delete(request.endpoint);
    if (request.method === 'PUT') return api.put(request.endpoint, request.body);
    return api.post(request.endpoint, request.body);
  }

  function showSuggestions(issue) {
    const mine = ++requestId;
    const back = button('← Issues', 'btn-outline', () => showIssues(''));
    const error = el('p', { class: 'error', role: 'alert' });
    const loading = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }, [el('span', { class: 'spinner small', 'aria-hidden': 'true' }), ' Loading suggestions…']);
    const list = el('div', { class: 'option-list' });
    body.replaceChildren(
      el('div', { class: 'review-back' }, back),
      el('h3', { class: 'review-h', text: issue.name }),
      el('p', { class: 'issue-message', text: issue.message }),
      error, loading, list,
    );
    back.focus();

    const apply = async (option, trigger, applyButtons) => {
      error.textContent = '';
      applyButtons.forEach((node) => { node.disabled = true; });
      trigger.textContent = 'Applying…';
      const request = fixRequestFrom(option.fixInfo, tripId);
      try {
        if (!request) throw Object.assign(new Error('This fix can’t be applied from the web. Use the Plainer app.'), { status: 400 });
        const result = await callFix(request);
        if (request.generateForStop !== null) {
          // The server only writes the text of the days; saving them is up to us.
          if (!Array.isArray(result) || !result.length) throw Object.assign(new Error('No days came back. Please try again.'), { status: 400 });
          await api.post(`trips/${tripId}/days/batch`, generatedDaysBody(request.generateForStop, insertIndexFor(request.generateForStop), result));
        }
      } catch (failure) {
        if (!dialog.isConnected || mine !== requestId) return;
        error.textContent = fixErrorMessage(failure.status, failure.message);
        applyButtons.forEach((node) => { node.disabled = false; });
        trigger.textContent = 'Apply';
        return;
      }
      try {
        await onFixed();
      } catch (failure) {
        if (dialog.isConnected) { showIssues('Fix applied, but the page couldn’t refresh. Reload to see the latest.'); }
        return;
      }
      if (dialog.isConnected) showIssues('Fix applied.');
    };

    api.post(`trips/${tripId}/suggest`, { issueHash: issue.hash, issueCode: issue.code, entityId: issue.entityId })
      .then((response) => {
        if (!dialog.isConnected || mine !== requestId) return;
        loading.remove();
        const options = (response && response.options) || [];
        if (!options.length) {
          list.replaceChildren(el('p', { class: 'muted', text: 'No suggestions are available for this issue.' }));
          return;
        }
        const applyButtons = [];
        options.forEach((option) => {
          const trigger = el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Apply' });
          applyButtons.push(trigger);
          trigger.addEventListener('click', () => apply(option, trigger, applyButtons));
          list.append(el('div', { class: 'option-card' }, [el('p', { text: option.suggestion }), trigger]));
        });
      })
      .catch((failure) => {
        if (!dialog.isConnected || mine !== requestId) return;
        loading.remove();
        error.textContent = fixErrorMessage(failure.status, failure.message);
      });
  }

  showIssues('');
}
