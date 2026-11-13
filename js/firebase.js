// Firebase Auth (shared with the iOS app) and the session helpers every page uses.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { config } from './config.js';
import { safeNext } from './auth-utils.js';

if (config.firebase.apiKey.startsWith('REPLACE_')) {
  throw new Error('js/config.js still has placeholder Firebase values for the ' + config.name + ' environment.');
}

const app = initializeApp(config.firebase);
const auth = getAuth(app);

// Read by js/site.js so the public header can show "My trips" without loading Firebase.
function rememberSignedIn(signedIn) {
  try {
    if (signedIn) localStorage.setItem('plainerSignedIn', '1');
    else localStorage.removeItem('plainerSignedIn');
  } catch (e) { /* storage blocked: the header just keeps showing "Log in" */ }
}

const firstState = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    rememberSignedIn(Boolean(user));
    unsubscribe();
    resolve(user);
  });
});

// Keeps the hint current for the rest of the page's life.
onAuthStateChanged(auth, (user) => rememberSignedIn(Boolean(user)));

// Resolves once Firebase has restored the session: the user, or null.
export function getUser() {
  return firstState;
}

// For protected pages: resolves with the user, or sends the visitor to /login/ and never resolves.
export async function requireUser() {
  const user = await getUser();
  if (user) return user;
  const here = location.pathname + location.search;
  location.replace('/login/?next=' + encodeURIComponent(here));
  return new Promise(() => {});
}

export function nextUrl() {
  return safeNext(new URLSearchParams(location.search).get('next'));
}

export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function signUp(name, email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  // The account exists at this point; a failed email is recoverable through the banner's resend link.
  await sendEmailVerification(credential.user).catch(() => {});
  return credential.user;
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

export function resendVerification(user) {
  return sendEmailVerification(user);
}

export async function signOut() {
  await firebaseSignOut(auth);
  rememberSignedIn(false);
}

export { auth };
