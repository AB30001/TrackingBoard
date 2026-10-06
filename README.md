# TrackingBoard

A small dashboard for GoatCounter traffic stats. Runs as a Node/Express web
service on Render (also still compatible with Netlify Functions). API tokens
stay server-side so they're never exposed to the browser.

Default view is a table of every tracked site (monthly pageviews + Ahrefs
Domain Rating). Clicking a row drills into that site's daily trend chart and
top pages for a selectable range (7/30/90 days). Built to be extended later
with more metrics (published posts, etc.) as separate cards.

## 1. Get a GoatCounter API token

1. Sign in at `https://<yoursite>.goatcounter.com/`
2. Click your account email (top right) -> **API** tab
3. Click **New**, give it a label (e.g. "TrackingBoard"), tick only
   **Read statistics**, and select which sites it covers
4. Copy the token shown — it's only displayed once

Note: a token's site access is fixed at creation/edit time — adding a new
GoatCounter site later means editing (or regenerating) this token to include
it, not just adding it to `GOATCOUNTER_SITES` below.

## 2. Get an Ahrefs API key

From your Ahrefs account's API settings. Used for the Domain Rating column.

## 3. Configure environment variables

Copy `.env.example` to `.env` for local / Render. Required keys:

- `GOATCOUNTER_SITES` — comma-separated GoatCounter site codes, e.g.
  `venabustallenno,iwp`. Adding a future site is adding it here (plus the
  token step above) — no code changes.
- `GOATCOUNTER_TOKEN` — the API token from step 1
- `GOATCOUNTER_SITE_DOMAINS` — maps a site code to its real domain for Ahrefs
  lookups, e.g. `venabustallenno:venabustallen.no`. Optional: a code ending in
  a known TLD is inferred (`tryggehandelno` → `tryggehandel.no`). Anything else (no live
  domain yet) shows as "Offline" in the Domain Rating column instead of
  attempting a lookup.
- `AHREFS_API_KEY` — the key from step 2
- `GOOGLE_SHEET_ID` / `GOOGLE_SHEET_LINKS_GID` — public sheet for the Link web

## 4. Run locally

```
npm install
npm start
```

Serves `public/` and the API handlers at `http://localhost:3000` (or `$PORT`),
reading env vars from `.env`.

Netlify local still works if you prefer: `netlify dev` → `http://localhost:8888`.

## 5. Deploy on Render

```
winget install render.cli   # once
render login
render services create \
  --name trackingboard \
  --type web_service \
  --repo https://github.com/AB30001/TrackingBoard.git \
  --branch master \
  --runtime node \
  --build-command "npm install" \
  --start-command "npm start" \
  --plan free
```

Set the env vars above on the service (Dashboard or `--env-var KEY=VALUE`),
then `render deploys create <service-id> --wait --confirm`.

`render.yaml` is included for Blueprint deploys.

## How it works

- `server.js` — Express app for Render: static `public/` + API routes
- `public/` — static dashboard (HTML/CSS/JS, no build step, no frontend deps)
- `netlify/functions/stats.js` — proxies one site's GoatCounter
  `/api/v0/stats/total` and `/api/v0/stats/hits` for the detail view
- `netlify/functions/overview.js` — builds the all-sites table: a 30-day
  GoatCounter total plus an Ahrefs Domain Rating lookup per site
- `netlify/functions/links.js` — Google Sheet → link web graph
- The frontend never talks to GoatCounter or Ahrefs directly, and never sees
  either token
