// Proxies GoatCounter's read-only stats API so the API token never reaches
// the browser. Configure GOATCOUNTER_SITES and GOATCOUNTER_TOKEN as env vars
// in the Netlify site settings (or a local .env with `netlify dev`).
//
// GOATCOUNTER_SITES is a comma-separated list of site codes (the subdomain
// before ".goatcounter.com"), e.g. "venabustallenno,iwp". The token is
// account-wide ("All sites" scope), but the request still has to name one
// site at a time, so we validate the requested site against this list
// rather than trusting an arbitrary query param.

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, headers) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      await sleep(500 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      return { ok: false, status: res.status, text: await res.text() };
    }
    return { ok: true, data: await res.json() };
  }
  return { ok: false, status: 429, text: "rate limited" };
}

exports.handler = async (event) => {
  const token = process.env.GOATCOUNTER_TOKEN;
  const sites = (process.env.GOATCOUNTER_SITES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!sites.length || !token) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Missing GOATCOUNTER_SITES or GOATCOUNTER_TOKEN environment variable.",
      }),
    };
  }

  const requestedSite = event.queryStringParameters?.site;
  const site = sites.includes(requestedSite) ? requestedSite : sites[0];

  const days = Math.max(1, Math.min(365, parseInt(event.queryStringParameters?.range, 10) || 7));
  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  end.setUTCSeconds(0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);

  const base = `https://${site}.goatcounter.com/api/v0`;
  const headers = { Authorization: `Bearer ${token}` };
  const qs = `start=${start.toISOString()}&end=${end.toISOString()}`;

  try {
    const [totalRes, hitsRes] = await Promise.all([
      fetch(`${base}/stats/total?${qs}`, { headers }),
      fetch(`${base}/stats/hits?${qs}&limit=100`, { headers }),
    ]);

    if (!totalRes.ok || !hitsRes.ok) {
      const badRes = !totalRes.ok ? totalRes : hitsRes;
      const detail = await badRes.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `GoatCounter API error (${badRes.status})`, detail }),
      };
    }

    const totalData = await totalRes.json();
    const hitsData = await hitsRes.json();

    // Stagger optional breakdowns to stay under GoatCounter's 4 req/s limit.
    const refs = await fetchJson(`${base}/stats/toprefs?${qs}&limit=8`, headers);
    const locs = await fetchJson(`${base}/stats/locations?${qs}&limit=8`, headers);
    const sizes = await fetchJson(`${base}/stats/sizes?${qs}&limit=8`, headers);

    let daily = (totalData.stats || []).map((s) => ({
      day: s.day,
      count: dayCount(s),
    }));
    if (daily.length > days) daily = daily.slice(daily.length - days);

    const allPages = (hitsData.hits || []).filter((h) => !h.event);
    const topPages = allPages
      .slice(0, 10)
      .map((h) => ({ path: h.path, title: h.title, count: h.count }));

    const sizeLabels = {
      phone: "Phone",
      tablet: "Tablet",
      desktop: "Desktop",
      desktophd: "Desktop HD",
      unknown: "Unknown",
    };
    const devices = mapBreakdown(sizes.ok ? sizes.data : { stats: [] }, 8).map((s) => ({
      ...s,
      name: sizeLabels[s.id] || s.name,
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        site,
        sites,
        range: days,
        start: start.toISOString(),
        end: end.toISOString(),
        total: totalData.total || 0,
        daily,
        topPages,
        pathCount: allPages.length + (hitsData.more ? 1 : 0),
        referrers: mapBreakdown(refs.ok ? refs.data : { stats: [] }, 8),
        countries: mapBreakdown(locs.ok ? locs.data : { stats: [] }, 8),
        devices,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
