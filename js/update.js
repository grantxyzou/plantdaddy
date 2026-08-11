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
let boot = null; // { source, value } — what the server was serving at boot

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
 * What the server is serving right now.
 *
 * `/api/version` is the real answer: it changes on every deploy, including
 * the common case where only js/*.js changed and neither sw.js nor
 * index.html did. Watching index.html alone misses those completely — which
 * is exactly how an installed app sits on old code for weeks.
 *
 * index.html is the fallback for static hosting with no functions. It is
 * weaker for the same reason, but better than no check at all. No query
 * string: a cache-busting URL would leave one permanent service-worker cache
 * entry per check, in a quota shared with the photo journal.
 */
async function currentVersion() {
  try {
    const res = await fetch('api/version', { cache: 'no-store' });
    if (res.ok) {
      const { version } = await res.json();
      if (version) return { source: 'api', value: String(version) };
    }
  } catch { /* no function deployed, or offline — try the fallback */ }

  try {
    const res = await fetch('index.html', { cache: 'no-store' });
    if (!res.ok) return null;
    const stamp = res.headers.get('etag') || res.headers.get('last-modified');
    return { source: 'html', value: stamp || String((await res.text()).length) };
  } catch {
    return null;
  }
}

/**
 * Compare against boot. `autoReload` is for the moments the app comes back to
 * the foreground — the natural point to pick up new code; elsewhere we only
 * offer the banner.
 */
async function compareDeployedVersion({ autoReload = false } = {}) {
  const now = await currentVersion();
  if (!now) return;                       // offline — nothing to say
  if (!boot) { boot = now; return; }
  // Channel changed (the function went down, or came back): the two sources
  // aren't comparable, so re-baseline rather than read it as a new deploy.
  if (now.source !== boot.source) { boot = now; return; }
  if (now.value === boot.value) return;
  if (autoReload) safeReload();
  else showBanner();
}

export async function checkForUpdate() {
  if (registration) await registration.update().catch(() => {});
  await compareDeployedVersion({ autoReload: true });
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
  currentVersion().then(v => { if (!boot) boot = v; });

  if (!('serviceWorker' in navigator)) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') compareDeployedVersion({ autoReload: true });
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
    setInterval(() => {
      reg.update().catch(() => {});
      compareDeployedVersion({ autoReload: document.visibilityState !== 'visible' });
    }, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      reg.update().catch(() => {});
      applyWaiting();                                 // a worker that installed while we were away
      compareDeployedVersion({ autoReload: true });   // ...or a deploy that touched neither sw.js nor index.html
    });
    window.addEventListener('pageshow', e => {
      if (e.persisted) { reg.update().catch(() => {}); compareDeployedVersion({ autoReload: true }); }
    });
  }).catch(() => {});
}
