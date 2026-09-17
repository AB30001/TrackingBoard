# TrackingBoard

A small dashboard for GoatCounter traffic stats, deployed as a static site on
Netlify. API tokens are kept server-side in Netlify Functions so they're
never exposed to the browser.

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

Copy `.env.example` to `.env` for local dev, or set these in the Netlify site
dashboard under **Site configuration -> Environment variables**:

- `GOATCOUNTER_SITES` — comma-separated GoatCounter site codes, e.g.
  `venabustallenno,iwp`. Adding a future site is adding it here (plus the
  token step above) — no code changes.
- `GOATCOUNTER_TOKEN` — the API token from step 1
- `GOATCOUNTER_SITE_DOMAINS` — maps a site code to its real domain for Ahrefs
  lookups, e.g. `venabustallenno:venabustallen.no`. A site left out (no live
  domain yet) shows as "Offline" in the Domain Rating column instead of
  attempting a lookup.
- `AHREFS_API_KEY` — the key from step 2

## 4. Run locally

```
npm install -g netlify-cli   # if you don't have it
netlify dev
```

This serves `public/` and `netlify/functions/` together at
`http://localhost:8888`, reading env vars from your local `.env`.

## 5. Deploy

Push to GitHub and connect the repo in Netlify (or run `netlify deploy
--prod`). Set the environment variables in the Netlify UI first — the
dashboard will show an error banner if they're missing.

## How it works

- `public/` — static dashboard (HTML/CSS/JS, no build step, no frontend deps)
- `netlify/functions/stats.js` — proxies one site's GoatCounter
  `/api/v0/stats/total` and `/api/v0/stats/hits` for the detail view
- `netlify/functions/overview.js` — builds the all-sites table: a 30-day
  GoatCounter total plus an Ahrefs Domain Rating lookup per site
- The frontend never talks to GoatCounter or Ahrefs directly, and never sees
  either token
