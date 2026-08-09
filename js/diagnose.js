// AI photo diagnosis — client side.
//
// Sends a compressed photo + care context to /api/diagnose and renders the
// structured assessment as a clearly AI-badged suggestion card. Saving the
// result writes an ordinary health log (source:'ai'), which flows into
// Doctor's orders exactly like a hand-written one. The photo is the only
// data that ever leaves the device, and only when the user taps Diagnose.

import { blobToDataURL } from './photos.js';
import { logsForPlant, currentHealth, addLog } from './store.js';
import { cadenceOf } from './schedule.js';
import { el, mount, toast, healthChip } from './ui.js';

const MAX_BLOB_BYTES = 4 * 1024 * 1024;

const ERROR_COPY = {
  offline: 'You’re offline — the AI check-up needs a connection.',
  too_large: 'That photo is too large to send. Re-add it so it gets compressed.',
  not_configured: 'AI diagnosis isn’t switched on for this deployment yet. The app owner adds an ANTHROPIC_API_KEY in the Vercel dashboard (Project → Settings → Environment Variables) and redeploys — then this button works.',
  refused: 'The AI declined to analyze this photo. Try a clearer shot showing just the plant.',
  rate_limited: 'The AI doctor is swamped — try again in a minute.',
  overloaded: 'The AI service is overloaded right now. Try again shortly.',
  upstream_timeout: 'The AI took too long to answer. Try again.',
  bad_model_output: 'The AI’s answer came back garbled. Try again — it usually works on the second attempt.',
};

function diagError(code) {
  const err = new Error(ERROR_COPY[code] || 'Something went wrong reaching the AI service. Try again.');
  err.code = code;
  return err;
}

export async function requestDiagnosis(plant, photoBlob) {
  if (navigator.onLine === false) throw diagError('offline');
  if (photoBlob.size > MAX_BLOB_BYTES) throw diagError('too_large');

  const dataURL = await blobToDataURL(photoBlob);
  const image = dataURL.slice(dataURL.indexOf(',') + 1);
  const [logs, health] = await Promise.all([logsForPlant(plant.id), currentHealth(plant.id)]);

  const body = JSON.stringify({
    image,
    plant: {
      latinName: plant.latinName,
      commonName: plant.commonName,
      light: plant.light,
      soil: plant.soil,
      humidity: plant.humidity,
      potType: plant.potType,
    },
    cadence: cadenceOf(plant),
    currentHealth: health ? { status: health.status, note: health.note, ts: health.ts } : null,
    recentLogs: logs.slice(0, 20).map(l => ({
      type: l.type, ts: l.ts, status: l.status, method: l.method, note: l.note,
    })),
  });

  let res;
  try {
    res = await fetch('/api/diagnose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch {
    throw diagError('offline');
  }
  if (!res.ok) {
    let code = 'upstream';
    try { code = (await res.json()).error?.code || code; } catch { /* non-JSON error page */ }
    throw diagError(code);
  }
  const { diagnosis } = await res.json();
  return diagnosis;
}

export async function saveDiagnosisAsHealthLog(plant, d) {
  const note = `AI check-up: ${[d.summary, d.recommended_actions?.[0]].filter(Boolean).join(' → ')}`.slice(0, 220);
  return addLog({ plantId: plant.id, type: 'health', status: d.status, note, source: 'ai', ai: d });
}

export function aiChip() {
  return el('span', { class: 'ai-chip', title: 'From an AI photo check-up' }, 'AI');
}

function cardShell(...children) {
  return el('article', { class: 'specimen diagnosis-card' }, ...children);
}

function badgeRow(...extra) {
  return el('div', { class: 'diag-head' },
    el('span', { class: 'ai-badge' }, '✨ AI assessment'), ...extra);
}

export function renderDiagnosisCard(d, { onSave, onDismiss } = {}) {
  const section = (title, items) => items?.length
    ? [el('h3', { class: 'diag-h' }, title), el('ul', { class: 'advice-list' }, items.slice(0, 4).map(i => el('li', {}, i)))]
    : null;

  return cardShell(
    badgeRow(healthChip(d.status), el('span', { class: 'diag-conf mono' }, `${d.confidence} confidence`)),
    el('p', { class: 'diag-summary' }, d.summary),
    section('What the doctor sees', d.observations),
    section('Likely causes', d.likely_causes),
    section('What to do', d.recommended_actions),
    d.caveat ? el('p', { class: 'hint' }, d.caveat) : null,
    el('div', { class: 'row-actions' },
      onSave ? el('button', {
        class: 'btn-primary',
        onclick: async e => { e.target.disabled = true; await onSave(); },
      }, '⚕ Save as health note') : null,
      onDismiss ? el('button', { class: 'btn-ghost', onclick: onDismiss }, 'dismiss') : null,
    ),
    el('p', { class: 'hint diag-fine' },
      'Photo sent to Anthropic’s Claude for analysis · an AI suggestion, not a substitute for a professional.'),
  );
}

/**
 * Drive the whole flow inside `slot`: pending → result card (or a friendly
 * error). `onSaved` runs after the result is stored as a health log.
 */
export async function runDiagnosis(slot, plant, photoBlob, { onSaved } = {}) {
  mount(slot, cardShell(badgeRow(),
    el('p', { class: 'diag-summary' }, '🩺 The doctor is looking at the photo…')));
  slot.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });

  let d;
  try {
    d = await requestDiagnosis(plant, photoBlob);
  } catch (err) {
    mount(slot, cardShell(badgeRow(),
      el('p', { class: 'diag-summary' }, err.message),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn-ghost', onclick: () => mount(slot) }, 'dismiss'))));
    return;
  }

  mount(slot, renderDiagnosisCard(d, {
    onSave: async () => {
      await saveDiagnosisAsHealthLog(plant, d);
      toast('⚕ Saved to health history — it’s on the Doctor’s orders list.');
      onSaved?.();
    },
    onDismiss: () => mount(slot),
  }));
}
