// Replaces config.js and the Firebase CDN modules so the E2E tests need no network or credentials.
const FAKE_CONFIG = `export const config = { name: 'test', firebase: { apiKey: 'test', authDomain: 'test' }, apiBaseUrl: 'https://api.test' };`;

const FAKE_APP = `export const initializeApp = () => ({});`;

const FAKE_AUTH = `
const KEY = 'fakeUser';
const read = () => {
  try {
    const u = JSON.parse(sessionStorage.getItem(KEY));
    return u && { ...u, emailVerified: u.emailVerified !== false, getIdToken: async () => sessionStorage.getItem('fakeToken') || 'fake-token' };
  } catch (e) { return null; }
};
const write = (u) => (u ? sessionStorage.setItem(KEY, JSON.stringify(u)) : sessionStorage.removeItem(KEY));
const log = (name, arg) => { const calls = JSON.parse(sessionStorage.getItem('fakeCalls') || '[]'); calls.push([name, arg]); sessionStorage.setItem('fakeCalls', JSON.stringify(calls)); };
const fail = (code) => Promise.reject(Object.assign(new Error(code), { code }));
export const getAuth = () => ({});
export const onAuthStateChanged = (auth, cb) => { setTimeout(() => cb(read()), 0); return () => {}; };
export const signInWithEmailAndPassword = async (auth, email, pw) => {
  if (email === 'ok@example.com' && pw === 'password123') { const u = { email, displayName: 'Olena' }; write(u); return { user: u }; }
  return fail('auth/invalid-credential');
};
export const createUserWithEmailAndPassword = async (auth, email) => {
  if (email === 'taken@example.com') return fail('auth/email-already-in-use');
  const u = { email, displayName: null }; write(u); return { user: u };
};
export const updateProfile = async (user, p) => { log('updateProfile', p); write({ ...user, ...p }); };
export const sendEmailVerification = async () => { log('sendEmailVerification'); };
export const sendPasswordResetEmail = async (auth, email) => { log('sendPasswordResetEmail', email); };
export const reload = async () => {};
export const signOut = async () => write(null);
`;

async function installFakeFirebase(page) {
  await page.route('**/js/config.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_CONFIG }));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_APP }));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_AUTH }));
  // Fonts are irrelevant to behaviour and slow when offline.
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
}

async function fakeCalls(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('fakeCalls') || '[]'));
}

module.exports = { installFakeFirebase, fakeCalls };
