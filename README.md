# TrackingBoard

A small dashboard for GoatCounter traffic stats, deployed as a static site on
Netlify. The API token is kept server-side in a Netlify Function so it's never
exposed to the browser.

Currently shows: total pageviews, average per day, a daily trend line, and top
pages for the selected range (7/30/90 days). Built to be extended later with
other metrics (published posts, domain rating, etc.) as separate cards.

## 1. Get a GoatCounter API token

1. Sign in at `https://<yoursite>.goatcounter.com/`
2. Go to **Settings** -> **API**
3. Click **New**, give it a label (e.g. "TrackingBoard"), and grant it
   read-only stats access (you don't need the "count" write permission)
4. Copy the token shown — it's only displayed once

## 2. Configure environment variables

Copy `.env.example` to `.env` for local dev, or set these in the Netlify site
dashboard under **Site configuration -> Environment variables**:

- `GOATCOUNTER_SITES` — comma-separated GoatCounter subdomains, e.g.
  `venabustallenno,iwp`. The dashboard shows a site picker built from this
  list, so adding a future site is just adding it here — no code changes.
- `GOATCOUNTER_TOKEN` — the API token from step 1 (created with "All sites"
  access, so it covers every site in this list)

## 3. Run locally

```
npm install -g netlify-cli   # if you don't have it
netlify dev
```

This serves `public/` and `netlify/functions/stats.js` together at
`http://localhost:8888`, reading env vars from your local `.env`.

## 4. Deploy

Push to GitHub and connect the repo in Netlify (or run `netlify deploy
--prod`). Set the two environment variables in the Netlify UI first — the
site will show an error banner if they're missing.

## How it works

- `public/` — static dashboard (HTML/CSS/JS, no build step, no frontend deps)
- `netlify/functions/stats.js` — serverless proxy that calls GoatCounter's
  `/api/v0/stats/total` and `/api/v0/stats/hits` endpoints with the bearer
  token, and returns a small JSON summary to the frontend
- The frontend never talks to GoatCounter directly or sees the token
