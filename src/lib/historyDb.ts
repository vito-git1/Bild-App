import type { HistoryEntry } from '../types';

const DB_NAME = 'kleiderstudio';
const DB_VERSION = 1;
const STORE = 'generations';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Der Verlauf konnte nicht geöffnet werden.'));
    request.onblocked = () => reject(new Error('Der Verlauf ist in einem anderen Tab blockiert.'));
  });

  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Speichern im Verlauf abgebrochen.'));
  });
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  await withStore('readwrite', (store) => store.put(entry));
}

export async function listHistoryEntries(): Promise<HistoryEntry[]> {
  const entries = await withStore<HistoryEntry[]>('readonly', (store) => store.getAll());
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}
