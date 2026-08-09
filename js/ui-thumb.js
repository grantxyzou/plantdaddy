// Card thumbnail: the plant's face. Latest owner photo > species reference
// photo > leaf placeholder. When only the placeholder is available, the
// Wikipedia reference resolves in the background and swaps in when ready.

import { el } from './ui.js';
import { thumbSrc, referenceImage, wikiTitleFor, PLACEHOLDER_THUMB } from './species-images.js';

export function plantThumb(plant, latestPhotoURL, { size = 'thumb' } = {}) {
  const { src, kind } = thumbSrc(plant, latestPhotoURL);
  const img = el('img', {
    class: `thumb thumb-${size} thumb-${kind}`,
    src,
    alt: kind === 'photo'
      ? `Your latest photo of ${plant.commonName}`
      : kind === 'reference'
        ? `Reference photo of ${plant.latinName}`
        : '',
    loading: 'lazy',
    onerror: function () {
      if (this.src !== PLACEHOLDER_THUMB) {
        this.src = PLACEHOLDER_THUMB;
        this.classList.remove('thumb-photo', 'thumb-reference');
        this.classList.add('thumb-placeholder');
        this.alt = '';
      }
    },
  });
  if (kind === 'placeholder' && wikiTitleFor(plant)) {
    referenceImage(plant).then(ref => {
      if (ref && ref.thumb && img.isConnected !== false) {
        img.src = ref.thumb;
        img.classList.replace('thumb-placeholder', 'thumb-reference');
        img.alt = `Reference photo of ${plant.latinName}`;
      }
    }).catch(() => {});
  }
  return img;
}
