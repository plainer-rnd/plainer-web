import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJoinCode, joinLink, appOpenUrl, isIosDevice, loginUrl, previewErrorKind, previewErrorText, joinErrorMessage,
} from '../../js/join-model.js';

const CODE = '7f1f8c0e-5b8a-4f27-9d73-0d2b9a0f6c11';

test('parseJoinCode accepts only a GUID and normalises it', () => {
  assert.equal(parseJoinCode(`?code=${CODE}`), CODE);
  assert.equal(parseJoinCode(`?code=${CODE.toUpperCase()}`), CODE);
  assert.equal(parseJoinCode(`?x=1&code=%20${CODE}%20`), CODE);
  for (const bad of ['', '?code=', '?code=abc', `?code=${CODE}x`, '?code=<script>', `?code=${CODE}&code=2`.replace(CODE, 'nope'), '?id=1']) {
    assert.equal(parseJoinCode(bad), null, bad);
  }
});

test('links round-trip through the app link format', () => {
  assert.equal(joinLink('https://plainer.co.uk', CODE), `https://plainer.co.uk/join-shared-trip?code=${CODE}`);
  assert.equal(appOpenUrl(CODE), `plainer://join-shared-trip?code=${CODE}`);
  assert.equal(parseJoinCode(new URL(joinLink('https://plainer.co.uk', CODE)).search), CODE);
});

test('isIosDevice recognises iPhone, iPad (also when it says Mac) and nothing else', () => {
  assert.equal(isIosDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), true);
  assert.equal(isIosDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' }), true);
  assert.equal(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isIosDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 }), false);
  assert.equal(isIosDevice({}), false);
});

test('the login link returns to the trip after logging in or signing up', () => {
  const url = new URL(loginUrl(CODE), 'https://plainer.co.uk');
  assert.equal(url.pathname, '/login/');
  assert.equal(url.searchParams.get('next'), `/join-shared-trip?code=${CODE}`);
});

test('error texts are plain and never leak details', () => {
  assert.equal(previewErrorKind(404), 'expired');
  assert.equal(previewErrorKind(0), 'network');
  assert.equal(previewErrorKind(500), 'error');
  assert.match(previewErrorText('expired'), /expired or isn’t valid/);
  assert.match(previewErrorText('network'), /internet/);
  assert.match(previewErrorText('error'), /couldn’t load/);
  assert.match(joinErrorMessage(404), /expired/);
  assert.equal(joinErrorMessage(400, 'Nope.'), 'Nope.');
  assert.match(joinErrorMessage(500, 'Request failed with status 500'), /Couldn’t add/);
});
