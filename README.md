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
- **Calendar reminders** — exports recurring watering + seasonal feeding events with alarms as `.ics`
- **Backup** — export/import everything (data + photos) as a single JSON file
- **Offline-first** — IndexedDB + service worker; works with no connection after first load

## Stack

Vanilla JS ES modules, no build step, no dependencies. IndexedDB for storage, service worker for offline, static hosting anywhere with HTTPS (`vercel.json` included).

## Develop

```sh
python3 -m http.server 8321   # or any static server
# open http://localhost:8321
```

When changing any shell file, bump `VERSION` in `sw.js` so clients pick up the new cache.

## Install on iPhone

Open the deployed URL in Safari → Share → **Add to Home Screen**. Camera, offline mode, and the app badge work from the home-screen install.

## iOS push notifications (future)

True background push needs a small server (subscriptions + VAPID + scheduled sends) — see the build brief. The current design deliberately ships without one; the `.ics` calendar export covers reminders in the meantime.
