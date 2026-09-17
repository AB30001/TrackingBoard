// Proxies GoatCounter's read-only stats API so the API token never reaches
// the browser. Configure GOATCOUNTER_SITES and GOATCOUNTER_TOKEN as env vars
// in the Netlify site settings (or a local .env with `netlify dev`).
//
// GOATCOUNTER_SITES is a comma-separated list of site codes (the subdomain
// before ".goatcounter.com"), e.g. "venabustallenno,iwp". The token is
// account-wide ("All sites" scope), but the request still has to name one
// site at a time, so we validate the requested site against this list
// rather than trusting an arbitrary query param.

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
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const base = `https://${site}.goatcounter.com/api/v0`;
  const headers = { Authorization: `Bearer ${token}` };
  const qs = `start=${start.toISOString()}&end=${end.toISOString()}`;

  try {
    const [totalRes, hitsRes] = await Promise.all([
      fetch(`${base}/stats/total?${qs}`, { headers }),
      fetch(`${base}/stats/hits?${qs}&limit=10`, { headers }),
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

    const daily = (totalData.stats || []).map((s) => ({ day: s.day, count: s.daily }));
    const topPages = (hitsData.hits || [])
      .filter((h) => !h.event)
      .map((h) => ({ path: h.path, title: h.title, count: h.count }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        site,
        sites,
        range: days,
        total: totalData.total || 0,
        daily,
        topPages,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
