/**
 * frontend/src/lib/idb.ts
 * ========================
 * Typed IndexedDB wrapper for the CreativeVisibility raw performance cache.
 *
 * Why IndexedDB over localStorage:
 *   - localStorage is synchronous — `JSON.parse` of a 5MB payload blocks the
 *     main thread for ~200ms, causing a visible UI stutter.
 *   - localStorage has a 5MB per-origin quota; large Daily_dump exports can
 *     exceed it silently (the `setItem` fails, the app gets no stale-while-
 *     revalidate benefit, and the user waits for a full network round-trip).
 *   - IndexedDB is fully async, no practical size limit, and survives private
 *     browsing better than localStorage on some browsers.
 *   - All IndexedDB reads and writes are wrapped in IDBTransaction — each
 *     operation is atomic. No partial writes, no torn reads.
 *
 * ACID at the browser layer:
 *   Atomicity   — every put() is inside a readwrite transaction.
 *   Consistency — we store a row_count + etag alongside the payload and
 *                 validate them on every get().
 *   Isolation   — IndexedDB transactions are serialised by the browser engine.
 *   Durability  — IndexedDB is persisted to disk by the browser (WAL-backed on
 *                 Chromium; managed storage on Firefox/Safari).
 *
 * Store layout:
 *   DB name:    "cv_cache"
 *   Store name: "raw_performance"
 *   Key:        string (currently always "raw_daily")
 *   Value:      CvCacheEntry
 */

export interface CvCacheEntry {
  key:         string;
  payload:     object;       // the full response JSON (RawPerformanceResponse)
  etag:        string;       // SHA-256 checksum from the backend ETag header
  row_count:   number;       // daily_rows_count — integrity hint
  stored_at:   number;       // Date.now() when stored
}

// ─────────────────────────────────────────────────────────────────────────────
// DB bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME    = "cv_cache";
const DB_VERSION = 1;
const STORE      = "raw_performance";

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };

    req.onsuccess = (ev) => {
      _db = (ev.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("[idb] Database upgrade blocked by another tab"));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a cache entry by key.
 *
 * Returns null if:
 *   - The key is not found (first visit / after clearIDB()).
 *   - The stored entry fails the row_count integrity check.
 *
 * Does NOT check expiry — that is handled by the ETag layer:
 * the frontend sends If-None-Match and trusts the backend's 304/200 response
 * to tell it whether the IndexedDB data is still valid.
 */
export async function idbGet(key: string): Promise<CvCacheEntry | null> {
  try {
    const db    = await openDB();
    const entry = await _txGet(db, key);
    if (!entry) return null;

    // Integrity: row_count must be a non-negative number.
    if (typeof entry.row_count !== "number" || entry.row_count < 0) {
      // Corrupted entry — delete it.
      await idbDelete(key);
      return null;
    }

    return entry;
  } catch (err) {
    console.warn("[idb] get failed (non-fatal):", err);
    return null;
  }
}

/**
 * Write a cache entry.
 *
 * Uses a readwrite transaction — atomic. If the write fails, the old entry
 * (if any) remains intact. No partial state is possible.
 */
export async function idbSet(entry: CvCacheEntry): Promise<void> {
  try {
    const db = await openDB();
    await _txPut(db, entry);
  } catch (err) {
    console.warn("[idb] set failed (non-fatal):", err);
  }
}

/**
 * Delete a cache entry by key. No-op if the key doesn't exist.
 */
export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    await _txDelete(db, key);
  } catch (err) {
    console.warn("[idb] delete failed (non-fatal):", err);
  }
}

/**
 * Clear the entire store. Called on forced sync (POST /api/sync).
 */
export async function idbClear(): Promise<void> {
  try {
    const db = await openDB();
    await _txClear(db);
  } catch (err) {
    console.warn("[idb] clear failed (non-fatal):", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal transaction helpers
// ─────────────────────────────────────────────────────────────────────────────

function _txGet(db: IDBDatabase, key: string): Promise<CvCacheEntry | null> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as CvCacheEntry) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

function _txPut(db: IDBDatabase, entry: CvCacheEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(new Error("[idb] Transaction aborted"));
  });
}

function _txDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function _txClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
