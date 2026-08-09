// "Today" — the daily screen: what needs water now, one-tap logging,
// collection health at a glance, and trackable action items for
// struggling plants (Doctor's orders: to do vs attended).

import { addLog, currentHealth, getSettings, latestPhoto, ackAdvice, unackAdvice } from '../store.js';
import { collectionStatus, careStreak, updateBadge } from '../schedule.js';
import { prefersFilteredWater } from '../care-guides.js';
import { blobURL } from '../photos.js';
import { plantThumb } from '../ui-thumb.js';
import { aiChip } from '../diagnose.js';
import { el, mount, toast, dueBadge, healthChip, daysAgo } from '../ui.js';

export async function renderDashboard(app) {
  const rows = await collectionStatus();
  const settings = await getSettings();
  const streak = await careStreak(rows);
  updateBadge(rows);

  const withHealth = [];
  for (const row of rows) {
    const [health, photo] = await Promise.all([
      currentHealth(row.plant.id), latestPhoto(row.plant.id),
    ]);
    withHealth.push({ ...row, health, photoURL: photo ? blobURL(photo.blob) : null });
  }

  const counts = { healthy: 0, watch: 0, attention: 0 };
  for (const r of withHealth) {
    const s = r.health?.status || 'healthy';
    counts[s] = (counts[s] || 0) + 1;
  }

  const needsWater = withHealth.filter(r => r.water.state !== 'ok');
  const upcoming = withHealth.filter(r => r.water.state === 'ok');
  const needsFert = withHealth.filter(r => r.fert.state === 'due');
  const struggling = withHealth.filter(r => r.health && r.health.status !== 'healthy');
  const adviceTodo = struggling.filter(r => r.plant.adviceAckLogId !== r.health.id);
  const adviceDone = struggling.filter(r => r.plant.adviceAckLogId === r.health.id);

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  mount(app,
    el('p', { class: 'mono muted', style: 'margin:.75rem 0 0; font-size:.8rem;' }, today.toUpperCase()),

    // collection health strip
    el('div', { class: 'overview-strip' },
      el('div', { class: 'stat s-healthy' }, el('span', { class: 'n' }, String(counts.healthy)), el('span', { class: 'l' }, 'healthy')),
      el('div', { class: 'stat s-watch' }, el('span', { class: 'n' }, String(counts.watch)), el('span', { class: 'l' }, 'watch')),
      el('div', { class: 'stat s-attention' }, el('span', { class: 'n' }, String(counts.attention)), el('span', { class: 'l' }, 'attention')),
      el('div', { class: 'stat s-streak' }, el('span', { class: 'n' }, String(streak)), el('span', { class: 'l' }, streak === 1 ? 'day streak' : 'days streak')),
    ),

    // needs water now
    needsWater.length
      ? [
          el('h2', {}, `Needs water (${needsWater.length})`),
          ...needsWater.map(r => wateringCard(r, settings, app)),
        ]
      : el('div', { class: 'allclear' },
          el('span', { class: 'big', 'aria-hidden': 'true' }, '🌿'),
          'All watered. The collection is content.',
          el('div', { class: 'mono', style: 'font-size:.8rem; margin-top:.4rem;' },
            upcoming.length ? `next up: ${upcoming[0].plant.commonName} ${fmtDueIn(upcoming[0].water)}` : ''),
        ),

    // fertilizer due
    needsFert.length ? [
      el('h2', {}, 'Feeding due'),
      ...needsFert.map(r => feedCard(r, app)),
    ] : null,

    // action items for struggling plants — to do, then attended
    (adviceTodo.length || adviceDone.length) ? el('h2', {}, `Doctor’s orders${adviceTodo.length ? ` (${adviceTodo.length} to do)` : ' — all attended'}`) : null,
    adviceTodo.map(r => adviceCard(r, app)),
    adviceDone.length ? el('div', { class: 'attended-list' },
      adviceDone.map(r =>
        el('div', { class: 'attended-item' },
          el('span', { class: 'attended-check', 'aria-hidden': 'true' }, '✓'),
          el('span', { class: 'attended-text' },
            el('a', { href: `#/plant/${r.plant.id}` }, r.plant.commonName),
            ` — attended ${daysAgo(r.plant.adviceAckTs)}`),
          el('button', {
            class: 'btn-ghost attended-undo',
            'aria-label': `Reopen doctor's orders for ${r.plant.commonName}`,
            onclick: async () => {
              await unackAdvice(r.plant.id);
              toast('Reopened — back on the to-do list.');
              renderDashboard(app);
            },
          }, 'undo'),
        ),
      ),
    ) : null,

    // what's coming
    upcoming.length && needsWater.length ? [
      el('h2', {}, 'Coming up'),
      el('ul', { class: 'tl' },
        upcoming.slice(0, 5).map(r =>
          el('li', { class: 't-water' },
            el('span', { class: 'when' }, fmtDueIn(r.water)),
            el('span', { class: 'what' },
              el('a', { class: 'who', href: `#/plant/${r.plant.id}` }, r.plant.commonName), ' — water'),
          ),
        ),
      ),
    ] : null,
  );
}

