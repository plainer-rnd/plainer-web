const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

const writes = (requests) => requests.filter((r) => r.method !== 'GET');
const chatCalls = (requests) => writes(requests).filter((r) => r.path === '/api/trips/1/chat');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
});

async function openChat(page, options = {}) {
  await mockApi(page, options);
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Trip assistant' }).click();
  return page.getByRole('dialog', { name: 'Trip assistant' });
}

test('the assistant opens with an empty state and example prompts', async ({ page }) => {
  const dialog = await openChat(page);
  await expect(dialog).toContainText('Ask me to change your trip');
  await expect(dialog.getByRole('button', { name: /Add 3 days in Rome after Florence/ })).toBeVisible();
  await expect(dialog.getByLabel('Message to the assistant')).toBeFocused();
});

test('a request gets a proposal; nothing changes until Apply changes, then the page shows the result', async ({ page }) => {
  const requests = [];
  const dialog = await openChat(page, { requests });
  await dialog.getByLabel('Message to the assistant').fill('Add a day in Oslo');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.locator('.chat-bubble.user')).toHaveText('Add a day in Oslo');
  await expect(dialog.locator('.chat-bubble.assistant')).toContainText('I can add one more day in Oslo');
  await expect(dialog).toContainText('Generate a 1-day itinerary for Oslo');
  expect(chatCalls(requests)).toHaveLength(1);
  expect(chatCalls(requests)[0].body).toEqual({ messages: [{ role: 'user', content: 'Add a day in Oslo' }] });
  await expect(page.locator('#days-list .ghead b').first()).toHaveText('Oslo · 2 days');

  await dialog.getByRole('button', { name: 'Apply changes' }).click();
  await expect(dialog.locator('.chat-bubble.assistant').last()).toHaveText('Done! I added a day in Oslo.');
  await expect(dialog.locator('.chat-card', { hasText: 'Extra day in Oslo' })).toContainText('New');
  // confirming carries the plan id and the same history, with no extra user message
  expect(chatCalls(requests)[1].body).toEqual({
    messages: [{ role: 'user', content: 'Add a day in Oslo' }, { role: 'assistant', content: 'I can add one more day in Oslo. Shall I go ahead?' }],
    actionPlanId: 'plan-1',
  });
  await expect(dialog.getByRole('button', { name: 'Apply changes' })).toHaveCount(0);
  // the trip behind the dialog was read back
  await expect(page.locator('#days-list .ghead b').first()).toHaveText('Oslo · 3 days');
  await expect(page.locator('#days-list .day-title', { hasText: 'Extra day in Oslo' })).toBeVisible();
});

test('Cancel tells the assistant no and changes nothing', async ({ page }) => {
  const requests = [];
  const dialog = await openChat(page, { requests });
  await dialog.getByLabel('Message to the assistant').fill('Add a day in Oslo');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.locator('.chat-bubble.user').last()).toHaveText('No, cancel that.');
  await expect(dialog.locator('.chat-bubble.assistant').last()).toHaveText('Okay, I won’t change anything.');
  await expect(dialog.getByRole('button', { name: 'Apply changes' })).toHaveCount(0);
  expect(chatCalls(requests).every((r) => !r.body.actionPlanId)).toBe(true);
  await expect(page.locator('#days-list .ghead b').first()).toHaveText('Oslo · 2 days');
});

test('out-of-scope and clarification replies are plain answers with no buttons', async ({ page }) => {
  const dialog = await openChat(page);
  await dialog.getByLabel('Message to the assistant').fill('What is the weather?');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.locator('.chat-bubble.assistant')).toHaveText('I can only help with your trip plan.');
  await dialog.getByLabel('Message to the assistant').fill('Go somewhere nice');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.locator('.chat-bubble.assistant').last()).toHaveText('Which place do you mean?');
  await expect(dialog.getByRole('button', { name: 'Apply changes' })).toHaveCount(0);
});

