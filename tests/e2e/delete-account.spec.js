const { test, expect } = require('@playwright/test');
const { installFakeFirebase, fakeCalls } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await page.route(/\/login\/\?deleted=1/, (route) => route.continue());
});

async function openDelete(page, user) {
  if (user) await signIn(page, user); else await signIn(page);
  await mockApi(page);
  await page.goto('/profile/');
  await page.getByRole('button', { name: 'Delete account…' }).click();
  return page.getByRole('alertdialog');
}

test('the profile page has a clearly separate Delete account section', async ({ page }) => {
  await signIn(page);
  await mockApi(page);
  await page.goto('/profile/');
  const section = page.getByRole('region', { name: 'Delete account' });
  await expect(section).toContainText('This can’t be undone');
  await expect(section.getByRole('button', { name: 'Delete account…' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0); // nothing happens without a confirmation
  expect((await fakeCalls(page)).some(([name]) => name === 'deleteUser')).toBe(false);
});

test('the dialog explains what happens and needs the password', async ({ page }) => {
  const dialog = await openDelete(page);
  await expect(dialog).toContainText('permanently deletes the account olena@example.com');
  await expect(dialog).toContainText('can’t be undone');
  await expect(dialog).toContainText('Export it as a PDF first');
  await expect(dialog.getByLabel('Enter your password to confirm')).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter your password to confirm.');
  expect((await fakeCalls(page)).some(([name]) => name === 'deleteUser' || name === 'reauthenticate')).toBe(false);
});

test('Cancel and Esc close it without deleting anything', async ({ page }) => {
  const dialog = await openDelete(page);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete account…' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete account…' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect((await fakeCalls(page)).some(([name]) => name === 'deleteUser')).toBe(false);
});

test('a wrong password is explained and nothing is deleted', async ({ page }) => {
  const dialog = await openDelete(page);
  await dialog.getByLabel('Enter your password to confirm').fill('nope');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('That password isn’t right. Try again.');
  await expect(dialog.getByRole('button', { name: 'Delete my account' })).toBeEnabled();
  await expect(dialog.getByLabel('Enter your password to confirm')).toBeEnabled();
  const calls = await fakeCalls(page);
  expect(calls.some(([name]) => name === 'reauthenticate')).toBe(true);
  expect(calls.some(([name]) => name === 'deleteUser')).toBe(false);
  await expect(page).toHaveURL(/\/profile\/$/);
});

test('with the right password the account is deleted, local data is wiped and the login page says so', async ({ page }) => {
  const dialog = await openDelete(page);
  await page.evaluate(() => {
    localStorage.setItem('plainerSignedIn', '1');
    localStorage.setItem('plainerTheme', 'dark');
    localStorage.setItem('plainerDismissed-1', '["h"]');
    sessionStorage.setItem('plainerChat-1', '{"messages":[],"history":[]}');
  });
  await dialog.getByLabel('Enter your password to confirm').fill('password123');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/login\/\?deleted=1$/);
  await expect(page.getByRole('status').filter({ hasText: 'Your account has been deleted.' })).toBeVisible();
  const kept = await page.evaluate(() => ({
    hint: localStorage.getItem('plainerSignedIn'), dismissed: localStorage.getItem('plainerDismissed-1'),
    chat: sessionStorage.getItem('plainerChat-1'), theme: localStorage.getItem('plainerTheme'),
  }));
  expect(kept).toEqual({ hint: null, dismissed: null, chat: null, theme: 'dark' });
  const calls = await fakeCalls(page);
  expect(calls.map(([name]) => name).filter((name) => ['reauthenticate', 'deleteUser'].includes(name))).toEqual(['reauthenticate', 'deleteUser']);
  // signed out for real: a protected page sends you to log in
  await page.goto('/trips/');
  await expect(page).toHaveURL(/\/login\/\?next=/);
});

test('while it works the buttons are locked, so it can’t be run twice', async ({ page }) => {
  await signIn(page);
  await mockApi(page);
  await page.addInitScript(() => sessionStorage.setItem('fakeSlow', '1'));
  await page.goto('/profile/');
  await page.getByRole('button', { name: 'Delete account…' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Enter your password to confirm').fill('password123');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await expect(page).toHaveURL(/\/login\/\?deleted=1$/);
  const deletes = (await fakeCalls(page)).filter(([name]) => name === 'deleteUser');
  expect(deletes.length).toBeLessThanOrEqual(1);
});

test('Firebase refusing for a recent-login reason is explained', async ({ page }) => {
  const dialog = await openDelete(page);
  await page.evaluate(() => sessionStorage.setItem('fakeDeleteError', 'auth/requires-recent-login'));
  await dialog.getByLabel('Enter your password to confirm').fill('password123');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByRole('alert')).toContainText('log in again');
  await expect(page).toHaveURL(/\/profile\/$/);
});

test('a network failure or unknown error shows a plain message, never a raw code', async ({ page }) => {
  const dialog = await openDelete(page);
  await page.evaluate(() => sessionStorage.setItem('fakeDeleteError', 'auth/internal-error'));
  await dialog.getByLabel('Enter your password to confirm').fill('password123');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Couldn’t delete your account. Please try again.');
  await expect(dialog).not.toContainText('auth/');
  await page.evaluate(() => sessionStorage.setItem('fakeDeleteError', 'auth/network-request-failed'));
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No connection');
});

test('an Apple or Google account is pointed to the app instead', async ({ page }) => {
  const dialog = await openDelete(page, { email: 'x@y.co', displayName: 'X', providerData: [{ providerId: 'apple.com' }] });
  await expect(dialog).toContainText('Apple or Google');
  await expect(dialog.getByLabel('Enter your password to confirm')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Delete my account' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('the login page shows no notice normally', async ({ page }) => {
  await page.goto('/login/');
  await expect(page.locator('#form-notice')).toHaveText('');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('the button and dialog controls are 44px tall and nothing scrolls sideways', async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.goto('/profile/');
    expect((await page.getByRole('button', { name: 'Delete account…' }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Delete account…' }).click();
    const dialog = page.getByRole('alertdialog');
    for (const name of ['Cancel', 'Delete my account']) {
      expect((await dialog.getByRole('button', { name }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});
