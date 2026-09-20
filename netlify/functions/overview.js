// Multi-site summary used by the dashboard's default table view: one row per
// GoatCounter site with a 30-day pageview total plus an Ahrefs Domain Rating
// lookup. Both API tokens stay server-side.
//
// GOATCOUNTER_SITE_DOMAINS maps a GoatCounter site code to its real domain,
// e.g. "venabustallenno:venabustallen.no,iwp:example.com". A site left out
// of this map (no live domain yet) is reported as offline instead of
// attempting an Ahrefs lookup.

const OVERVIEW_DAYS = 30;
// GoatCounter allows 4 req/s. Stay sequential so 20 sites don't trip 429s.
const FETCH_CONCURRENCY = 1;

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

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageviews(site, token, start, end) {
  const url = `https://${site}.goatcounter.com/api/v0/stats/total?start=${start.toISOString()}&end=${end.toISOString()}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`GoatCounter ${site} (${res.status})`);
    const data = await res.json();
    return {
      total: data.total || 0,
      recent2h: sumLastTwoHours(data.stats, end),
      spark: lastNDayCounts(data.stats, 7),
    };
  }
  throw new Error(`GoatCounter ${site} (429)`);
}

// GoatCounter only has hourly buckets — "Last 2h" = current UTC hour + previous hour.
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

async function fetchDomainRating(domain, ahrefsKey) {
  // The free public endpoint (no Site Explorer subscription required) —
  // not /v3/site-explorer/domain-rating, which 401s without a paid plan.
  const url = `https://api.ahrefs.com/v3/public/domain-rating-free?target=${encodeURIComponent(domain)}&output=json`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${ahrefsKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Ahrefs ${domain} (${res.status})`);
  const data = await res.json();
  return data.domain_rating ? data.domain_rating.domain_rating : null;
}

exports.handler = async () => {
  const token = process.env.GOATCOUNTER_TOKEN;
  const ahrefsKey = process.env.AHREFS_API_KEY;
  const sites = (process.env.GOATCOUNTER_SITES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const domainMap = parseDomainMap(process.env.GOATCOUNTER_SITE_DOMAINS);

  if (!sites.length || !token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing GOATCOUNTER_SITES or GOATCOUNTER_TOKEN environment variable." }),
    };
  }

  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  end.setUTCSeconds(0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (OVERVIEW_DAYS - 1));
  start.setUTCHours(0, 0, 0, 0);

  const rows = await mapPool(sites, FETCH_CONCURRENCY, async (site) => {
    const domain = domainMap[site] || null;

    let total = null;
    let recent2h = null;
    let spark = null;
    let totalError = null;
    try {
      const pv = await fetchPageviews(site, token, start, end);
      total = pv.total;
      recent2h = pv.recent2h;
      spark = pv.spark;
    } catch (err) {
      totalError = err.message;
    }

    let dr = null;
    let drError = null;
    if (domain && ahrefsKey) {
      try {
        dr = await fetchDomainRating(domain, ahrefsKey);
      } catch (err) {
        drError = err.message;
      }
    }

    return {
      site,
      domain,
      offline: !domain,
      total,
      recent2h,
      spark,
      totalError,
      dr,
      drError,
    };
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ range: OVERVIEW_DAYS, rows }),
  };
};
