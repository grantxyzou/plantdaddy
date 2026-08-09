// Due-date math. Next due dates shift from the ACTUAL last log, so watering
// early or late reschedules the cycle rather than nagging on a fixed calendar.

import { listPlants, lastLogOfType, getSettings, saveSettings } from './store.js';

const DAY = 24 * 60 * 60 * 1000;

export function cadenceOf(plant) {
  if (plant.cadenceOverride && plant.cadenceOverride.min) return plant.cadenceOverride;
  const f = plant.water && plant.water.frequencyDays;
  if (!f) return { min: 7, max: 10 };
  return { min: f.min, max: f.max || f.min };
}

// Months (1-12) a season string covers. Northern-hemisphere reading.
export function seasonMonths(season) {
  if (!season || /n\/a/i.test(season)) return null;
  if (/spring-summer/i.test(season)) return [3, 4, 5, 6, 7, 8, 9];
  if (/actively growing|while/i.test(season)) return null; // treat as year-round
  return null;
}

export function inSeason(season, date = new Date()) {
  const months = seasonMonths(season);
  if (!months) return true;
  return months.includes(date.getMonth() + 1);
}

/**
 * Watering status for one plant.
 * Returns { anchorTs, dueTs, lateTs, daysSince, dueInDays, state }
 * state: 'ok' | 'due' | 'overdue' | 'unknown'
 * due at anchor+min days, overdue past anchor+max days.
 */
export async function waterStatus(plant, now = Date.now()) {
  const { min, max } = cadenceOf(plant);
  const last = await lastLogOfType(plant.id, 'water');
  const anchorTs = last ? last.ts : plant.baselineTs || now;
  const dueTs = anchorTs + min * DAY;
  const lateTs = anchorTs + max * DAY;
  const daysSince = Math.floor((now - anchorTs) / DAY);
  const dueInDays = Math.ceil((dueTs - now) / DAY);
  let state = 'ok';
  if (now > lateTs) state = 'overdue';
  else if (now >= dueTs) state = 'due';
  return { anchorTs, dueTs, lateTs, daysSince, dueInDays, state, hasLog: !!last };
}

export async function fertilizerStatus(plant, now = Date.now()) {
  const freq = plant.fertilizer && plant.fertilizer.frequencyDays;
  if (!freq) return { state: 'none' };
  if (!inSeason(plant.fertilizer.activeSeason, new Date(now))) return { state: 'off-season' };
  const last = await lastLogOfType(plant.id, 'fertilizer');
  const anchorTs = last ? last.ts : plant.baselineTs || now;
  const dueTs = anchorTs + freq * DAY;
  const daysSince = Math.floor((now - anchorTs) / DAY);
  const state = now >= dueTs ? 'due' : 'ok';
  return { anchorTs, dueTs, daysSince, state, hasLog: !!last };
}

/** Status for every active plant, sorted most urgent first. */
export async function collectionStatus(now = Date.now()) {
  const plants = await listPlants();
  const rows = [];
  for (const plant of plants) {
    const water = await waterStatus(plant, now);
    const fert = await fertilizerStatus(plant, now);
    rows.push({ plant, water, fert });
  }
  const rank = { overdue: 0, due: 1, ok: 2 };
  rows.sort((a, b) =>
    (rank[a.water.state] - rank[b.water.state]) ||
    (a.water.dueTs - b.water.dueTs));
  return rows;
}

/**
 * Care streak: consecutive days with nothing overdue. We track the last
 * date an overdue plant was seen; the streak runs from the day after.
 */
export async function careStreak(rows) {
  const settings = await getSettings();
  const today = new Date().toISOString().slice(0, 10);
  const anyOverdue = rows.some(r => r.water.state === 'overdue');
  if (anyOverdue) {
    if (settings.lastOverdueDate !== today) {
      await saveSettings({ lastOverdueDate: today });
    }
    return 0;
  }
  const from = settings.lastOverdueDate
    ? Date.parse(settings.lastOverdueDate) + DAY
    : settings.streakStart || Date.now();
  return Math.max(0, Math.floor((Date.now() - from) / DAY));
}

/** Update the app icon badge with the number of plants needing water. */
export function updateBadge(rows) {
  if (!('setAppBadge' in navigator)) return;
  const n = rows.filter(r => r.water.state !== 'ok').length;
  if (n > 0) navigator.setAppBadge(n).catch(() => {});
  else navigator.clearAppBadge().catch(() => {});
}