function fmtDueIn(water) {
  if (water.dueInDays <= 0) return 'due today';
  if (water.dueInDays === 1) return 'due tomorrow';
  return `due in ${water.dueInDays} days`;
}

function wateringCard(row, settings, app) {
  const { plant, water, health, photoURL } = row;
  const filtered = prefersFilteredWater(plant);
  return el('article', { class: 'specimen' },
    el('span', { class: 'spec-no' }, `No. ${plant.specimenNo}`),
    el('div', { class: 'card-row' },
      plantThumb(plant, photoURL),
      el('div', { class: 'card-main' },
        el('div', { class: 'spec-head' },
          el('a', { class: 'spec-latin latin', href: `#/plant/${plant.id}` }, plant.latinName),
          el('span', { class: 'spec-common' }, plant.commonName),
        ),
        el('div', { class: 'due-line' },
          dueBadge(water),
          health ? healthChip(health.status) : null,
        ),
        el('span', { class: 'mono muted', style: 'font-size:.8rem' },
          water.hasLog ? `last watered ${daysAgo(water.anchorTs)}` : 'not logged yet'),
      ),
    ),
    filtered ? el('p', { class: 'hint', style: 'margin:.5rem 0 0' }, '⚠ use filtered/distilled water for this one') : null,
    plant.water?.notes ? el('p', { class: 'muted', style: 'font-size:.88rem; margin:.4rem 0 0' }, plant.water.notes) : null,
    el('div', { class: 'row-actions' },
      el('button', {
        class: 'btn-water',
        onclick: async e => {
          e.target.disabled = true;
          await addLog({ plantId: plant.id, type: 'water', method: filtered ? 'filtered' : settings.waterSource });
          toast(`💧 ${plant.commonName} watered — nice.`);
          renderDashboard(app);
        },
      }, '💧 Watered'),
      el('a', { class: 'btn btn-ghost', href: `#/plant/${plant.id}` }, 'details'),
    ),
  );
}

function feedCard(row, app) {
  const { plant, fert, photoURL } = row;
  return el('article', { class: 'specimen' },
    el('span', { class: 'spec-no' }, `No. ${plant.specimenNo}`),
    el('div', { class: 'card-row' },
      plantThumb(plant, photoURL),
      el('div', { class: 'card-main' },
        el('div', { class: 'spec-head' },
          el('a', { class: 'spec-latin latin', href: `#/plant/${plant.id}` }, plant.latinName),
          el('span', { class: 'spec-common' }, plant.commonName),
        ),
        el('p', { class: 'muted', style: 'font-size:.88rem; margin:.3rem 0 0' },
          `${plant.fertilizer?.type || 'Fertilizer'} — every ${plant.fertilizer?.frequencyDays} days, last ${fert.hasLog ? daysAgo(fert.anchorTs) : 'never logged'}`),
      ),
    ),
    el('div', { class: 'row-actions' },
      el('button', {
        class: 'btn-primary',
        onclick: async e => {
          e.target.disabled = true;
          await addLog({ plantId: plant.id, type: 'fertilizer', note: plant.fertilizer?.type || '' });
          toast(`🌿 ${plant.commonName} fed.`);
          renderDashboard(app);
        },
      }, '🌿 Fed it'),
    ),
  );
}

function adviceCard(row, app) {
  const { plant, health, photoURL } = row;
  return el('article', { class: `specimen advice-card ${health.status}` },
    el('div', { class: 'advice-title' },
      `No. ${plant.specimenNo} · ${health.status === 'attention' ? 'needs attention' : 'keep an eye on'}`,
      health.source === 'ai' ? [' ', aiChip()] : null),
    el('div', { class: 'card-row' },
      plantThumb(plant, photoURL),
      el('div', { class: 'card-main' },
        el('div', { class: 'spec-head' },
          el('a', { class: 'spec-latin latin', href: `#/plant/${plant.id}/guide` }, plant.latinName),
          el('span', { class: 'spec-common' }, plant.commonName),
        ),
        health.note ? el('p', { style: 'font-size:.92rem; margin:.3rem 0 0' }, health.note) : null,
      ),
    ),
    el('div', { class: 'row-actions' },
      el('button', {
        class: 'btn-primary',
        onclick: async () => {
          await ackAdvice(plant.id, health.id, health.note || '');
          toast(`✓ ${plant.commonName} attended to.`);
          renderDashboard(app);
        },
      }, '✓ Mark attended'),
      el('a', { class: 'btn btn-ghost', href: `#/plant/${plant.id}/guide` }, 'care guide →'),
    ),
  );
}