test('the whole conversation is sent each time, Enter sends and Shift+Enter adds a line', async ({ page }) => {
  const requests = [];
  const dialog = await openChat(page, { requests });
  const input = dialog.getByLabel('Message to the assistant');
  await input.fill('What is the weather?');
  await input.press('Enter');
  await expect(dialog.locator('.chat-bubble.assistant')).toHaveCount(1);
  await input.fill('line one');
  await input.press('Shift+Enter');
  await input.type('line two');
  await expect(input).toHaveValue('line one\nline two');
  await input.press('Enter');
  await expect(dialog.locator('.chat-bubble.assistant')).toHaveCount(2);
  expect(chatCalls(requests)[1].body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  expect(chatCalls(requests)[1].body.messages[2].content).toBe('line one\nline two');
});

test('empty messages are refused locally and an example chip sends itself', async ({ page }) => {
  const requests = [];
  const dialog = await openChat(page, { requests });
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Type a message first.');
  expect(chatCalls(requests)).toHaveLength(0);
  await dialog.getByRole('button', { name: /Add 3 days in Rome after Florence/ }).click();
  await expect(dialog.locator('.chat-bubble.user')).toHaveText('Add 3 days in Rome after Florence');
  expect(chatCalls(requests)).toHaveLength(1);
});

test('a failed request shows the server’s message and Retry sends it again', async ({ page }) => {
  let fail = true;
  const requests = [];
  const dialog = await openChat(page, { requests });
  await page.route('**/api/trips/1/chat', async (route) => {
    if (fail) { fail = false; return route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'The assistant is busy right now.' } }) }); }
    return route.fallback();
  });
  await dialog.getByLabel('Message to the assistant').fill('Add a day in Oslo');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: 'The assistant is busy right now.' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(dialog.locator('.chat-bubble.assistant')).toContainText('I can add one more day in Oslo');
  await expect(dialog.locator('.chat-bubble.user')).toHaveCount(1); // no duplicate bubble
  await expect(dialog.getByRole('button', { name: 'Retry' })).toHaveCount(0);
});

test('while waiting, a thinking indicator shows and Send is disabled', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/trips/1/chat', async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.fallback(); });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Trip assistant' }).click();
  const dialog = page.getByRole('dialog', { name: 'Trip assistant' });
  await dialog.getByLabel('Message to the assistant').fill('Add a day in Oslo');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.locator('.typing')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send' })).toBeDisabled();
  await expect(dialog.locator('.typing')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Send' })).toBeEnabled();
});

test('closing and reopening keeps the conversation; New chat clears it', async ({ page }) => {
  const dialog = await openChat(page);
  await dialog.getByLabel('Message to the assistant').fill('Add a day in Oslo');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.locator('.chat-bubble.assistant')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Trip assistant' }).click();
  const again = page.getByRole('dialog', { name: 'Trip assistant' });
  await expect(again.locator('.chat-bubble.user')).toHaveText('Add a day in Oslo');
  await expect(again.getByRole('button', { name: 'Apply changes' })).toBeVisible();
  await again.getByRole('button', { name: 'New chat' }).click();
  await expect(again.locator('.chat-bubble')).toHaveCount(0);
  await expect(again).toContainText('Ask me to change your trip');
});

test('the text is capped at 2000 characters and names are never markup', async ({ page }) => {
  const dialog = await openChat(page);
  await expect(dialog.getByLabel('Message to the assistant')).toHaveAttribute('maxlength', '2000');
  await dialog.getByLabel('Message to the assistant').fill('<img src=x onerror="window.pwned=1"> Add a day in Oslo');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.locator('.chat-bubble.user')).toContainText('<img src=x onerror="window.pwned=1">');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
});

test('a shared (view-only) trip has no assistant', async ({ page }) => {
  await mockApi(page, { sharedWithMe: [{ id: 5, name: 'Lisbon with Olena', shareId: 50, sharedBy: 'Olena' }] });
  await page.goto('/trip/?id=5');
  await expect(page.locator('#trip-name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Trip assistant' })).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('the assistant button is a 44px icon and the chat fits the screen', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=1');
    const box = await page.getByRole('button', { name: 'Trip assistant' }).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Trip assistant' }).click();
    const dialog = page.getByRole('dialog', { name: 'Trip assistant' });
    await expect(dialog.getByRole('button', { name: 'Send' })).toBeVisible();
    const fit = await dialog.boundingBox();
    expect(fit.height).toBeLessThanOrEqual(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});
