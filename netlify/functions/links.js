// Fetches the public Google Sheet CSV (Articles, Links - Farm tab) and builds
// a domain→domain link graph. Sheet must be shared as "Anyone with the link".
//
// Env (optional — defaults to the shared farming sheet):
//   GOOGLE_SHEET_ID
//   GOOGLE_SHEET_LINKS_GID

const DEFAULT_SHEET_ID = "1Yu96Qh6YclSEP3tKI_V7Ij-KjcZW3RYUXCMeqBmQG-g";
const DEFAULT_LINKS_GID = "433713429";
// Allowed sheet tabs (gid) — farm + Links-222
const ALLOWED_GIDS = new Set(["433713429", "67680598"]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch === "\r") {
      // ignore
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeDomain(raw) {
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
  d = d.replace(/^www\./, "").replace(/\/.*$/, "").replace(/,\s*$/, "").trim();
  return d || null;
}

function domainFromUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(String(raw).trim());
    return normalizeDomain(url.hostname);
  } catch {
    return normalizeDomain(raw);
  }
}

function buildGraph(rows) {
  if (!rows.length) return { nodes: [], edges: [], links: [] };

  const header = rows[0].map((h) => String(h || "").trim().toLowerCase());
  const titleIdx = header.findIndex((h) => h === "title");
  const urlIdx = header.findIndex((h) => h === "url");
  const linkToIdx = header.findIndex(
    (h) =>
      h === "link to" ||
      h === "linkto" ||
      h === "link_to" ||
      h === "target" ||
      h === "destination" ||
      h === "to"
  );
  const dateIdx = header.findIndex((h) => h === "date");
  let statusIdx = header.findIndex(
    (h) => h === "indexed" || h === "status" || h === "index status"
  );
  if (statusIdx < 0 && header.length >= 5) statusIdx = 4;

  if (urlIdx < 0 || linkToIdx < 0) {
    throw new Error(
      'Sheet must have "Url" and a link target column ("Link to", "Target", etc.). Got: ' +
        header.filter(Boolean).join(", ")
    );
  }

  const edgeMap = new Map();
  const nodeSet = new Map();
  const links = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.every((c) => !String(c || "").trim())) continue;

    const source = domainFromUrl(cols[urlIdx]);
    const target = normalizeDomain(cols[linkToIdx]);
    if (!source || !target || source === target) continue;

    const title = titleIdx >= 0 ? String(cols[titleIdx] || "").trim() : "";
    const url = String(cols[urlIdx] || "").trim();
    const date = dateIdx >= 0 ? String(cols[dateIdx] || "").trim() : "";
    const status = statusIdx >= 0 ? String(cols[statusIdx] || "").trim().toLowerCase() : "";

    links.push({ title, url, source, target, date, indexed: status === "indexed" });

    const key = source + "\t" + target;
    edgeMap.set(key, (edgeMap.get(key) || 0) + 1);

    nodeSet.set(source, (nodeSet.get(source) || 0) + 1);
    nodeSet.set(target, (nodeSet.get(target) || 0) + 1);
  }

  const nodes = Array.from(nodeSet.entries())
    .map(([id, weight]) => ({ id, weight }))
    .sort((a, b) => b.weight - a.weight);

  const edges = Array.from(edgeMap.entries())
    .map(([key, count]) => {
      const [source, target] = key.split("\t");
      return { source, target, count };
    })
    .sort((a, b) => b.count - a.count);

  return { nodes, edges, links, exchanges: findExchanges(edges) };
}

function findExchanges(edges) {
  const forward = new Map();
  edges.forEach((e) => {
    forward.set(e.source + "\t" + e.target, e.count);
  });

  const seen = new Set();
  const exchanges = [];

  edges.forEach((e) => {
    const pairKey = [e.source, e.target].sort().join("\t");
    if (seen.has(pairKey)) return;

    const back = forward.get(e.target + "\t" + e.source);
    if (!back) return;

    seen.add(pairKey);
    exchanges.push({
      a: e.source,
      b: e.target,
      aToB: e.count,
      bToA: back,
      total: e.count + back,
    });
  });

  return exchanges.sort((x, y) => y.total - x.total || x.a.localeCompare(y.a));
}

exports.handler = async (event) => {
  const cache = require("../../lib/cache");
  const sheetId = process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID;
  const params = (event && event.queryStringParameters) || {};
  const headers = (event && event.headers) || {};
  const force = cache.wantsFresh(params, headers);
  const requestedGid =
    params.gid || process.env.GOOGLE_SHEET_LINKS_GID || DEFAULT_LINKS_GID;
  const gid = ALLOWED_GIDS.has(String(requestedGid))
    ? String(requestedGid)
    : DEFAULT_LINKS_GID;
  const csvUrl =
    "https://docs.google.com/spreadsheets/d/" +
    encodeURIComponent(sheetId) +
    "/export?format=csv&gid=" +
    encodeURIComponent(gid);

  try {
    const cached = await cache.wrap(
      "links:" + sheetId + ":" + gid,
      cache.TTL.links,
      async () => {
        const res = await fetch(csvUrl, { redirect: "follow", cache: "no-store" });
        if (!res.ok) {
          const err = new Error(
            "Could not fetch Google Sheet (" +
              res.status +
              "). Is it shared as Anyone with the link?"
          );
          err.status = 502;
          throw err;
        }

        const text = await res.text();
        if (/<!DOCTYPE html>/i.test(text) || /sign in/i.test(text.slice(0, 500))) {
          const err = new Error(
            "Google Sheet is not publicly readable. Share → Anyone with the link → Viewer."
          );
          err.status = 502;
          throw err;
        }

        const graph = buildGraph(parseCsv(text));
        return {
          sheetId,
          gid,
          fetchedAt: new Date().toISOString(),
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          linkCount: graph.links.length,
          exchangeCount: graph.exchanges.length,
          ...graph,
        };
      },
      { force }
    );

    return {
      statusCode: 200,
      headers: cache.cacheHeaders(cached),
      body: JSON.stringify(cache.withCacheMeta(cached.value, cached)),
    };
  } catch (err) {
    return {
      statusCode: err.status || 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
