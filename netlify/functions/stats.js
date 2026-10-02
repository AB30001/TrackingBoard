// Proxies GoatCounter read-only stats. Tokens stay server-side.
// Site allow-list is resolved live each request (see lib/goatcounter).
// ?all=1 aggregates every site; ?site=code returns one site.
// Docs: https://www.goatcounter.com/help/api

const {
  resolveSites,
  goatFetch,
  isAllowedSiteCode,
} = require("../../lib/goatcounter");

function dayCount(stat) {
  const hourly = Array.isArray(stat.hourly) ? stat.hourly : [];
  const fromHourly = hourly.reduce((sum, n) => sum + (n || 0), 0);
  return fromHourly || stat.daily || 0;
}

function mapBreakdown(data, limit) {
  return (data.stats || [])
    .filter((s) => (s.count || 0) > 0)
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      name: s.name || s.id || "(unknown)",
      count: s.count || 0,
    }));
}

const SIZE_LABELS = {
  phone: "Phone",
  tablet: "Tablet",
  desktop: "Desktop",
  desktophd: "Desktop HD",
  unknown: "Unknown",
};

function mergeDaily(into, stats) {
  (stats || []).forEach((s) => {
    const day = s.day;
    if (!day) return;
    into[day] = (into[day] || 0) + dayCount(s);
  });
}

function jsonOk(body, cacheInfo) {
  return {
    statusCode: 200,
    headers: cacheInfo
      ? require("../../lib/cache").cacheHeaders(cacheInfo)
      : {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
    body: JSON.stringify(body),
  };
}

function jsonErr(status, error, detail) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(detail ? { error, detail } : { error }),
  };
}

async function fetchSiteBundle(site, token, qs) {
  const base = "https://" + encodeURIComponent(site) + ".goatcounter.com/api/v0";
  // Keep to 2 parallel calls (old behavior) — more and GoatCounter 429s.
  const [totalRes, hitsRes] = await Promise.all([
    goatFetch(base + "/stats/total?" + qs, token, { timeoutMs: 10000, retries: 2 }),
    goatFetch(base + "/stats/hits?" + qs + "&limit=50", token, { timeoutMs: 10000, retries: 2 }),
  ]);

  if (!totalRes.ok) {
    return { site, ok: false, status: totalRes.status, text: totalRes.text };
  }

  const refs = await goatFetch(base + "/stats/toprefs?" + qs + "&limit=8", token, {
    timeoutMs: 8000,
    retries: 1,
  });
  const locs = await goatFetch(base + "/stats/locations?" + qs + "&limit=8", token, {
    timeoutMs: 8000,
    retries: 1,
  });
  const sizes = await goatFetch(base + "/stats/sizes?" + qs + "&limit=8", token, {
    timeoutMs: 8000,
    retries: 1,
  });

  return {
    site,
    ok: true,
    total: (totalRes.data && totalRes.data.total) || 0,
    stats: (totalRes.data && totalRes.data.stats) || [],
    hits: ((hitsRes.ok && hitsRes.data && hitsRes.data.hits) || []).filter((h) => !h.event),
    referrers: mapBreakdown(refs.ok ? refs.data : { stats: [] }, 8),
    countries: mapBreakdown(locs.ok ? locs.data : { stats: [] }, 8),
    devices: mapBreakdown(sizes.ok ? sizes.data : { stats: [] }, 8).map((s) => ({
      ...s,
      name: SIZE_LABELS[s.id] || s.name,
    })),
  };
}

function buildSinglePayload(site, codes, resolved, days, start, end, bundle) {
  let daily = (bundle.stats || []).map((s) => ({
    day: s.day,
    count: dayCount(s),
  }));
  if (daily.length > days) daily = daily.slice(daily.length - days);

  return {
    scope: "site",
    site,
    sites: codes,
    sitesSource: resolved.source,
    fetchedAt: new Date().toISOString(),
    range: days,
    start: start.toISOString(),
    end: end.toISOString(),
    total: bundle.total || 0,
    daily,
    topPages: (bundle.hits || []).slice(0, 10).map((h) => ({
      path: h.path,
      title: h.title,
      count: h.count,
      site,
    })),
    pathCount: (bundle.hits || []).length,
    referrers: bundle.referrers || [],
    countries: bundle.countries || [],
    devices: bundle.devices || [],
  };
}

