// Per-plant view: Status (logging + specs), Guide (professional advice),
// Photos (timeline + baseline compare), History (all logs + health changes).

import {
  getPlant, addLog, logsForPlant, currentHealth, healthHistory,
  photosForPlant, addPhoto, deletePhoto, archivePlant, getSettings,
} from '../store.js';
import { waterStatus, fertilizerStatus, cadenceOf } from '../schedule.js';
import { guideFor, prefersFilteredWater } from '../care-guides.js';
import { referenceImage, wikiThumbAt } from '../species-images.js';
import { compressImage, blobURL } from '../photos.js';
import { el, mount, setHeader, toast, fmtDate, fmtDateTime, daysAgo, healthChip, dueBadge, confirmDialog } from '../ui.js';

const TABS = [
  ['status', 'Status'],
  ['guide', 'Care guide'],
  ['photos', 'Photos'],
  ['history', 'History'],
];

export async function renderPlantDetail(app, id, tab = 'status') {
  const plant = await getPlant(id);
  if (!plant) {
    mount(app, el('p', { class: 'muted' }, 'Specimen not found. ', el('a', { href: '#/plants' }, 'Back to collection')));
    return;
  }
  const health = await currentHealth(id);
  setHeader({ title: plant.commonName, back: '#/plants' });

  const body = el('div');
  const render = { status: statusTab, guide: guideTab, photos: photosTab, history: historyTab }[tab] || statusTab;

  mount(app,
    el('div', { class: 'detail-head' },
      el('h1', { class: 'latin' }, plant.latinName),
      el('div', { class: 'common' },
        `${plant.commonName} · No. ${plant.specimenNo}`,
        plant.archived ? ' · archived' : '',
        ' ',
        health ? healthChip(health.status) : null,
      ),
    ),
    el('div', { class: 'tabs', role: 'tablist' },
      TABS.map(([key, label]) =>
        el('button', {
          role: 'tab',
          'aria-selected': String(key === tab),
          onclick: () => { location.hash = `#/plant/${id}/${key}`; },
        }, label),
      ),
    ),
    body,
  );
  await render(body, plant, app);
}

// ————— Status —————

