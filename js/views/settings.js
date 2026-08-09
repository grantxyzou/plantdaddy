// Preferences, calendar reminder export, backup / restore.

import { getSettings, saveSettings, listPlants, counts } from '../store.js';
import { downloadCalendar } from '../ics.js';
import { exportBackup, importBackup } from '../backup.js';
import { el, mount, toast } from '../ui.js';

export async function renderSettings(app) {
  const settings = await getSettings();
  const stats = await counts();

  const units = el('select', { 'aria-label': 'Temperature units' },
    el('option', { value: 'F' }, '°F'),
    el('option', { value: 'C' }, '°C'));
  units.value = settings.units;

  const waterSource = el('select', { 'aria-label': 'Default water source' },
    el('option', { value: 'tap' }, 'tap water'),
    el('option', { value: 'filtered' }, 'filtered water'),
    el('option', { value: 'distilled' }, 'distilled water'));
  waterSource.value = settings.waterSource;

  const reminderHour = el('select', { 'aria-label': 'Reminder time of day' },
    ...[6, 7, 8, 9, 10, 12, 17, 18, 19, 20].map(h =>
      el('option', { value: String(h) }, new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }))));
  reminderHour.value = String(settings.reminderHour);

  const lead = el('select', { 'aria-label': 'Reminder lead time' },
    el('option', { value: '0' }, 'at the scheduled time'),
    el('option', { value: '30' }, '30 minutes early'),
    el('option', { value: '60' }, '1 hour early'));
  lead.value = String(settings.leadTimeMinutes);

  const save = async () => {
    await saveSettings({
      units: units.value,
      waterSource: waterSource.value,
      reminderHour: +reminderHour.value,
      leadTimeMinutes: +lead.value,
    });
    toast('Preferences saved.');
  };
  for (const s of [units, waterSource, reminderHour, lead]) s.addEventListener('change', save);

  const importInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', 'aria-hidden': 'true', tabindex: '-1' });
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    if (!window.confirm('Importing a backup REPLACES everything currently in the app. Continue?')) return;
    try {
      const res = await importBackup(file);
      toast(`Restored ${res.plants} plants, ${res.logs} logs, ${res.photos} photos.`);
      location.hash = '#/';
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  });

  const field = (label, input, hint) => el('div', { class: 'field' },
    el('label', {}, label), input, hint ? el('span', { class: 'hint' }, hint) : null);

  mount(app,
    el('section', { class: 'settings-block specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'Reminders'),
      el('p', { style: 'font-size:.9rem' },
        'PlantDaddy shows what’s due every time you open it — and can hand your phone’s own calendar the schedule, so the nagging happens even when the app is closed. Download the calendar and open it to add “Water …” events with alerts.'),
      el('div', { class: 'field-row' },
        field('remind me at', reminderHour),
        field('alert', lead)),
      el('div', { class: 'row-actions' },
        el('button', {
          class: 'btn-primary',
          onclick: async () => {
            const plants = await listPlants();
            await downloadCalendar(plants, await getSettings());
            toast('Calendar file downloaded — open it to add the reminders.');
          },
        }, '📅 Download care calendar (.ics)'),
      ),
      el('p', { class: 'hint' },
        'Re-download after schedule changes or big watering-day shifts; delete the old events when you re-import. On iPhone: open the file → “Add All” to Calendar.'),
    ),

    el('section', { class: 'settings-block specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'Preferences'),
      el('div', { class: 'field-row' },
        field('units', units),
        field('default water', waterSource, 'plants that need filtered water are flagged regardless')),
    ),

    el('section', { class: 'settings-block specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'Backup'),
      el('p', { style: 'font-size:.9rem' },
        `Everything lives only on this device — ${stats.plants} plants, ${stats.logs} log entries, ${stats.photos} photos. Export a backup now and then; it’s the only copy.`),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn-primary', onclick: async () => { await exportBackup(); toast('Backup downloaded.'); } }, '⬇ Export backup'),
        el('button', { onclick: () => importInput.click() }, '⬆ Import backup'),
      ),
      importInput,
    ),

    el('section', { class: 'settings-block' },
      el('h2', {}, 'About'),
      el('p', { class: 'muted', style: 'font-size:.85rem' },
        'PlantDaddy — a field journal for the windowsill. Works offline; add it to your home screen for the full app feel (Share → Add to Home Screen on iOS).'),
    ),
  );
}
