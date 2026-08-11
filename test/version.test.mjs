// Unit tests for the deploy-identity endpoint. The app compares this value to
// decide whether it is running stale code, so the two properties that matter
// are: it changes when the code changes, and it does NOT change otherwise
// (a redeploy of the same commit must not trigger a pointless reload).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/version.js';

function fakeRes() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const get = (env, method = 'GET') => {
  const res = fakeRes();
  createHandler({ env })({ method }, res);
  return res;
};

test('reports the commit SHA, shortened', () => {
  const res = get({ VERCEL_GIT_COMMIT_SHA: '34f4428e1bb4ea6c2addb8ad17585b2347e830bc' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.version, '34f4428e1bb4');
});

test('never cached — a stale answer would defeat the whole point', () => {
  assert.equal(get({ VERCEL_GIT_COMMIT_SHA: 'abc123def456' }).headers['cache-control'], 'no-store');
});

test('a different commit reports a different version', () => {
  const a = get({ VERCEL_GIT_COMMIT_SHA: '427749c14ac801a805f045ebe6d001c0850b730e' }).body.version;
  const b = get({ VERCEL_GIT_COMMIT_SHA: '34f4428e1bb4ea6c2addb8ad17585b2347e830bc' }).body.version;
  assert.notEqual(a, b);
});

test('same commit redeployed reports the same version (no spurious reload)', () => {
  const env = { VERCEL_GIT_COMMIT_SHA: '34f4428e1bb4ea6c2addb8ad17585b2347e830bc' };
  const first = get(env).body.version;
  // A redeploy that only changes environment variables keeps the SHA.
  const second = get({ ...env, ANTHROPIC_API_KEY: 'sk-added-later' }).body.version;
  assert.equal(first, second);
});

test('falls back to the deployment id when no git metadata exists', () => {
  assert.equal(get({ VERCEL_DEPLOYMENT_ID: 'dpl_abc' }).body.version, 'dpl_abc');
});

test('falls back to "dev" with no Vercel environment at all', () => {
  assert.equal(get({}).body.version, 'dev');
});

test('an empty SHA does not produce an empty version', () => {
  // An empty string would make the client treat every check as "unknown".
  assert.equal(get({ VERCEL_GIT_COMMIT_SHA: '', VERCEL_DEPLOYMENT_ID: 'dpl_x' }).body.version, 'dpl_x');
});

test('rejects non-GET', () => {
  const res = get({}, 'POST');
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error.code, 'method_not_allowed');
});
