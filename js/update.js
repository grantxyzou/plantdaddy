// Keeping the installed app current.
//
// iOS home-screen PWAs are the hard case: resuming from the app switcher
// often restores a snapshot instead of navigating, so `load` never fires
// again and the browser never checks whether sw.js changed. That is how an
// app goes stale "even after a restart". The fix is to stop relying on
// navigation and check explicitly whenever the app comes to the foreground.

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

let registration = null;
let reloading = false;
let bootStamp = null; // identity of index.html when this page started

/** Reload unless the user is mid-typing — then leave the banner up instead. */
function safeReload() {
  if (reloading) return;
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
    showBanner();
    return;
  }
  reloading = true;
  location.reload();
}

function showBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner || banner.classList.contains('show')) return;
  banner.classList.add('show');
  banner.hidden = false;
}

function hideBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.classList.remove('show');
  banner.hidden = true;
}

/** Ask a waiting worker to take over; the controllerchange handler reloads. */
function applyWaiting() {
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }
  return false;
}

/**
 * Ask the server what index.html looks like right now. Catches the case where
 * a deploy happened while the app sat open for days and sw.js itself did not
 * change, so the worker's own update check sees nothing.
 */
async function deployedStamp() {
  try {
    const res = await fetch(`index.html?_v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.headers.get('etag') || res.headers.get('last-modified') || String((await res.text()).length);
  } catch {
    return null;
  }
}

async function compareDeployedVersion() {
  const now = await deployedStamp();
  if (!now) return;              // offline — nothing to say
  if (bootStamp === null) { bootStamp = now; return; }
  if (now !== bootStamp) showBanner();
}

export async function checkForUpdate() {
  if (registration) await registration.update().catch(() => {});
  await compareDeployedVersion();
}

/** Manual escape hatch: drop every cache and re-register. Never touches IndexedDB. */
export async function forceRefresh() {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  if (registration) await registration.unregister().catch(() => {});
  reloading = true;
  location.reload();
}

export function initUpdates() {
  const banner = document.getElementById('update-banner');
  banner?.querySelector('button')?.addEventListener('click', () => {
    hideBanner();
    if (!applyWaiting()) { reloading = true; location.reload(); }
  });

  // Works with or without a service worker: remember what the server was
  // serving when we booted, then watch for it changing under us.
  deployedStamp().then(s => { bootStamp = s; });

  if (!('serviceWorker' in navigator)) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') compareDeployedVersion();
    });
    return;
  }

  // A new worker took control — the page is running old code, so reload once.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) safeReload();
  });

  navigator.serviceWorker.register('sw.js').then(reg => {
    registration = reg;

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      installing?.addEventListener('statechange', () => {
        // Installed while a controller exists => this is an update, not a
        // first install. Apply it right away when the app is in the
        // background/foreground transition, else offer the banner.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          if (document.visibilityState === 'visible') showBanner();
          applyWaiting();
        }
      });
    });

    // The triggers that beat iOS's flaky update checks: a resumed home-screen
    // PWA often never navigates, so foregrounding is our real "page load".
    reg.update().catch(() => {});
    setInterval(() => { reg.update().catch(() => {}); compareDeployedVersion(); }, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      reg.update().catch(() => {});
      applyWaiting();            // a worker that installed while we were away
      compareDeployedVersion();  // ...or a deploy that did not touch sw.js
    });
    window.addEventListener('pageshow', e => {
      if (e.persisted) { reg.update().catch(() => {}); compareDeployedVersion(); }
    });
  }).catch(() => {});
}
