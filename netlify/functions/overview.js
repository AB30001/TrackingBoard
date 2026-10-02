// Multi-site summary for the websites table.
//
// Modes:
//   (default)     Progressive-friendly: returns the configured site list
//                 immediately (no GoatCounter fan-out). Metrics are null.
//   ?site=code    Fetch pageviews (+ optional DR) for one site only.
//   ?full=1       Legacy: fetch every site sequentially (slow; avoid on boot).
//   ?dr=1         With ?site= or ?full=1, also fetch Ahrefs Domain Rating.

const { resolveSites, goatFetch } = require("../../lib/goatcounter");

const OVERVIEW_DAYS = 30;

function sumLastTwoHours(stats, end) {
  const hour = end.getUTCHours();
  const today = end.toISOString().slice(0, 10);
  const prev = new Date(end.getTime() - 60 * 60 * 1000);
  const prevDay = prev.toISOString().slice(0, 10);
  const prevHour = prev.getUTCHours();

  const byDay = {};
  (stats || []).forEach((s) => {
    byDay[s.day] = s;
  });

  let sum = 0;
  const cur = byDay[today];
  if (cur && Array.isArray(cur.hourly)) sum += cur.hourly[hour] || 0;
  const earlier = byDay[prevDay];
  if (earlier && Array.isArray(earlier.hourly)) sum += earlier.hourly[prevHour] || 0;
  return sum;
}

function lastNDayCounts(stats, n) {
  const daily = (stats || []).map((s) => {
    const hourly = Array.isArray(s.hourly) ? s.hourly : [];
    const fromHourly = hourly.reduce((sum, v) => sum + (v || 0), 0);
    return fromHourly || s.daily || 0;
  });
  if (daily.length >= n) return daily.slice(daily.length - n);
  while (daily.length < n) daily.unshift(0);
  return daily;
}

function rangeWindow() {
  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  end.setUTCSeconds(0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (OVERVIEW_DAYS - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

async function fetchPageviews(site, token, start, end) {
  const url =
    "https://" +
    encodeURIComponent(site) +
    ".goatcounter.com/api/v0/stats/total?start=" +
    start.toISOString() +
    "&end=" +
    end.toISOString();
  const res = await goatFetch(url, token, { timeoutMs: 10000, retries: 2 });
  if (!res.ok) throw new Error("GoatCounter " + site + " (" + res.status + ")");
  const data = res.data || {};
  return {
    total: data.total || 0,
    recent2h: sumLastTwoHours(data.stats, end),
    spark: lastNDayCounts(data.stats, 7),
  };
}

async function fetchDomainRating(domain, ahrefsKey) {
  const url =
    "https://api.ahrefs.com/v3/public/domain-rating-free?target=" +
    encodeURIComponent(domain) +
    "&output=json";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + ahrefsKey, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("Ahrefs " + domain + " (" + res.status + ")");
    const data = await res.json();
    return data.domain_rating ? data.domain_rating.domain_rating : null;
  } finally {
    clearTimeout(timer);
  }
}

function emptyRow(meta) {
  return {
    site: meta.code,
    domain: meta.domain,
    offline: !meta.domain,
    total: null,
    recent2h: null,
    spark: null,
    totalError: null,
    dr: null,
    drError: null,
    pending: true,
  };
}

async function enrichRow(meta, token, start, end, ahrefsKey, wantDr) {
  const row = emptyRow(meta);
  row.pending = false;
  try {
    const pv = await fetchPageviews(meta.code, token, start, end);
    row.total = pv.total;
    row.recent2h = pv.recent2h;
    row.spark = pv.spark;
  } catch (err) {
    row.totalError = err.message;
  }
  if (wantDr && ahrefsKey && meta.domain) {
    try {
      row.dr = await fetchDomainRating(meta.domain, ahrefsKey);
    } catch (err) {
      row.drError = err.message;
    }
  }
  return row;
}

function jsonOk(body, cacheInfo) {
  const cache = require("../../lib/cache");
  return {
    statusCode: 200,
    headers: cacheInfo ? cache.cacheHeaders(cacheInfo) : {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(cacheInfo ? cache.withCacheMeta(body, cacheInfo) : body),
  };
}

function jsonErr(status, message) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ error: message }),
  };
}

exports.handler = async (event) => {
  const cache = require("../../lib/cache");
  const params = (event && event.queryStringParameters) || {};
  const headers = (event && event.headers) || {};
  const force = cache.wantsFresh(params, headers);
  const wantDr = params.dr === "1" || params.dr === "true";
  const wantFull = params.full === "1" || params.full === "true";
  const oneSite = (params.site || "").trim();
  const ahrefsKey = process.env.AHREFS_API_KEY;
  const hourBucket = new Date().toISOString().slice(0, 13);

  let resolved;
  try {
    resolved = await resolveSites(process.env, { force: force && !oneSite });
  } catch (err) {
    return jsonErr(500, err.message);
  }

  const { start, end } = rangeWindow();

  // Fast path: site list only (what the board boots with).
  if (!oneSite && !wantFull) {
    const rows = resolved.sites.map(emptyRow);
    return jsonOk({
      range: OVERVIEW_DAYS,
      siteCount: rows.length,
      sitesSource: resolved.source,
      listOnly: true,
      withDr: false,
      fetchedAt: new Date().toISOString(),
      rows,
    });
  }

  // One site metrics — used to fill the table progressively.
  if (oneSite) {
    const meta = resolved.sites.find((s) => s.code === oneSite);
    if (!meta) return jsonErr(400, "Unknown site: " + oneSite);

    const cacheKey =
      "overview:site:" + oneSite + ":" + hourBucket + (wantDr ? ":dr" : "");
    try {
      const cached = await cache.wrap(
        cacheKey,
        cache.TTL.overview,
        () => enrichRow(meta, resolved.token, start, end, ahrefsKey, wantDr),
        { force }
      );
      return jsonOk(
        {
          range: OVERVIEW_DAYS,
          site: oneSite,
          withDr: wantDr,
          fetchedAt: new Date().toISOString(),
          row: cached.value,
        },
        cached
      );
    } catch (err) {
      return jsonErr(err.status === 429 ? 429 : 500, err.message);
    }
  }

  // Full fan-out (Refresh / explicit). Sequential to respect rate limits.
  try {
    const cached = await cache.wrap(
      "overview:full:" + hourBucket + (wantDr ? ":dr" : ""),
      cache.TTL.overview,
      async () => {
        const rows = [];
        for (const meta of resolved.sites) {
          rows.push(await enrichRow(meta, resolved.token, start, end, ahrefsKey, wantDr));
          await new Promise((r) => setTimeout(r, 280));
        }
        const okCount = rows.filter((r) => r.total !== null).length;
        if (okCount === 0) {
          const err = new Error(
            "GoatCounter rate limited or unreachable. Wait a minute and retry."
          );
          err.status = 429;
          throw err;
        }
        return {
          range: OVERVIEW_DAYS,
          siteCount: rows.length,
          sitesOk: okCount,
          sitesSource: resolved.source,
          listOnly: false,
          withDr: wantDr,
          fetchedAt: new Date().toISOString(),
          rows,
        };
      },
      { force }
    );
    return jsonOk(cached.value, cached);
  } catch (err) {
    return jsonErr(err.status === 429 ? 429 : 500, err.message);
  }
};
