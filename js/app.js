// Boot + hash router.

import { seedIfNeeded } from './store.js';
import { releaseBlobURLs } from './photos.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCollection } from './views/collection.js';
import { renderPlantDetail } from './views/plant-detail.js';
import { renderPlantForm } from './views/plant-form.js';
import { renderJournal } from './views/journal.js';
import { renderSettings } from './views/settings.js';

const app = document.getElementById('app');

const routes = [
  { pattern: /^#?\/?$/, view: () => renderDashboard(app), nav: 'dashboard' },
  { pattern: /^#\/plants$/, view: () => renderCollection(app), nav: 'plants' },
  { pattern: /^#\/plants\/new$/, view: () => renderPlantForm(app, null), nav: 'plants' },
  { pattern: /^#\/plant\/([^/]+)\/edit$/, view: m => renderPlantForm(app, m[1]), nav: 'plants' },
  { pattern: /^#\/plant\/([^/]+)(?:\/(\w+))?$/, view: m => renderPlantDetail(app, m[1], m[2] || 'status'), nav: 'plants' },
  { pattern: /^#\/journal$/, view: () => renderJournal(app), nav: 'journal' },
  { pattern: /^#\/settings$/, view: () => renderSettings(app), nav: 'settings' },
];

async function route() {
  const hash = location.hash || '#/';
  releaseBlobURLs();
  for (const r of routes) {
    const m = hash.match(r.pattern);
    if (m) {
      document.querySelectorAll('.topnav a').forEach(a => {
        if (a.dataset.nav === r.nav) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      try {
        await r.view(m);
      } catch (err) {
        console.error(err);
        app.innerHTML = `<p class="muted">Something went wrong: ${err.message}</p>`;
      }
      app.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

async function boot() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    await seedIfNeeded();
  } catch (err) {
    console.error('Seeding failed', err);
  }
  window.addEventListener('hashchange', route);
  await route();
}

boot();
