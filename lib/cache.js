// Simple in-memory TTL cache with in-flight dedupe.
// Works well on Render/local long-lived Node; Netlify cold starts start empty.

const store = new Map();
const inflight = new Map();

function ttlFromEnv(name, fallbackMs) {
  const raw = process.env[name];
  if (!raw) return fallbackMs;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallbackMs;
}

// Tunable via env (milliseconds).
const TTL = {
  sites: ttlFromEnv("CACHE_TTL_SITES_MS", 10 * 60 * 1000),
  overview: ttlFromEnv("CACHE_TTL_OVERVIEW_MS", 3 * 60 * 1000),
  statsAll: ttlFromEnv("CACHE_TTL_STATS_ALL_MS", 3 * 60 * 1000),
  statsSite: ttlFromEnv("CACHE_TTL_STATS_SITE_MS", 90 * 1000),
  links: ttlFromEnv("CACHE_TTL_LINKS_MS", 2 * 60 * 1000),
};

function wantsFresh(params, headers) {
  const p = params || {};
  if (p.fresh === "1" || p.fresh === "true" || p.nocache === "1") return true;
  const cc = String((headers && (headers["cache-control"] || headers["Cache-Control"])) || "");
  if (/\bno-cache\b/i.test(cc) || /\bno-store\b/i.test(cc)) return true;
  return false;
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry;
}

function set(key, value, ttlMs) {
  store.set(key, {
    value,
    cachedAt: new Date().toISOString(),
    expiresAt: Date.now() + Math.max(0, ttlMs),
  });
}

function del(key) {
  store.delete(key);
  inflight.delete(key);
}

function clear(prefix) {
  for (const key of Array.from(store.keys())) {
    if (!prefix || key.startsWith(prefix)) store.delete(key);
  }
  for (const key of Array.from(inflight.keys())) {
    if (!prefix || key.startsWith(prefix)) inflight.delete(key);
  }
}

/**
 * Run fn unless a fresh cached value exists. Concurrent callers share one fetch.
 * Returns { value, cache: 'HIT'|'MISS'|'SHARED', cachedAt }.
 */
async function wrap(key, ttlMs, fn, { force = false } = {}) {
  if (force) {
    del(key);
  } else {
    const hit = get(key);
    if (hit) {
      return { value: hit.value, cache: "HIT", cachedAt: hit.cachedAt };
    }
    if (inflight.has(key)) {
      const value = await inflight.get(key);
      const again = get(key);
      return {
        value,
        cache: "SHARED",
        cachedAt: again ? again.cachedAt : new Date().toISOString(),
      };
    }
  }

  const pending = Promise.resolve()
    .then(fn)
    .then((value) => {
      set(key, value, ttlMs);
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, pending);
  const value = await pending;
  const entry = get(key);
  return {
    value,
    cache: "MISS",
    cachedAt: entry ? entry.cachedAt : new Date().toISOString(),
  };
}

function withCacheMeta(payload, cacheInfo) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return {
    ...payload,
    cache: cacheInfo.cache,
    cachedAt: cacheInfo.cachedAt,
  };
}

function cacheHeaders(cacheInfo) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Cache": cacheInfo.cache || "MISS",
    "X-Cache-At": cacheInfo.cachedAt || "",
  };
}

module.exports = {
  TTL,
  wantsFresh,
  get,
  set,
  del,
  clear,
  wrap,
  withCacheMeta,
  cacheHeaders,
};
