// Photo intake: read a File (camera or upload), downscale to ≤1200px on the
// long edge, re-encode as JPEG so full-res camera shots don't eat storage.

const MAX_EDGE = 1200;
const QUALITY = 0.82;

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Image encoding failed')),
        'image/jpeg',
        QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

const objectURLs = new Set();

export function blobURL(blob) {
  const url = URL.createObjectURL(blob);
  objectURLs.add(url);
  return url;
}

export function releaseBlobURLs() {
  for (const url of objectURLs) URL.revokeObjectURL(url);
  objectURLs.clear();
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL);
  return res.blob();
}
