// Unit tests for the diagnosis endpoint. Runs with the built-in test runner
// (`npm test` / `node --test test/`) and injects a fake Anthropic client via
// createHandler({ getClient }) — no network, no node_modules needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, sanitizeRegion, sanitizeObservations } from '../api/diagnose.js';

const IMAGE = 'a'.repeat(4000); // stands in for base64 JPEG data

function fakeRes() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function post(body) {
  return { method: 'POST', body };
}

const GOOD_DIAGNOSIS = {
  status: 'watch',
  confidence: 'medium',
  summary: 'Early signs of underwatering.',
  observations: [
    { text: 'Curled leaf margins', region: { x: 0.2, y: 0.3, w: 0.25, h: 0.2 } },
    { text: 'Crispy brown tip on one leaf' },
  ],
  likely_causes: ['Soil drying out between waterings'],
  recommended_actions: ['Water thoroughly until it drains', 'Check soil every 3 days'],
  caveat: 'Roots and soil moisture are not visible in the photo.',
};

function clientReplying(message) {
  const calls = [];
  return {
    calls,
    messages: {
      create(req) {
        calls.push(req);
        if (message instanceof Error || (message && message.__throw)) return Promise.reject(message.__throw || message);
        return Promise.resolve(message);
      },
    },
  };
}

const textMessage = (obj, stop_reason = 'end_turn') => ({
  stop_reason,
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }],
});

// ————— validation, no client needed —————

test('rejects non-POST', async () => {
  const res = fakeRes();
  await createHandler()({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error.code, 'method_not_allowed');
});

test('rejects missing image', async () => {
  const res = fakeRes();
  await createHandler()(post({ plant: {} }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'bad_request');
});

test('rejects oversized image', async () => {
  const res = fakeRes();
  await createHandler()(post({ image: 'x'.repeat(5_400_001) }), res);
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.error.code, 'too_large');
});

test('501 when no API key configured and no injected client', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const res = fakeRes();
    await createHandler()(post({ image: IMAGE }), res);
    assert.equal(res.statusCode, 501);
    assert.equal(res.body.error.code, 'not_configured');
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

// ————— happy path + request shape —————

test('returns diagnosis and builds the request correctly', async () => {
  const client = clientReplying(textMessage(GOOD_DIAGNOSIS));
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({
    image: IMAGE,
    plant: { latinName: 'Goeppertia insignis', commonName: 'Rattlesnake plant', humidity: 'high', light: { level: 'bright indirect' } },
    cadence: { min: 5, max: 7 },
    currentHealth: { status: 'watch', note: 'crispy tips' },
    recentLogs: [{ type: 'water', ts: Date.now(), method: 'filtered' }],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.diagnosis, { ...GOOD_DIAGNOSIS, detail: 'standard' });
  assert.equal(res.headers['cache-control'], 'no-store');

  const req = client.calls[0];
  assert.equal(req.model, 'claude-opus-5');
  assert.equal(req.max_tokens, 4000);
  assert.ok(!('temperature' in req), 'temperature must not be set');
  assert.ok(!('thinking' in req), 'thinking must not be set');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.output_config.format.schema.properties.status.enum.length, 3);

  const [imageBlock, textBlock] = req.messages[0].content;
  assert.deepEqual(imageBlock, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE } });
  assert.match(textBlock.text, /Goeppertia insignis/);
  assert.match(textBlock.text, /every 5–7 days/);
  assert.match(textBlock.text, /crispy tips/);
  assert.match(textBlock.text, /water: filtered/);
});

// ————— detail levels —————

async function schemaForRequest(detail) {
  const client = clientReplying(textMessage(GOOD_DIAGNOSIS));
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE, detail }), res);
  return { req: client.calls[0], res };
}

test('detail levels set the schema caps and the prompt guidance', async () => {
  for (const [detail, maxItems] of [['brief', 2], ['standard', 4], ['detailed', 6]]) {
    const { req, res } = await schemaForRequest(detail);
    const props = req.output_config.format.schema.properties;
    assert.equal(props.observations.maxItems, maxItems, `${detail} observations cap`);
    assert.equal(props.likely_causes.maxItems, maxItems, `${detail} causes cap`);
    assert.equal(props.recommended_actions.maxItems, maxItems, `${detail} actions cap`);
    assert.match(req.system, /^- Length:/m, `${detail} prompt carries a length rule`);
    assert.equal(res.body.diagnosis.detail, detail);
  }
});

test('brief and detailed prompts differ', async () => {
  const brief = (await schemaForRequest('brief')).req.system;
  const detailed = (await schemaForRequest('detailed')).req.system;
  assert.notEqual(brief, detailed);
  assert.match(brief, /terse/i);
  assert.match(detailed, /1–2 sentences/);
});

test('unknown or missing detail falls back to standard', async () => {
  for (const detail of ['enormous', '', null, undefined, 42, '__proto__']) {
    const { req, res } = await schemaForRequest(detail);
    assert.equal(req.output_config.format.schema.properties.observations.maxItems, 4);
    assert.equal(res.body.diagnosis.detail, 'standard');
  }
});

