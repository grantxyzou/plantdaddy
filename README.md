# PlantDaddy 🌿

A field journal for the windowsill — an installable, offline-first PWA for tracking a home plant collection: watering reminders, professional care advice, and photo-based progress tracking.

## Why

Built around three real problems:

1. **"I always forget to water"** — the Today screen leads with what's due, watering is one tap, and a downloadable `.ics` calendar hands the nagging to your phone's native Calendar (no server, no accounts).
2. **"I need professional advice"** — every plant has a curated care guide: what healthy looks like, how to water *that species*, troubleshooting (brown tips → cause → fix), and seasonal notes. Struggling plants surface as "Doctor's orders" on the dashboard.
3. **"Seeing progress would motivate me"** — photo timelines per plant with a baseline-vs-latest compare view, health history with notes, and a collection health strip with a care streak.

## Features

- **Today dashboard** — due/overdue list sorted by urgency, one-tap 💧 Watered / 🌿 Fed buttons, health counts, care streak
- **9 seeded specimens** from `data/seed.json` (herbarium-numbered), plus add/edit/archive for new plants
- **Care logging** — water, soil, fertilizer, sunlight, health; "last watered X days ago" computed from real logs; next due date shifts from the actual watering date
- **Care guides** — species-matched professional advice with troubleshooting tables (`js/care-guides.js`)
- **Photos** — camera or upload, resized on-device to ≤1200px, timeline + progress compare
- **Health history** — status changes (Healthy / Watch / Needs attention) logged with notes over time
- **AI check-up** — 🩺 sends a photo to Claude for a visual assessment: status, confidence, what it sees, likely causes and what to do. Observations it can localize are drawn as numbered boxes on the photo, so the reasoning is checkable rather than just assertive. Length is adjustable (brief / standard / detailed), and an unsaved result waits for you across tab switches, reloads and app restarts. Saving it writes an ordinary health log marked "AI".
- **Calendar reminders** — exports recurring watering + seasonal feeding events with alarms as `.ics`
- **Backup** — export/import everything (data + photos) as a single JSON file
- **Offline-first** — IndexedDB + service worker; works with no connection after first load

## Your data

The journal lives **only on the device** — IndexedDB, no account, no sync, no server-side
database. Losing the phone loses the journal, which is why the settings screen nudges toward
exporting backups.

Two things reach the network, both plainly disclosed in the UI:

- **AI check-up**, only when you tap 🩺 — sends the photo, the plant's profile and cadence, and
  its last ~20 care-log entries *including notes you typed*. The care history is what separates
  overwatering from underwatering, which the leaves often can't show. The serverless function
  relays this to Anthropic and returns the answer; it stores and logs nothing.
- **Reference photos** — the care guide and card thumbnails fetch species images from Wikipedia,
  which reveals which species you're viewing (no personal data).

The API key lives only in the `ANTHROPIC_API_KEY` environment variable on the server, never in
client code. Without it the endpoint answers 501 and the app degrades gracefully.

## Stack

Vanilla JS ES modules, no build step, no client dependencies. IndexedDB for storage, service
worker for offline. Static hosting plus **one serverless function** (`api/diagnose.js`, the only
server-side code, needing `@anthropic-ai/sdk`); `vercel.json` included.

## Develop

```sh
python3 -m http.server 8321   # or any static server
# open http://localhost:8321
npm test                      # unit tests for api/diagnose.js (node --test, no installs needed)
```

A static server covers everything except `/api/diagnose`, which needs `vercel dev` or a
deployment. `CACHE` in `sw.js` is a housekeeping label, not a correctness lever — navigations and
app code are network-first, so forgetting to bump it can't strand anyone on stale code.

## Install on iPhone

Open the deployed URL in Safari → Share → **Add to Home Screen**. Camera, offline mode, and the app badge work from the home-screen install.

## iOS push notifications (future)

True background push needs a small server (subscriptions + VAPID + scheduled sends) — see the build brief. The current design deliberately ships without one; the `.ics` calendar export covers reminders in the meantime.
