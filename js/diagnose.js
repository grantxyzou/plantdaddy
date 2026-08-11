// AI photo diagnosis — client side.
//
// Sends a compressed photo + care context to /api/diagnose and renders the
// structured assessment as a clearly AI-badged suggestion card. Saving the
// result writes an ordinary health log (source:'ai'), which flows into
// Doctor's orders exactly like a hand-written one.
//
// What leaves the device, and only when the user taps Diagnose: the photo,
// the plant's profile, its cadence, and the last ~20 care-log entries —
// including notes the user typed. The log is what separates overwatering
// from underwatering, so it earns its place, but the UI has to say so
// rather than implying the photo travels alone.
//
// Two things make the result trustworthy rather than just confident-sounding:
// observations can carry a box drawn on the photo, so you can check the claim
// against the plant; and an unsaved result is persisted the moment it arrives,
// so leaving the screen (or iOS killing the app) never loses it before you've
// decided what to do with it.

import * as db from './db.js';
import { blobToDataURL, blobURL } from './photos.js';
import { logsForPlant, currentHealth, addLog, getSettings, getPhoto } from './store.js';
import { cadenceOf } from './schedule.js';
import { el, mount, toast, healthChip, fmtDateTime } from './ui.js';

const MAX_BLOB_BYTES = 4 * 1024 * 1024;
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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
  const [logs, health, settings] = await Promise.all([
    logsForPlant(plant.id), currentHealth(plant.id), getSettings(),
  ]);

  const body = JSON.stringify({
    image,
    detail: settings.aiDetail,
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

// ————— pending (unsaved) results —————
// One draft per plant, keyed by plantId. The photo is referenced by id rather
// than copied, so a draft costs a few hundred bytes.

export async function saveDraft(plantId, { diagnosis, photo }) {
  await db.put('diagnoses', {
    plantId,
    ts: Date.now(),
    photoId: photo?.id ?? null,
    photoTs: photo?.ts ?? null,
    diagnosis,
  });
}

export async function getDraft(plantId) {
  const draft = await db.get('diagnoses', plantId);
  if (!draft) return null;
  if (Date.now() - draft.ts > DRAFT_TTL_MS) {
    await clearDraft(plantId);
    return null;
  }
  return draft;
}

export async function clearDraft(plantId) {
  await db.del('diagnoses', plantId);
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

/**
 * Observations, with any that carry a region drawn on the photo. The list is
 * an <ol> so its numbers come from the browser; each box repeats its number,
 * and tapping either side highlights the pair. Observations without a region
 * still get a number — the sequence stays honest about what was localized.
 */
function observationSection(observations, photoBlob) {
  const items = observations.map((o, i) =>
    el('li', { class: o.region ? 'has-box' : null, 'data-idx': String(i) }, o.text));

  const boxes = observations.map((o, i) => {
    if (!o.region) return null;
    const { x, y, w, h } = o.region;
    return el('button', {
      type: 'button',
      class: 'diag-box',
      'data-idx': String(i),
      style: `left:${x * 100}%; top:${y * 100}%; width:${w * 100}%; height:${h * 100}%`,
      'aria-label': `Show observation ${i + 1}: ${o.text}`,
    }, el('span', { class: 'diag-box-n' }, String(i + 1)));
  }).filter(Boolean);

  const activate = idx => {
    items.forEach((li, i) => li.classList.toggle('active', i === idx));
    boxes.forEach(b => b.classList.toggle('active', Number(b.dataset.idx) === idx));
  };
  for (const box of boxes) {
    const idx = Number(box.dataset.idx);
    box.addEventListener('click', () => activate(idx));
  }
  items.forEach((li, i) => {
    if (li.classList.contains('has-box')) li.addEventListener('click', () => activate(i));
  });

  // Only show the photo when there is something drawn on it — otherwise it is
  // just a duplicate of the one already on the Photos tab.
  const figure = photoBlob && boxes.length
    ? el('figure', { class: 'diag-photo' },
        el('img', { src: blobURL(photoBlob), alt: 'The photo the AI assessed, with its markers' }),
        boxes)
    : null;

  return [
    el('h3', { class: 'diag-h' }, 'What the doctor sees'),
    figure,
    figure ? el('p', { class: 'hint diag-approx' },
      'Boxes are the AI’s best guess at where it’s looking — approximate.') : null,
    el('ol', { class: 'advice-list obs-list' }, items),
  ];
}

export function renderDiagnosisCard(d, { onSave, onDismiss, photoBlob, pendingSince, photoOutdated } = {}) {
  const section = (title, items) => items?.length
    ? [el('h3', { class: 'diag-h' }, title), el('ul', { class: 'advice-list' }, items.slice(0, 8).map(i => el('li', {}, i)))]
    : null;

  return cardShell(
    badgeRow(healthChip(d.status), el('span', { class: 'diag-conf mono' }, `${d.confidence} confidence`)),
    pendingSince ? el('p', { class: 'diag-pending mono' },
      `checked ${fmtDateTime(pendingSince)} · not saved yet`) : null,
    el('p', { class: 'diag-summary' }, d.summary),
    d.observations?.length ? observationSection(d.observations, photoBlob) : null,
    photoOutdated ? el('p', { class: 'care-note' },
      '⚠ You’ve added a newer photo since this check-up — run a fresh one for current advice.') : null,
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
      'Photo + care log sent to Anthropic’s Claude for analysis · an AI suggestion, not a substitute for a professional.'),
  );
}

// Save / dismiss behave identically wherever the card came from, so both the
// fresh and the restored path share these.
function cardActions(slot, plant, diagnosis, onSaved) {
  return {
    onSave: async () => {
      await saveDiagnosisAsHealthLog(plant, diagnosis);
      await clearDraft(plant.id);
      toast('⚕ Saved to health history — it’s on the Doctor’s orders list.');
      onSaved?.();
    },
    onDismiss: async () => {
      await clearDraft(plant.id);
      mount(slot);
    },
  };
}

/**
 * Drive the whole flow inside `slot`: pending → result card (or a friendly
 * error). `photo` is the stored photo record. The result is persisted before
 * it is rendered, so navigating away mid-request still keeps it.
 */
export async function runDiagnosis(slot, plant, photo, { onSaved } = {}) {
  mount(slot, cardShell(badgeRow(),
    el('p', { class: 'diag-summary' }, '🩺 The doctor is looking at the photo…')));
  slot.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });

  let d;
  try {
    d = await requestDiagnosis(plant, photo.blob);
  } catch (err) {
    mount(slot, cardShell(badgeRow(),
      el('p', { class: 'diag-summary' }, err.message),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn-ghost', onclick: () => mount(slot) }, 'dismiss'))));
    return;
  }

  await saveDraft(plant.id, { diagnosis: d, photo });
  mount(slot, renderDiagnosisCard(d, {
    photoBlob: photo.blob,
    ...cardActions(slot, plant, d, onSaved),
  }));
}

/**
 * Re-mount an unsaved result from a previous visit. Returns whether one was
 * found, so the view can label its button "Re-run check-up".
 */
export async function restorePendingDiagnosis(slot, plant, { latestPhoto, onSaved } = {}) {
  const draft = await getDraft(plant.id);
  if (!draft) return false;

  const photo = draft.photoId != null ? await getPhoto(draft.photoId) : null;
  mount(slot, renderDiagnosisCard(draft.diagnosis, {
    photoBlob: photo?.blob || null,
    pendingSince: draft.ts,
    photoOutdated: Boolean(latestPhoto && draft.photoTs && latestPhoto.ts > draft.photoTs),
    ...cardActions(slot, plant, draft.diagnosis, onSaved),
  }));
  return true;
}
