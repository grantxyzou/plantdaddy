// Species reference images — "what healthy looks like", visually.
// Fetched at runtime from Wikipedia's public REST API (CORS-open, hotlinking
// permitted), then remembered on the plant record so lookups happen once.
// The service worker caches the image itself, so after the first online view
// it works offline too. Everything degrades gracefully when offline.

import { getPlant, savePlant } from './store.js';

// Wikipedia article per species, matched against latin + common name.
const WIKI_TITLES = [
  [/strelitzia/i, 'Strelitzia nicolai'],
  [/philodendron bipennifolium|horsehead/i, 'Philodendron bipennifolium'],
  [/epipremnum|pothos/i, 'Epipremnum aureum'],
  [/maranta/i, 'Maranta leuconeura'],
  [/philodendron hederaceum|heartleaf/i, 'Philodendron hederaceum'],
  [/phalaenopsis|orchid/i, 'Phalaenopsis'],
  [/calathea|goeppertia/i, 'Goeppertia insignis'],
  [/sansevieria|dracaena trifasciata|snake plant/i, 'Dracaena trifasciata'],
];

export function wikiTitleFor(plant) {
  const hay = `${plant.latinName} ${plant.commonName}`;
  const hit = WIKI_TITLES.find(([re]) => re.test(hay));
  return hit ? hit[1] : null;
}

/** Rewrite a wikimedia thumb URL to a different width. */
export function wikiThumbAt(url, width) {
  if (!url) return url;
  return url.replace(/\/(\d+)px-([^/]+)$/, `/${width}px-$2`);
}

const REFRESH_AFTER = 90 * 24 * 60 * 60 * 1000; // re-check every ~3 months

/**
 * Resolve (and memoize on the plant) a reference image for the species.
 * Returns { thumb, page, title } or null. Never throws; null when offline
 * and nothing cached.
 */
export async function referenceImage(plant) {
  if (plant.refImage === false) return null; // known to have none
  if (plant.refImage && Date.now() - (plant.refImage.fetchedAt || 0) < REFRESH_AFTER) {
    return plant.refImage;
  }
  const title = wikiTitleFor(plant);
  if (!title) return plant.refImage || null;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const fresh = await getPlant(plant.id); // re-read: don't clobber concurrent edits
    if (!fresh) return null;
    if (data.thumbnail?.source) {
      fresh.refImage = {
        thumb: data.thumbnail.source,
        page: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`,
        title,
        fetchedAt: Date.now(),
      };
    } else {
      fresh.refImage = false;
    }
    await savePlant(fresh);
    return fresh.refImage || null;
  } catch {
    return plant.refImage || null; // offline or API hiccup — use whatever we had
  }
}

// Parchment-toned leaf placeholder for plants with no photo and no reference.
export const PLACEHOLDER_THUMB = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="#1d2f23"/>
    <path fill="#8fae72" opacity=".9" d="M48 18C33 30 24 43.5 24 55.5A22.5 22.5 0 0 0 46.5 78h1.5c.6-9-1.2-19.8-7.8-30.3c8.1 8.1 12.9 18.3 14.1 30A22.5 22.5 0 0 0 72 55.5C72 43.5 63 30 48 18Z"/>
  </svg>`);

/**
 * Pick the face of a plant card: the owner's latest photo of THIS plant
 * beats a generic species reference, which beats the leaf placeholder.
 * `latestPhotoURL` is an object URL for the newest stored photo, if any.
 */
export function thumbSrc(plant, latestPhotoURL) {
  if (latestPhotoURL) return { src: latestPhotoURL, kind: 'photo' };
  if (plant.refImage && plant.refImage.thumb) return { src: plant.refImage.thumb, kind: 'reference' };
  return { src: PLACEHOLDER_THUMB, kind: 'placeholder' };
}
