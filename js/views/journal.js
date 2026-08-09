// "Journal" — the full activity timeline across all plants, photos included.

import { allLogs, allPhotos, listPlants } from '../store.js';
import { blobURL } from '../photos.js';
import { el, mount, fmtDateTime } from '../ui.js';

const TYPE_LABEL = { water: '💧 watered', soil: '🪴 soil', fertilizer: '🌿 fed', sunlight: '☀️ light', health: '⚕ health', photo: '📷 photo' };

export async function renderJournal(app) {
  const [logs, photos, plants] = await Promise.all([allLogs(), allPhotos(), listPlants({ includeArchived: true })]);
  const nameOf = Object.fromEntries(plants.map(p => [p.id, p.commonName]));

  const entries = [
    ...logs.map(l => ({ ...l, kind: 'log' })),
    ...photos.map(p => ({ ...p, kind: 'photo', type: 'photo' })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 200);

  mount(app,
    entries.length ? el('ul', { class: 'tl' },
      entries.map(e =>
        el('li', { class: `t-${e.type}` },
          el('time', { class: 'when', datetime: new Date(e.ts).toISOString() }, fmtDateTime(e.ts)),
          el('span', { class: 'what' },
            el('a', { class: 'who', href: `#/plant/${e.plantId}` }, nameOf[e.plantId] || 'unknown plant'),
            ' ', TYPE_LABEL[e.type] || e.type,
            e.type === 'health' ? ` → ${e.status}` : '',
            e.note ? ` — ${e.note}` : '',
          ),
          e.kind === 'photo' ? el('img', { src: blobURL(e.blob), alt: `Photo of ${nameOf[e.plantId] || 'plant'}` }) : null,
        ),
      ),
    ) : el('p', { class: 'muted' }, 'The journal is empty — log a watering or add a photo to begin.'),
  );
}