async function statusTab(body, plant, app) {
  const settings = await getSettings();
  const [water, fert, logs] = await Promise.all([
    waterStatus(plant), fertilizerStatus(plant), logsForPlant(plant.id),
  ]);
  const lastOf = type => logs.find(l => l.type === type);
  const { min, max } = cadenceOf(plant);
  const filtered = prefersFilteredWater(plant);

  const rerender = () => renderPlantDetail(app, plant.id, 'status');

  const quickLog = async (type, extra = {}, msg) => {
    await addLog({ plantId: plant.id, type, ...extra });
    toast(msg);
    rerender();
  };

  const noteForm = (type, placeholder, buttonLabel) => {
    const input = el('input', { type: 'text', placeholder, 'aria-label': placeholder });
    return el('form', {
      class: 'field-row', style: 'margin-top:.5rem',
      onsubmit: async e => {
        e.preventDefault();
        await quickLog(type, { note: input.value.trim() }, `${buttonLabel} logged.`);
      },
    }, el('div', { class: 'field' }, input), el('button', { type: 'submit' }, buttonLabel));
  };

  mount(body, 
    el('article', { class: 'specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'Care status'),
      el('div', { class: 'due-line' },
        dueBadge(water),
        el('span', { class: 'mono muted', style: 'font-size:.75rem' },
          water.hasLog ? `last watered ${daysAgo(water.anchorTs)}` : 'no watering logged yet'),
      ),
      el('dl', { class: 'kv' },
        el('dt', {}, 'cadence'), el('dd', {}, `every ${min}–${max} days${plant.cadenceOverride ? ' (custom)' : ''}`),
        el('dt', {}, 'fertilized'), el('dd', {}, lastOf('fertilizer') ? `${daysAgo(lastOf('fertilizer').ts)}` : 'never logged'
          + (fert.state === 'off-season' ? '' : '')),
        el('dt', {}, 'feeding'), el('dd', {},
          fert.state === 'none' ? 'not needed'
            : fert.state === 'off-season' ? `paused (${plant.fertilizer.activeSeason})`
            : fert.state === 'due' ? 'due now' : `due ${fmtDate(fert.dueTs)}`),
        el('dt', {}, 'soil'), el('dd', {}, lastOf('soil') ? `${lastOf('soil').note || 'refreshed'} — ${daysAgo(lastOf('soil').ts)}` : 'no soil log yet'),
        el('dt', {}, 'placement'), el('dd', {}, lastOf('sunlight') ? `${lastOf('sunlight').note} — ${daysAgo(lastOf('sunlight').ts)}` : (plant.light?.notes || plant.light?.level || '—')),
      ),
      filtered ? el('p', { class: 'care-note' }, '⚠ This plant is sensitive to tap water — use filtered, distilled, or overnight-rested water.') : null,
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn-water', onclick: () => quickLog('water', { method: filtered ? 'filtered' : settings.waterSource }, `💧 ${plant.commonName} watered.`) }, '💧 Watered'),
        fert.state !== 'none' ? el('button', { class: 'btn-primary', onclick: () => quickLog('fertilizer', { note: plant.fertilizer?.type || '' }, '🌿 Feeding logged.') }, '🌿 Fed it') : null,
      ),
      noteForm('soil', 'e.g. repotted into 2in larger pot', 'Log soil'),
      noteForm('sunlight', 'e.g. moved to east window', 'Log light'),
    ),

    el('article', { class: 'specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'Requirements'),
      el('dl', { class: 'kv' },
        el('dt', {}, 'light'), el('dd', {}, `${plant.light?.level || '—'}${plant.light?.notes ? `. ${plant.light.notes}` : ''}`),
        el('dt', {}, 'water'), el('dd', {}, plant.water?.notes || `every ${min}–${max} days`),
        el('dt', {}, 'soil'), el('dd', {}, `${plant.soil?.type || '—'}${plant.soil?.repotNotes ? `. ${plant.soil.repotNotes}` : ''}`),
        el('dt', {}, 'feeding'), el('dd', {}, plant.fertilizer?.frequencyDays
          ? `${plant.fertilizer.type}, every ${plant.fertilizer.frequencyDays} days (${plant.fertilizer.activeSeason})`
          : 'none needed'),
        el('dt', {}, 'humidity'), el('dd', {}, plant.humidity || '—'),
        el('dt', {}, 'pot'), el('dd', {}, plant.potType || '—'),
      ),
      el('div', { class: 'row-actions' },
        el('a', { class: 'btn', href: `#/plant/${plant.id}/edit` }, 'edit specimen'),
        el('button', {
          class: 'btn-danger btn-ghost',
          onclick: async () => {
            if (plant.archived) {
              await archivePlant(plant.id, false);
              toast('Specimen restored.');
            } else {
              if (!await confirmDialog(`Archive ${plant.commonName}? Its history is kept and it can be restored anytime.`)) return;
              await archivePlant(plant.id, true);
              toast('Specimen archived — history kept.');
            }
            rerender();
          },
        }, plant.archived ? 'restore' : 'archive'),
      ),
    ),
  );
}

// ————— Care guide —————

async function guideTab(body, plant) {
  const guide = guideFor(plant);
  const ref = await referenceImage(plant); // memoized; null when offline & uncached
  mount(body,
    el('article', { class: 'specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'What healthy looks like'),
      ref && ref.thumb ? el('figure', { class: 'ref-photo' },
        el('img', {
          src: wikiThumbAt(ref.thumb, 640),
          alt: `Reference photo of a healthy ${ref.title}`,
          loading: 'lazy',
          onerror: function () { this.closest('figure').remove(); },
        }),
        el('figcaption', {},
          'Reference: healthy ', el('span', { class: 'latin' }, ref.title), ' · ',
          el('a', { href: ref.page, target: '_blank', rel: 'noopener' }, 'photo via Wikipedia')),
      ) : null,
      el('p', { style: 'font-size:.92rem' }, guide.healthyLooksLike),
      plant.baselinePhotoDescription ? el('p', { class: 'care-note' },
        el('strong', {}, `Baseline (${plant.baselineTs ? fmtDate(plant.baselineTs) : 'intake'}): `),
        plant.baselinePhotoDescription) : null,
    ),
    el('article', { class: 'specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'How to water it'),
      el('p', { style: 'font-size:.92rem' }, guide.wateringTechnique),
      guide.seasonal ? el('p', { class: 'care-note' }, el('strong', {}, 'Through the seasons: '), guide.seasonal) : null,
    ),
    el('article', { class: 'specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'Troubleshooting'),
      guide.problems.map(p =>
        el('div', { class: 'problem' },
          el('div', { class: 'symptom' }, p.symptom),
          el('div', { class: 'cause' }, p.cause),
          el('div', { class: 'fix' }, p.fix),
        ),
      ),
    ),
    guide.proTips?.length ? el('article', { class: 'specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'Pro tips'),
      el('ul', { class: 'advice-list' }, guide.proTips.map(t => el('li', {}, t))),
    ) : null,
  );
}

// ————— Photos —————

async function photosTab(body, plant, app) {
  const photos = await photosForPlant(plant.id);
  const latest = photos[0];
  const oldest = photos[photos.length - 1];

  const fileInput = el('input', {
    type: 'file', accept: 'image/*', capture: 'environment',
    style: 'display:none', 'aria-hidden': 'true', tabindex: '-1',
  });
  const noteInput = el('input', { type: 'text', placeholder: 'optional note — “new leaf unfurling”', 'aria-label': 'Photo note' });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const blob = await compressImage(file);
      await addPhoto({ plantId: plant.id, blob, note: noteInput.value.trim() });
      toast('📷 Photo added to the timeline.');
      renderPlantDetail(app, plant.id, 'photos');
    } catch (err) {
      toast(`Could not add photo: ${err.message}`);
    }
  });

  mount(body, 
    el('div', { class: 'specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'Add a photo'),
      el('div', { class: 'field' }, noteInput),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn-primary', onclick: () => fileInput.click() }, '📷 Take / choose photo'),
      ),
      fileInput,
      el('p', { class: 'hint', style: 'margin-bottom:0' }, 'Photos are resized on-device (max 1200px) and stored locally.'),
    ),

    // progress compare: baseline vs latest
    el('h2', {}, 'Progress'),
    el('div', { class: 'compare' },
      el('figure', {},
        oldest && photos.length > 1
          ? el('img', { src: blobURL(oldest.blob), alt: `Earliest photo of ${plant.commonName}` })
          : el('div', { class: 'baseline-desc' },
              plant.baselinePhotoDescription || 'No baseline photo yet — the first photo you add becomes the “before.”'),
        el('figcaption', {}, oldest && photos.length > 1 ? `earliest · ${fmtDate(oldest.ts)}` : `baseline notes · ${plant.baselineTs ? fmtDate(plant.baselineTs) : 'intake'}`),
      ),
      el('figure', {},
        latest
          ? el('img', { src: blobURL(latest.blob), alt: `Latest photo of ${plant.commonName}` })
          : el('div', { class: 'baseline-desc' }, 'Add your first photo to start the visual timeline.'),
        el('figcaption', {}, latest ? `latest · ${fmtDate(latest.ts)}` : 'latest — none yet'),
      ),
    ),

    photos.length ? [
      el('h2', {}, `Timeline · ${photos.length} photo${photos.length === 1 ? '' : 's'}`),
      el('div', { class: 'photo-grid' },
        photos.map(p =>
          el('div', { class: 'photo-cell' },
            el('img', { src: blobURL(p.blob), alt: `${plant.commonName} on ${fmtDate(p.ts)}${p.note ? ` — ${p.note}` : ''}` }),
            el('span', { class: 'when' }, fmtDate(p.ts)),
            p.note ? el('div', { class: 'photo-note' }, p.note) : null,
            el('button', {
              class: 'btn-ghost', style: 'margin-top:.25rem; font-size:.68rem; padding:.2rem .45rem',
              'aria-label': `Delete photo from ${fmtDate(p.ts)}`,
              onclick: async () => {
                if (!await confirmDialog('Delete this photo?')) return;
                await deletePhoto(p.id);
                renderPlantDetail(app, plant.id, 'photos');
              },
            }, 'delete'),
          ),
        ),
      ),
    ] : null,
  );
}

// ————— History —————

const TYPE_LABEL = { water: '💧 watered', soil: '🪴 soil', fertilizer: '🌿 fed', sunlight: '☀️ light', health: '⚕ health', note: '📝 note' };

async function historyTab(body, plant, app) {
  const [logs, history] = await Promise.all([logsForPlant(plant.id), healthHistory(plant.id)]);
  const current = history[0];

  const statusSelect = el('select', { 'aria-label': 'New health status' },
    el('option', { value: 'healthy' }, 'Healthy'),
    el('option', { value: 'watch' }, 'Watch'),
    el('option', { value: 'attention' }, 'Needs attention'),
  );
  if (current) statusSelect.value = current.status;
  const noteInput = el('input', { type: 'text', placeholder: 'what changed? — “two new leaves, tips recovered”', 'aria-label': 'Health note' });

  mount(body, 
    el('article', { class: 'specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'Update health'),
      el('form', {
        class: 'sheet',
        onsubmit: async e => {
          e.preventDefault();
          await addLog({ plantId: plant.id, type: 'health', status: statusSelect.value, note: noteInput.value.trim() });
          toast('Health noted in the journal.');
          renderPlantDetail(app, plant.id, 'history');
        },
      },
        el('div', { class: 'field-row' },
          el('div', { class: 'field' }, el('label', { for: '' }, 'status'), statusSelect),
        ),
        el('div', { class: 'field' }, noteInput),
        el('div', {}, el('button', { class: 'btn-primary', type: 'submit' }, 'Record status')),
      ),
    ),

    el('h2', {}, 'Full history'),
    logs.length ? el('ul', { class: 'tl' },
      logs.map(l =>
        el('li', { class: `t-${l.type}` },
          el('time', { class: 'when', datetime: new Date(l.ts).toISOString() }, fmtDateTime(l.ts)),
          el('span', { class: 'what' },
            TYPE_LABEL[l.type] || l.type,
            l.type === 'health' ? ` → ${l.status}` : '',
            l.method ? ` (${l.method})` : '',
            l.note ? ` — ${l.note}` : '',
          ),
        ),
      ),
    ) : el('p', { class: 'muted' }, 'Nothing logged yet.'),
  );
}
