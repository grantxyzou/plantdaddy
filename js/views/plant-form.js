// Add / edit a specimen.

import { getPlant, savePlant, addLog, nextSpecimenNo } from '../store.js';
import { el, mount, toast } from '../ui.js';

export async function renderPlantForm(app, id) {
  const existing = id ? await getPlant(id) : null;
  const specimenNo = existing ? existing.specimenNo : await nextSpecimenNo();

  const f = {
    latinName: el('input', { type: 'text', required: true, value: existing?.latinName || '', placeholder: 'Monstera deliciosa' }),
    commonName: el('input', { type: 'text', required: true, value: existing?.commonName || '', placeholder: 'Swiss Cheese Plant' }),
    potType: el('input', { type: 'text', value: existing?.potType || '', placeholder: 'terracotta pot' }),
    lightLevel: el('input', { type: 'text', value: existing?.light?.level || '', placeholder: 'bright indirect' }),
    lightNotes: el('input', { type: 'text', value: existing?.light?.notes || '', placeholder: 'no direct afternoon sun' }),
    waterMin: el('input', { type: 'number', min: 1, max: 120, required: true, value: existing?.water?.frequencyDays?.min ?? 7 }),
    waterMax: el('input', { type: 'number', min: 1, max: 180, required: true, value: existing?.water?.frequencyDays?.max ?? 10 }),
    waterNotes: el('input', { type: 'text', value: existing?.water?.notes || '', placeholder: 'let top 2in dry out' }),
    soilType: el('input', { type: 'text', value: existing?.soil?.type || '', placeholder: 'well-draining potting mix' }),
    fertDays: el('input', { type: 'number', min: 0, max: 365, value: existing?.fertilizer?.frequencyDays ?? 30 }),
    fertType: el('input', { type: 'text', value: existing?.fertilizer?.type || '', placeholder: 'balanced liquid, diluted' }),
    fertSeason: el('select', {},
      el('option', { value: 'spring-summer' }, 'spring–summer'),
      el('option', { value: 'year-round' }, 'year-round'),
    ),
    humidity: el('input', { type: 'text', value: existing?.humidity || '', placeholder: 'average' }),
    status: el('select', {},
      el('option', { value: 'healthy' }, 'Healthy'),
      el('option', { value: 'watch' }, 'Watch'),
      el('option', { value: 'attention' }, 'Needs attention'),
    ),
  };
  if (existing?.fertilizer?.activeSeason && !/spring/.test(existing.fertilizer.activeSeason)) f.fertSeason.value = 'year-round';

  const field = (label, input, hint) => el('div', { class: 'field' },
    el('label', {}, label), input, hint ? el('span', { class: 'hint' }, hint) : null);

  mount(app,
    el('h1', {}, existing ? `Edit No. ${specimenNo}` : `New specimen · No. ${specimenNo}`),
    el('form', {
      class: 'sheet specimen',
      onsubmit: async e => {
        e.preventDefault();
        const min = Math.min(+f.waterMin.value, +f.waterMax.value);
        const max = Math.max(+f.waterMin.value, +f.waterMax.value);
        const plant = {
          ...(existing || { baselineTs: Date.now(), archived: false, cadenceOverride: null }),
          specimenNo,
          latinName: f.latinName.value.trim(),
          commonName: f.commonName.value.trim(),
          potType: f.potType.value.trim(),
          light: { level: f.lightLevel.value.trim(), notes: f.lightNotes.value.trim() },
          water: { frequencyDays: { min, max }, notes: f.waterNotes.value.trim() },
          soil: { ...(existing?.soil || {}), type: f.soilType.value.trim() },
          fertilizer: +f.fertDays.value > 0
            ? { frequencyDays: +f.fertDays.value, activeSeason: f.fertSeason.value, type: f.fertType.value.trim() }
            : { frequencyDays: 0, activeSeason: 'n/a', type: 'none' },
          humidity: f.humidity.value.trim(),
        };
        const saved = await savePlant(plant);
        if (!existing) {
          await addLog({ plantId: saved.id, type: 'health', status: f.status.value, note: 'Added to the collection.' });
        }
        toast(existing ? 'Specimen updated.' : `Welcome, ${saved.commonName}.`);
        location.hash = `#/plant/${saved.id}`;
      },
    },
      field('Latin name', f.latinName, 'shown in italics, herbarium style'),
      field('Common name', f.commonName),
      field('Pot', f.potType),
      el('div', { class: 'field-row' }, field('Light level', f.lightLevel), field('Light notes', f.lightNotes)),
      el('div', { class: 'field-row' },
        field('Water every (min days)', f.waterMin),
        field('…to (max days)', f.waterMax)),
      field('Watering notes', f.waterNotes),
      field('Soil', f.soilType),
      el('div', { class: 'field-row' },
        field('Feed every (days)', f.fertDays, '0 = no feeding'),
        field('Feeding season', f.fertSeason)),
      field('Fertilizer type', f.fertType),
      field('Humidity', f.humidity),
      !existing ? field('Starting health', f.status) : null,
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn-primary', type: 'submit' }, existing ? 'Save changes' : 'Add to collection'),
      ),
    ),
  );
}
