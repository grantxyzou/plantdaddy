// "Collection" — every specimen card, herbarium style, with a face:
// your latest photo of the plant (or a species reference shot).

import { listPlants, currentHealth, latestPhoto } from '../store.js';
import { waterStatus } from '../schedule.js';
import { blobURL } from '../photos.js';
import { plantThumb } from '../ui-thumb.js';
import { el, mount, healthChip, dueBadge, daysAgo } from '../ui.js';

export async function renderCollection(app) {
  const plants = await listPlants();
  const archived = (await listPlants({ includeArchived: true })).filter(p => p.archived);

  const cards = [];
  for (const plant of plants) {
    const [health, water, photo] = await Promise.all([
      currentHealth(plant.id), waterStatus(plant), latestPhoto(plant.id),
    ]);
    cards.push(
      el('article', { class: 'specimen' },
        el('span', { class: 'spec-no' }, `No. ${plant.specimenNo}`),
        el('div', { class: 'card-row' },
          plantThumb(plant, photo ? blobURL(photo.blob) : null),
          el('div', { class: 'card-main' },
            el('div', { class: 'spec-head' },
              el('a', { class: 'spec-latin latin', href: `#/plant/${plant.id}` }, plant.latinName),
              el('span', { class: 'spec-common' }, plant.commonName),
            ),
            el('div', { class: 'due-line' },
              health ? healthChip(health.status) : null,
              dueBadge(water),
            ),
            el('span', { class: 'mono muted', style: 'font-size:.8rem' },
              water.hasLog ? `watered ${daysAgo(water.anchorTs)}` : 'no water log yet'),
          ),
        ),
      ),
    );
  }

  mount(app,
    el('div', { class: 'row-actions', style: 'margin:.25rem 0 1rem; align-items:center; justify-content:space-between' },
      el('span', { class: 'mono muted', style: 'font-size:.85rem' }, `${plants.length} specimens`),
      el('a', { class: 'btn btn-primary', href: '#/plants/new' }, '+ New specimen'),
    ),
    ...cards,
    archived.length ? [
      el('h2', {}, 'Archived'),
      ...archived.map(p =>
        el('p', { class: 'muted', style: 'font-size:.9rem' },
          el('a', { href: `#/plant/${p.id}`, class: 'latin' }, p.latinName),
          ` — No. ${p.specimenNo}`,
        )),
    ] : null,
  );
}
