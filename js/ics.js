// Calendar export: one .ics file with a recurring watering event per plant
// (plus seasonal fertilizing events), each with an alarm. Importing it into
// the phone's native calendar gives real reminders with no server.

import { cadenceOf, seasonMonths, waterStatus, fertilizerStatus } from './schedule.js';

function pad(n) { return String(n).padStart(2, '0'); }

function icsDate(ts, hour) {
  const d = new Date(ts);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}0000`;
}

function esc(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function fold(line) {
  // RFC 5545 says lines should stay under 75 octets; fold with CRLF + space.
  const out = [];
  let s = line;
  while (s.length > 73) {
    out.push(s.slice(0, 73));
    s = ' ' + s.slice(73);
  }
  out.push(s);
  return out.join('\r\n');
}

function vevent({ uid, startTs, hour, summary, description, intervalDays, months, leadTimeMinutes }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDate(Date.now(), 12)}Z`.replace(/(\d{6})Z$/, '00Z'),
    `DTSTART:${icsDate(startTs, hour)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `RRULE:FREQ=DAILY;INTERVAL=${intervalDays}${months ? `;BYMONTH=${months.join(',')}` : ''}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(summary)}`,
    `TRIGGER:-PT${leadTimeMinutes || 0}M`,
    'END:VALARM',
    'END:VEVENT',
  ];
  return lines.map(fold).join('\r\n');
}

export async function buildCalendar(plants, settings) {
  const now = Date.now();
  const events = [];

  for (const plant of plants) {
    const { min, max } = cadenceOf(plant);
    const interval = Math.round((min + max) / 2);
    const ws = await waterStatus(plant, now);
    // Start at the next due date (or tomorrow if already overdue).
    const startTs = Math.max(ws.dueTs, now + 12 * 60 * 60 * 1000);
    events.push(vevent({
      uid: `water-${plant.id}@plantdaddy`,
      startTs,
      hour: settings.reminderHour,
      summary: `💧 Water ${plant.commonName}`,
      description: `${plant.latinName} — every ${min}–${max} days. ${plant.water?.notes || ''}\nLog it in PlantDaddy after watering.`,
      intervalDays: interval,
      months: null,
      leadTimeMinutes: settings.leadTimeMinutes,
    }));

    const freq = plant.fertilizer && plant.fertilizer.frequencyDays;
    if (freq) {
      const fs = await fertilizerStatus(plant, now);
      const fStart = fs.dueTs ? Math.max(fs.dueTs, now + 12 * 60 * 60 * 1000) : now + 12 * 60 * 60 * 1000;
      events.push(vevent({
        uid: `feed-${plant.id}@plantdaddy`,
        startTs: fStart,
        hour: settings.reminderHour,
        summary: `🌿 Feed ${plant.commonName}`,
        description: `${plant.latinName} — ${plant.fertilizer.type || 'fertilizer'} every ${freq} days (${plant.fertilizer.activeSeason || 'year-round'}).`,
        intervalDays: freq,
        months: seasonMonths(plant.fertilizer.activeSeason),
        leadTimeMinutes: settings.leadTimeMinutes,
      }));
    }
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PlantDaddy//Care Reminders//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:PlantDaddy care',
    events.join('\r\n'),
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
}

export async function downloadCalendar(plants, settings) {
  const ics = await buildCalendar(plants, settings);
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantdaddy-care.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