async function buildAllPayload(codes, resolved, days, start, end, token, qs) {
  // Lightweight aggregate: totals + daily only (1 GoatCounter call per site).
  // Full top-pages / breakdowns stay on single-site views.
  const dailyMap = {};
  let total = 0;
  const errors = [];
  let okCount = 0;
  const CONCURRENCY = 3;
  let next = 0;

  async function worker() {
    while (next < codes.length) {
      const i = next++;
      const site = codes[i];
      try {
        const base =
          "https://" + encodeURIComponent(site) + ".goatcounter.com/api/v0";
        const totalRes = await goatFetch(base + "/stats/total?" + qs, token, {
          timeoutMs: 10000,
          retries: 2,
        });
        if (!totalRes.ok) {
          errors.push({ site, status: totalRes.status });
          continue;
        }
        okCount += 1;
        total += (totalRes.data && totalRes.data.total) || 0;
        mergeDaily(dailyMap, (totalRes.data && totalRes.data.stats) || []);
      } catch (err) {
        errors.push({ site, error: err.message });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, codes.length) }, () => worker())
  );

  const daily = Object.keys(dailyMap)
    .sort()
    .map((day) => ({ day, count: dailyMap[day] }));
  const clipped = daily.length > days ? daily.slice(daily.length - days) : daily;

  return {
    scope: "all",
    site: "",
    siteCount: codes.length,
    sitesOk: okCount,
    sites: codes,
    sitesSource: resolved.source,
    fetchedAt: new Date().toISOString(),
    range: days,
    start: start.toISOString(),
    end: end.toISOString(),
    total,
    daily: clipped,
    topPages: [],
    pathCount: 0,
    referrers: [],
    countries: [],
    devices: [],
    note: "All-websites view shows totals only. Click a site for pages and breakdowns.",
    partialErrors: errors.length ? errors : undefined,
  };
}

exports.handler = async (event) => {
  const cache = require("../../lib/cache");
  const params = (event && event.queryStringParameters) || {};
  const headers = (event && event.headers) || {};
  const force = cache.wantsFresh(params, headers);

  let resolved;
  try {
    resolved = await resolveSites(process.env, { force });
  } catch (err) {
    return jsonErr(500, err.message);
  }

  const codes = resolved.codes.slice();
  const token = resolved.token;
  // Explicit all=1 only — otherwise default to the first configured site
  // (old, fast behavior). Empty/missing site no longer triggers a full fan-out.
  const wantAll = params.all === "1" || params.all === "true" || params.site === "all";

  const days = Math.max(1, Math.min(365, parseInt(params.range, 10) || 7));
  // Bucket cache by calendar hour so "last 2h" / daily charts stay coherent.
  const hourBucket = new Date().toISOString().slice(0, 13);
  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  end.setUTCSeconds(0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  const qs = "start=" + start.toISOString() + "&end=" + end.toISOString();

  try {
    if (wantAll) {
      const cacheKey = "stats:all:" + days + ":" + hourBucket + ":" + codes.join(",");
      const cached = await cache.wrap(
        cacheKey,
        cache.TTL.statsAll,
        () => buildAllPayload(codes, resolved, days, start, end, token, qs),
        { force }
      );
      return jsonOk(cache.withCacheMeta(cached.value, cached), cached);
    }

    let site = codes.includes(params.site) ? params.site : null;
    if (!site && params.site && isAllowedSiteCode(params.site)) {
      const probe = await goatFetch(
        "https://" +
          encodeURIComponent(params.site) +
          ".goatcounter.com/api/v0/stats/total?" +
          qs,
        token,
        { retries: 2 }
      );
      if (probe.ok) {
        site = params.site;
        if (!codes.includes(site)) codes.push(site);
      }
    }
    if (!site) {
      site = codes[0] || null;
    }
    if (!site) {
      return jsonErr(400, "No sites configured. Set GOATCOUNTER_SITES.");
    }

    const cacheKey = "stats:site:" + site + ":" + days + ":" + hourBucket;
    const cached = await cache.wrap(
      cacheKey,
      cache.TTL.statsSite,
      async () => {
        const bundle = await fetchSiteBundle(site, token, qs);
        if (!bundle.ok) {
          const err = new Error("GoatCounter API error (" + bundle.status + ")");
          err.status = 502;
          err.detail = bundle.text;
          throw err;
        }
        return buildSinglePayload(site, codes, resolved, days, start, end, bundle);
      },
      { force }
    );
    return jsonOk(cache.withCacheMeta(cached.value, cached), cached);
  } catch (err) {
    if (err && err.status === 502) {
      return jsonErr(502, err.message, err.detail);
    }
    return jsonErr(500, err.message);
  }
};
