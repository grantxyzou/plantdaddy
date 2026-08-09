// "Collection" — every specimen card, herbarium style.

import { listPlants, currentHealth } from '../store.js';
import { waterStatus } from '../schedule.js';
import { el, mount, healthChip, dueBadge, daysAgo } from '../ui.js';

export async function renderCollection(app) {
  const plants = await listPlants();
  const archived = (await listPlants({ includeArchived: true })).filter(p => p.archived);

  const cards = [];
  for (const plant of plants) {
    const [health, water] = await Promise.all([currentHealth(plant.id), waterStatus(plant)]);
    cards.push(
      el('article', { class: 'specimen' },
        el('span', { class: 'spec-no' }, `No. ${plant.specimenNo}`),
        el('div', { class: 'spec-head' },
          el('a', { class: 'spec-latin latin', href: `#/plant/${plant.id}` }, plant.latinName),
          el('span', { class: 'spec-common' }, plant.commonName),
        ),
        el('div', { class: 'due-line' },
          health ? healthChip(health.status) : null,
          dueBadge(water),
          el('span', { class: 'mono muted', style: 'font-size:.72rem' },
            water.hasLog ? `watered ${daysAgo(water.anchorTs)}` : 'no water log yet'),
        ),
      ),
    );
  }

  mount(app, 
    el('h1', {}, `Collection · ${plants.length} specimens`),
    el('div', { class: 'row-actions', style: 'margin:0 0 1rem' },
      el('a', { class: 'btn btn-primary', href: '#/plants/new' }, '+ New specimen'),
    ),
    ...cards,
    archived.length ? [
      el('h2', {}, 'Archived'),
      ...archived.map(p =>
        el('p', { class: 'muted', style: 'font-size:.85rem' },
          el('a', { href: `#/plant/${p.id}`, class: 'latin' }, p.latinName),
          ` — No. ${p.specimenNo}`,
        )),
    ] : null,
  );
}
