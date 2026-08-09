// Domain layer: plants, care logs, photos, settings, first-run seeding.

import * as db from './db.js';

export const HEALTH = { healthy: 'Healthy', watch: 'Watch', attention: 'Needs attention' };

export const DEFAULT_SETTINGS = {
  key: 'prefs',
  units: 'F',
  waterSource: 'tap',
  reminderHour: 9,        // hour of day for calendar reminders
  leadTimeMinutes: 0,     // alarm lead time before the event
  seeded: false,
  lastOverdueDate: null,  // for the care streak
  streakStart: null,
};

// ————— settings —————

export async function getSettings() {
  const stored = await db.get('settings', 'prefs');
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch, key: 'prefs' };
  await db.put('settings', next);
  return next;
}

// ————— plants —————

export async function listPlants({ includeArchived = false } = {}) {
  const all = await db.getAll('plants');
  const plants = includeArchived ? all : all.filter(p => !p.archived);
  return plants.sort((a, b) => (a.specimenNo || '999').localeCompare(b.specimenNo || '999'));
}

export async function getPlant(id) {
  return db.get('plants', id);
}

export async function savePlant(plant) {
  if (!plant.id) {
    plant.id = `plant-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  }
  await db.put('plants', plant);
  return plant;
}

export async function archivePlant(id, archived = true) {
  const p = await getPlant(id);
  if (!p) return;
  p.archived = archived;
  await db.put('plants', p);
}

export async function nextSpecimenNo() {
  const all = await db.getAll('plants');
  const max = all.reduce((m, p) => Math.max(m, parseInt(p.specimenNo, 10) || 0), 0);
  return String(max + 1).padStart(3, '0');
}

// ————— logs —————
// types: water | soil | fertilizer | sunlight | health

export async function addLog(entry) {
  const log = { ts: Date.now(), ...entry };
  await db.put('logs', log);
  return log;
}

export async function logsForPlant(plantId) {
  const logs = await db.getAll('logs', 'byPlant', plantId);
  return logs.sort((a, b) => b.ts - a.ts);
}

export async function allLogs() {
  const logs = await db.getAll('logs');
  return logs.sort((a, b) => b.ts - a.ts);
}

export async function lastLogOfType(plantId, type) {
  const logs = await logsForPlant(plantId);
  return logs.find(l => l.type === type) || null;
}

export async function healthHistory(plantId) {
  const logs = await logsForPlant(plantId);
  return logs.filter(l => l.type === 'health');
}

export async function currentHealth(plantId) {
  const history = await healthHistory(plantId);
  return history[0] || null;
}

// ————— doctor's orders tracking —————
// An "attended" mark is tied to the specific health-log entry that raised
// the advice, so recording a NEW health note automatically re-opens it.

export async function ackAdvice(plantId, healthLogId, noteText = '') {
  const p = await getPlant(plantId);
  if (!p) return;
  p.adviceAckLogId = healthLogId;
  p.adviceAckTs = Date.now();
  await db.put('plants', p);
  await addLog({
    plantId, type: 'note',
    note: `Attended to doctor's orders${noteText ? `: ${noteText.slice(0, 90)}` : ''}`,
  });
}

export async function unackAdvice(plantId) {
  const p = await getPlant(plantId);
  if (!p) return;
  delete p.adviceAckLogId;
  delete p.adviceAckTs;
  await db.put('plants', p);
}

// ————— photos —————

export async function addPhoto({ plantId, blob, note = '', ts = Date.now() }) {
  await db.put('photos', { plantId, blob, note, ts });
}

export async function photosForPlant(plantId) {
  const photos = await db.getAll('photos', 'byPlant', plantId);
  return photos.sort((a, b) => b.ts - a.ts);
}

export async function latestPhoto(plantId) {
  return (await photosForPlant(plantId))[0] || null;
}

export async function allPhotos() {
  const photos = await db.getAll('photos');
  return photos.sort((a, b) => b.ts - a.ts);
}

export async function deletePhoto(id) {
  await db.del('photos', id);
}

// ————— first-run seeding —————

export async function seedIfNeeded() {
  const settings = await getSettings();
  if (settings.seeded) return false;

  const res = await fetch('data/seed.json');
  const seed = await res.json();
  const baselineTs = Date.parse(seed.generatedOn + 'T12:00:00') || Date.now();

  for (const sp of seed.plants) {
    const plant = {
      id: sp.id,
      specimenNo: sp.specimenNo,
      latinName: sp.latinName,
      commonName: sp.commonName,
      identificationConfidence: sp.identificationConfidence,
      potType: sp.potType,
      light: sp.light,
      water: sp.water,
      soil: sp.soil,
      fertilizer: sp.fertilizer,
      humidity: sp.humidity,
      baselinePhotoDescription: sp.baselinePhotoDescription,
      baselineTs,
      archived: false,
      cadenceOverride: null, // {min, max} if the user tunes it
    };
    await db.put('plants', plant);
    // Baseline health becomes the first entry in the health history.
    await db.put('logs', {
      plantId: sp.id,
      type: 'health',
      ts: baselineTs,
      status: sp.baselineHealth.status,
      note: sp.baselineHealth.notes,
    });
  }

  await saveSettings({ seeded: true, streakStart: Date.now() });
  return true;
}

// ————— backup counts (for settings screen) —————

export async function counts() {
  const [plants, logs, photos] = await Promise.all([
    db.getAll('plants'), db.getAll('logs'), db.getAll('photos'),
  ]);
  return { plants: plants.length, logs: logs.length, photos: photos.length };
}
