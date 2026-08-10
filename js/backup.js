// Full backup: every plant, log, photo (base64), and setting in one JSON
// file. This is the only copy of the journal if the device is lost — the
// settings screen nudges toward exporting regularly.

import * as idb from './db.js';
import { blobToDataURL, dataURLToBlob } from './photos.js';

const FORMAT = 'plantdaddy-backup';
const FORMAT_VERSION = 1;

export async function exportBackup() {
  const [plants, logs, photos, settings] = await Promise.all([
    idb.getAll('plants'), idb.getAll('logs'), idb.getAll('photos'), idb.getAll('settings'),
  ]);
  const photosOut = [];
  for (const p of photos) {
    photosOut.push({ ...p, blob: undefined, dataURL: await blobToDataURL(p.blob) });
  }
  const payload = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    plants, logs, settings,
    photos: photosOut,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plantdaddy-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function importBackup(file) {
  const payload = JSON.parse(await file.text());
  if (payload.format !== FORMAT) throw new Error('Not a PlantDaddy backup file');

  // Drafts are deliberately not exported — they're unsaved suggestions, and a
  // restored one would point at photo ids from a different device.
  await Promise.all([
    idb.clear('plants'), idb.clear('logs'), idb.clear('photos'), idb.clear('settings'),
    idb.clear('diagnoses'),
  ]);
  for (const p of payload.plants || []) await idb.put('plants', p);
  for (const l of payload.logs || []) await idb.put('logs', l);
  for (const s of payload.settings || []) await idb.put('settings', s);
  for (const ph of payload.photos || []) {
    const blob = await dataURLToBlob(ph.dataURL);
    await idb.put('photos', { id: ph.id, plantId: ph.plantId, ts: ph.ts, note: ph.note, blob });
  }
  return {
    plants: (payload.plants || []).length,
    logs: (payload.logs || []).length,
    photos: (payload.photos || []).length,
  };
}
