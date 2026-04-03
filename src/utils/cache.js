// localStorageキャッシュユーティリティ
// Firestoreへのアクセスを最小化し、起動を高速化する

const PREFIX = 'copel_cache_'
const TTL_MS = 24 * 60 * 60 * 1000  // 24時間

export function cacheSet(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() }))
  } catch (_) {}
}

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > TTL_MS) return null  // 24時間で失効
    return data
  } catch (_) { return null }
}

export function cacheClear(key) {
  try { localStorage.removeItem(PREFIX + key) } catch (_) {}
}
