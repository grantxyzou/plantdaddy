// Promise-based IndexedDB wrapper. Stores: plants, logs, photos, settings.

const DB_NAME = 'plantdaddy';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('plants')) {
        db.createObjectStore('plants', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('logs')) {
        const logs = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        logs.createIndex('byPlant', 'plantId');
        logs.createIndex('byTs', 'ts');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        photos.createIndex('byPlant', 'plantId');
        photos.createIndex('byTs', 'ts');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function put(store, value) {
  const db = await openDB();
  return tx(db, store, 'readwrite', s => s.put(value));
}

export async function get(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store, indexName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s = db.transaction(store).objectStore(store);
    const source = indexName ? s.index(indexName) : s;
    const req = key !== undefined ? source.getAll(key) : source.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function del(store, key) {
  const db = await openDB();
  return tx(db, store, 'readwrite', s => s.delete(key));
}

export async function clear(store) {
  const db = await openDB();
  return tx(db, store, 'readwrite', s => s.clear());
}
