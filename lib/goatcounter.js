// Shared GoatCounter helpers — follow https://www.goatcounter.com/help/api
// Auth: Authorization: Bearer <token> + Content-Type: application/json
// Rate limit: 4 req/s (honor X-Rate-Limit-* when present)

function authHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSiteList(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDomainMap(raw) {
  const map = {};
  (raw || "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [code, domain] = pair.split(":").map((s) => s.trim());
      if (code && domain) map[code] = domain;
    });
  return map;
}

// Site codes are the domain with the dot removed (tryggehandelno ->
// tryggehandel.no). Longest suffix first so ".com" wins over ".om" etc.
const KNOWN_TLDS = [
  "com", "net", "org", "no", "de", "lt", "is", "eu", "it", "se", "dk",
  "fi", "uk", "nl", "fr", "es", "pl", "lv", "ee", "io", "co",
].sort((a, b) => b.length - a.length);

function domainFromCode(code) {
  const c = String(code || "").toLowerCase();
  for (const tld of KNOWN_TLDS) {
    if (c.length > tld.length + 1 && c.endsWith(tld)) {
      return c.slice(0, -tld.length) + "." + tld;
    }
  }
  return null;
}

function normalizeLinkDomain(raw) {
  if (!raw) return null;
  let d = String(raw).trim().toLowerCase();
  if (!d) return null;
  try {
    if (d.includes("://") || d.startsWith("www.")) {
      const url = d.includes("://") ? new URL(d) : new URL("https://" + d);
      d = url.hostname;
    }
  } catch {
    // keep raw
  }
  d = d.replace(/^www\./, "").replace(/\/.*$/, "").trim();
  return d || null;
}

async function goatFetch(url, token, { retries = 2, timeoutMs = 12000 } = {}) {
  const headers = authHeaders(token);

  async function once() {
    const fetchPromise = fetch(url, { headers, cache: "no-store" });
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(function () {
        reject(new Error("GoatCounter timeout after " + timeoutMs + "ms"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    let res;
    try {
      res = await once();
    } catch (err) {
      if (attempt < retries - 1) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      return {
        ok: false,
        status: 504,
        data: null,
        text: err.message || "fetch failed",
        headers: null,
      };
    }
    if (res.status === 429) {
      const reset = parseInt(res.headers.get("X-Rate-Limit-Reset") || "1", 10);
      // Cap wait hard — parallel overview workers must not stack long sleeps.
      await sleep(Math.min(1200, Math.max(250, (reset || 1) * 1000)));
      if (attempt >= retries - 1) {
        return {
          ok: false,
          status: 429,
          data: null,
          text: "rate limited",
          headers: res.headers,
        };
      }
      continue;
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, text, headers: res.headers };
  }
  return { ok: false, status: 429, data: null, text: "rate limited", headers: null };
}

/**
 * GET /api/v0/sites on a host returns that site + its children.
 * For a full account list, call this on the parent account code
 * (GOATCOUNTER_ACCOUNT). Children alone only return themselves.
 */
async function fetchSitesFromHost(code, token) {
  const res = await goatFetch(
    "https://" + encodeURIComponent(code) + ".goatcounter.com/api/v0/sites",
    token
  );
  if (!res.ok || !res.data || !Array.isArray(res.data.sites)) {
    throw new Error(
      "GoatCounter /sites failed for " + code + " (" + res.status + ")"
    );
  }
  return res.data.sites
    .map((s) => ({
      code: s.code,
      id: s.id,
      parent: s.parent,
      linkDomain: normalizeLinkDomain(s.link_domain),
      cname: s.cname || null,
    }))
    .filter((s) => s.code);
}

/**
 * Resolve the full site list for this account.
 * Prefer GOATCOUNTER_ACCOUNT (parent) so /api/v0/sites returns every child.
 * Fall back to GOATCOUNTER_SITES env list. Cached briefly (see lib/cache).
 */
async function resolveSites(env = process.env, { force = false } = {}) {
  const cache = require("./cache");
  const token = env.GOATCOUNTER_TOKEN;
  if (!token) {
    throw new Error("Missing GOATCOUNTER_TOKEN environment variable.");
  }

  const account = (env.GOATCOUNTER_ACCOUNT || "").trim();
  const envCodes = parseSiteList(env.GOATCOUNTER_SITES);
  const cacheKey =
    "sites:" +
    [account || "-", envCodes.join(",") || "-", (env.GOATCOUNTER_SITE_DOMAINS || "").length].join("|");

  const { value } = await cache.wrap(
    cacheKey,
    cache.TTL.sites,
    async () => resolveSitesUncached(env, token, account, envCodes),
    { force }
  );
  return value;
}

async function resolveSitesUncached(env, token, account, envCodes) {
  const domainMap = parseDomainMap(env.GOATCOUNTER_SITE_DOMAINS);
  const bootstrap =
    account ||
    envCodes[0] ||
    (env.GOATCOUNTER_BOOTSTRAP_SITE || "").trim();

  let fromApi = [];
  let source = "env";

  // Prefer the explicit env list — no discovery round-trip. Only hit
  // /api/v0/sites when GOATCOUNTER_ACCOUNT is set, or when no sites are listed.
  if (account) {
    fromApi = await fetchSitesFromHost(account, token);
    source = "account";
  } else if (!envCodes.length && bootstrap) {
    try {
      fromApi = await fetchSitesFromHost(bootstrap, token);
      if (fromApi.length > 1) source = "api";
      else fromApi = [];
    } catch {
      fromApi = [];
    }
  }

  const byCode = new Map();
  function add(code, meta) {
    if (!code || byCode.has(code)) return;
    const domain =
      domainMap[code] || (meta && meta.linkDomain) || domainFromCode(code);
    byCode.set(code, {
      code,
      domain,
      offline: !domain,
      id: meta && meta.id,
      parent: meta && meta.parent,
    });
  }

  if (source === "account" || source === "api") {
    fromApi.forEach((s) => add(s.code, s));
    envCodes.forEach((c) => add(c, null));
  } else {
    envCodes.forEach((c) => add(c, null));
    if (!byCode.size && bootstrap) add(bootstrap, null);
  }

  const sites = Array.from(byCode.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  if (!sites.length) {
    throw new Error(
      "No GoatCounter sites found. Set GOATCOUNTER_ACCOUNT (parent site code) or GOATCOUNTER_SITES."
    );
  }

  return {
    token,
    sites,
    codes: sites.map((s) => s.code),
    source,
    fetchedAt: new Date().toISOString(),
  };
}

function isAllowedSiteCode(code) {
  return typeof code === "string" && /^[a-z0-9][a-z0-9-]{0,62}$/i.test(code);
}

module.exports = {
  authHeaders,
  sleep,
  goatFetch,
  parseSiteList,
  parseDomainMap,
  domainFromCode,
  resolveSites,
  fetchSitesFromHost,
  isAllowedSiteCode,
};
