const { test, expect } = require('@playwright/test');
const { installFakeFirebase, fakeCalls } = require('./fake-firebase');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  // /trips/ does not exist until stage 2; a stub lets redirects land somewhere.
  await page.route('**/trips/', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Trips</title>' }));
  await page.route('**/trip/?id=*', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Trip</title>' }));
});

test.describe('login', () => {
  test('empty email shows an inline error linked to the field', async ({ page }) => {
    await page.goto('/login/');
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    const email = page.getByLabel('Email');
    await expect(page.locator('#email-error')).toHaveText('Enter your email address.');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', 'email-error');
  });

  test('wrong credentials show a plain message, not the Firebase code', async ({ page }) => {
    await page.goto('/login/');
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await page.getByLabel('Email').fill('ok@example.com');
    await page.getByLabel('Password').fill('nope');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('#form-error')).toContainText('don’t match');
    await expect(page.locator('#form-error')).not.toContainText('auth/');
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  });

  test('success goes to /trips/ by default', async ({ page }) => {
    await page.goto('/login/');
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await page.getByLabel('Email').fill('ok@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/trips\/$/);
  });

  test('success honours a safe next and ignores an unsafe one', async ({ page }) => {
    await page.goto('/login/?next=' + encodeURIComponent('/trip/?id=5'));
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await page.getByLabel('Email').fill('ok@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/trip\/\?id=5$/);

    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/login/?next=' + encodeURIComponent('https://evil.example'));
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await page.getByLabel('Email').fill('ok@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/trips\/$/);
  });

  test('already signed in redirects away', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('fakeUser', JSON.stringify({ email: 'ok@example.com' })));
    await page.goto('/login/');
    await expect(page).toHaveURL(/\/trips\/$/);
  });

  test('forgot password needs an email, then confirms without revealing the account', async ({ page }) => {
    await page.goto('/login/');
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.locator('#email-error')).toContainText('Enter your email above');
    await page.getByLabel('Email').fill('someone@example.com');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.locator('#form-notice')).toContainText('If an account exists for someone@example.com');
    expect(await fakeCalls(page)).toContainEqual(['sendPasswordResetEmail', 'someone@example.com']);
  });
});

test.describe('sign-up', () => {
  test('rejects a short password', async ({ page }) => {
    await page.goto('/signup/');
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await page.getByLabel('Your name').fill('Olena');
    await page.getByLabel('Email').fill('new@example.com');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#password-error')).toContainText('at least 8 characters');
  });

  test('existing email is reported under the email field', async ({ page }) => {
    await page.goto('/signup/');
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await page.getByLabel('Your name').fill('Olena');
    await page.getByLabel('Email').fill('taken@example.com');
    await page.getByLabel('Password').fill('longenough1');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#email-error')).toContainText('already exists');
  });

  test('success saves the name, sends verification and opens /trips/', async ({ page }) => {
    await page.goto('/signup/');
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await page.getByLabel('Your name').fill('Olena');
    await page.getByLabel('Email').fill('new@example.com');
    await page.getByLabel('Password').fill('longenough1');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/trips\/$/);
    const calls = await fakeCalls(page);
    expect(calls).toContainEqual(['updateProfile', { displayName: 'Olena' }]);
    expect(calls.map((c) => c[0])).toContain('sendEmailVerification');
  });
});

test.describe('theme', () => {
  test('follows the OS setting before first paint and remembers the choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login/');
    await page.locator('form[data-ready]').waitFor({ state: 'attached' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const toggle = page.getByRole('button', { name: 'Switch to light theme' });
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  });

  test('the stored theme is applied before the stylesheet paints', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('plainerTheme', 'dark'));
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(38, 40, 44)');
  });
});

test.describe('public header', () => {
  test('desktop shows Log in, then My trips once signed in', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const link = page.locator('.site-nav--desktop [data-account-link]');
    await expect(link).toHaveText('Log in');
    await expect(link).toHaveAttribute('href', '/login/');
    await page.evaluate(() => localStorage.setItem('plainerSignedIn', '1'));
    await page.reload();
    await expect(link).toHaveText('My trips');
    await expect(link).toHaveAttribute('href', '/trips/');
  });

  test('phone shows toggle, person icon and menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Switch to (dark|light) theme/ }).last()).toBeVisible();
    const person = page.locator('.site-header__phone-tools [data-account-link]');
    await expect(person).toBeVisible();
    await expect(person).toHaveAttribute('href', '/login/');
    await expect(page.locator('.nav-menu')).toBeVisible();
  });
});

test.describe('responsive', () => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const path of ['/login/', '/signup/', '/', '/support/', '/policy/']) {
      for (const scheme of ['light', 'dark']) {
        test(`no sideways scroll at ${width}px on ${path} (${scheme})`, async ({ page }) => {
          await page.emulateMedia({ colorScheme: scheme });
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow).toBeLessThanOrEqual(0);
        });
      }
    }
  }
});
