// Preferences, calendar reminder export, backup / restore.

import { getSettings, saveSettings, listPlants, counts } from '../store.js';
import { downloadCalendar } from '../ics.js';
import { exportBackup, importBackup } from '../backup.js';
import { checkForUpdate, forceRefresh } from '../update.js';
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

  const aiDetail = el('select', { 'aria-label': 'AI check-up detail level' },
    el('option', { value: 'brief' }, 'brief — verdict + top actions'),
    el('option', { value: 'standard' }, 'standard'),
    el('option', { value: 'detailed' }, 'detailed — fuller reasoning'));
  aiDetail.value = settings.aiDetail;

  const save = async () => {
    await saveSettings({
      units: units.value,
      waterSource: waterSource.value,
      reminderHour: +reminderHour.value,
      leadTimeMinutes: +lead.value,
      aiDetail: aiDetail.value,
    });
    toast('Preferences saved.');
  };
  for (const s of [units, waterSource, reminderHour, lead, aiDetail]) s.addEventListener('change', save);

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

    el('section', { class: 'settings-block specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'App version'),
      el('p', { style: 'font-size:.9rem' },
        'PlantDaddy updates itself whenever you open it with a connection. If it ever looks out of date, these force the issue.'),
      el('div', { class: 'row-actions' },
        el('button', {
          onclick: async e => {
            e.target.disabled = true;
            await checkForUpdate();
            toast('Checked — you’ll see a Refresh banner if anything is new.');
            e.target.disabled = false;
          },
        }, '⟳ Check for updates'),
        el('button', {
          class: 'btn-danger btn-ghost',
          onclick: async () => {
            if (!window.confirm('Clear the app cache and reload?\n\nYour plants, logs and photos are NOT affected — only the cached app files.')) return;
            await forceRefresh();
          },
        }, 'Force refresh'),
      ),
      el('p', { class: 'hint' }, 'Force refresh clears cached app files only. Your journal stays put.'),
    ),

    el('section', { class: 'settings-block specimen' },
      el('h2', { class: 'on-card', style: 'margin-top:0' }, 'AI diagnosis'),
      el('p', { style: 'font-size:.9rem' },
        'The 🩺 buttons send that photo to Anthropic’s Claude for a visual check-up, along with the plant’s details and its recent care log — including notes you’ve typed. The care history is what lets the doctor tell overwatering from underwatering, which leaves alone often can’t. Results are suggestions, saved into the health history marked “AI”.'),
      el('p', { class: 'hint' },
        'Nothing else leaves the device, and nothing is sent until you tap 🩺. Your journal itself is stored only on this phone — there is no account and no sync.'),
      el('div', { class: 'field-row' },
        field('how much detail', aiDetail, 'applies to the next check-up you run')),
      el('p', { style: 'font-size:.9rem' },
        'Where it can, the doctor draws numbered boxes on the photo showing what it’s describing — so you can check its reasoning instead of taking its word.'),
      el('p', { class: 'hint' },
        'Runs on the deployment owner’s Anthropic API key — set ANTHROPIC_API_KEY in the Vercel dashboard to enable it. Each check costs well under a cent; setting a spend limit in the Anthropic console is a good idea.'),
    ),

    el('section', { class: 'settings-block' },
      el('h2', {}, 'About'),
      el('p', { class: 'muted', style: 'font-size:.85rem' },
        'PlantDaddy — a field journal for the windowsill. Works offline; add it to your home screen for the full app feel (Share → Add to Home Screen on iOS).'),
    ),
  );
}
