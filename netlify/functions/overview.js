// Multi-site summary used by the dashboard's default table view: one row per
// GoatCounter site with a 30-day pageview total plus an Ahrefs Domain Rating
// lookup. Both API tokens stay server-side.
//
// GOATCOUNTER_SITE_DOMAINS maps a GoatCounter site code to its real domain,
// e.g. "venabustallenno:venabustallen.no,iwp:example.com". A site left out
// of this map (no live domain yet) is reported as offline instead of
// attempting an Ahrefs lookup.

const OVERVIEW_DAYS = 30;

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

async function fetchPageviews(site, token, start, end) {
  const url = `https://${site}.goatcounter.com/api/v0/stats/total?start=${start.toISOString()}&end=${end.toISOString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GoatCounter ${site} (${res.status})`);
  const data = await res.json();
  return data.total || 0;
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
  const start = new Date(end.getTime() - OVERVIEW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await Promise.all(
    sites.map(async (site) => {
      const domain = domainMap[site] || null;

      let total = null;
      let totalError = null;
      try {
        total = await fetchPageviews(site, token, start, end);
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
        totalError,
        dr,
        drError,
      };
    })
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ range: OVERVIEW_DAYS, rows }),
  };
};
