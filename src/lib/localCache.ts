/** Small, failure-tolerant IndexedDB cache for data that is safe to revalidate in the background.
 * A blocked/private browser simply behaves as though the cache were empty. */
const DB_NAME = 'momentum-local-cache'
const STORE_NAME = 'entries'
const DB_VERSION = 1

interface CacheEntry<T> { key: string; value: T }

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

export async function readLocalCache<T>(key: string): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise<T | null>((resolve) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve((request.result as CacheEntry<T> | undefined)?.value ?? null)
    request.onerror = () => resolve(null)
  }).finally(() => db.close())
}

export async function writeLocalCache<T>(key: string, value: T): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ key, value } satisfies CacheEntry<T>)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
  })
  db.close()
}

/** Used after an account reset so erased workouts cannot briefly reappear from this device. */
export async function clearLocalCache(): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear()
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
  })
  db.close()
}