test('output is truncated to the level cap even if the model overruns', async () => {
  const chatty = {
    ...GOOD_DIAGNOSIS,
    observations: [{ text: 'one' }, { text: 'two' }, { text: 'three' }, { text: 'four' }],
    recommended_actions: ['a', 'b', 'c', 'd', 'e'],
  };
  const client = clientReplying(textMessage(chatty));
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE, detail: 'brief' }), res);
  assert.equal(res.body.diagnosis.observations.length, 2);
  assert.equal(res.body.diagnosis.recommended_actions.length, 2);
});

// ————— region sanitizing —————
// Coordinates become CSS percentages, so they are untrusted input.

test('sanitizeRegion keeps a well-formed box', () => {
  assert.deepEqual(sanitizeRegion({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }), { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
});

test('sanitizeRegion rejects junk', () => {
  for (const bad of [null, undefined, 'nope', {}, { x: 0, y: 0, w: 0.5 },
    { x: NaN, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0, w: Infinity, h: 0.5 },
    { x: '0.1', y: 0.1, w: 0.5, h: 0.5 }]) {
    assert.equal(sanitizeRegion(bad), null, JSON.stringify(bad));
  }
});

test('sanitizeRegion drops boxes too small to see', () => {
  assert.equal(sanitizeRegion({ x: 0.5, y: 0.5, w: 0.01, h: 0.4 }), null);
  assert.equal(sanitizeRegion({ x: 0.5, y: 0.5, w: 0.4, h: 0.001 }), null);
});

test('sanitizeRegion pulls an overhanging box back into frame', () => {
  assert.deepEqual(sanitizeRegion({ x: 0.8, y: 0.9, w: 0.5, h: 0.4 }), { x: 0.8, y: 0.9, w: 0.2, h: 0.1 });
  assert.deepEqual(sanitizeRegion({ x: -0.2, y: 0.1, w: 0.5, h: 0.3 }), { x: 0, y: 0.1, w: 0.5, h: 0.3 });
});

test('sanitizeRegion drops a box that clamps to nothing', () => {
  assert.equal(sanitizeRegion({ x: 0.995, y: 0.2, w: 0.5, h: 0.5 }), null);
});

test('sanitizeObservations caps regions at 4 but keeps the text', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ text: `obs ${i}`, region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }));
  const out = sanitizeObservations(many, 6);
  assert.equal(out.length, 6);
  assert.equal(out.filter(o => o.region).length, 4);
  assert.equal(out[5].text, 'obs 5');
});

test('sanitizeObservations tolerates plain strings and skips empties', () => {
  const out = sanitizeObservations(['  spider mites  ', { text: '' }, { text: '  ' }, null, { text: 'leaf drop' }], 4);
  assert.deepEqual(out, [{ text: 'spider mites' }, { text: 'leaf drop' }]);
});

test('a bad region does not cost the observation its text', async () => {
  const client = clientReplying(textMessage({
    ...GOOD_DIAGNOSIS,
    observations: [{ text: 'Yellowing lower leaf', region: { x: 2, y: 2, w: 'wide', h: 0.3 } }],
  }));
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE }), res);
  assert.deepEqual(res.body.diagnosis.observations, [{ text: 'Yellowing lower leaf' }]);
});

test('invalid status or confidence degrades instead of throwing', async () => {
  const client = clientReplying(textMessage({ ...GOOD_DIAGNOSIS, status: 'dying', confidence: 'certain' }));
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.diagnosis.status, 'watch');
  assert.equal(res.body.diagnosis.confidence, 'low');
});

// ————— model stop reasons —————

test('refusal → 422', async () => {
  const client = clientReplying({ stop_reason: 'refusal', content: [] });
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error.code, 'refused');
});

test('max_tokens truncation → 502', async () => {
  const client = clientReplying(textMessage('{"status":"wat', 'max_tokens'));
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error.code, 'bad_model_output');
});

test('unparseable model output → 502', async () => {
  const client = clientReplying(textMessage('not json at all'));
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error.code, 'bad_model_output');
});

// ————— upstream errors (duck-typed SDK error shapes) —————

test('429 passes through with Retry-After', async () => {
  const err = Object.assign(new Error('rate limited'), { status: 429, headers: { 'retry-after': '30' } });
  const client = clientReplying({ __throw: err });
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error.code, 'rate_limited');
  assert.equal(res.headers['retry-after'], '30');
});

test('529 overloaded → 503', async () => {
  const err = Object.assign(new Error('overloaded'), { status: 529 });
  const client = clientReplying({ __throw: err });
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'overloaded');
});

test('connection failure → 504', async () => {
  const err = Object.assign(new Error('conn reset'), { name: 'APIConnectionError' });
  const client = clientReplying({ __throw: err });
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE }), res);
  assert.equal(res.statusCode, 504);
  assert.equal(res.body.error.code, 'upstream_timeout');
});

test('other 4xx upstream → 502', async () => {
  const err = Object.assign(new Error('bad request'), { status: 400 });
  const client = clientReplying({ __throw: err });
  const res = fakeRes();
  await createHandler({ getClient: () => client })(post({ image: IMAGE }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error.code, 'upstream');
});
