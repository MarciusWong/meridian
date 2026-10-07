# Meridian — global page speed

Test how fast a website loads from cities around the world — London, Frankfurt,
Sydney, São Paulo, Tokyo, Johannesburg, Mumbai and 30+ more — and get a
prioritised list of fixes, most critical first.

Meridian combines free and open-source tools into one report:

| Tool | What it measures | Key |
|---|---|---|
| [Globalping](https://globalping.io) (open source probe network) | Real HTTP requests from each selected city: DNS, connect, TLS, server wait, download, CDN cache status, TLS certificate, ping round-trip time. Each city is measured cold and warm from the same probe. | none (optional `GLOBALPING_TOKEN` raises the hourly limit) |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) (open source) | Full lab audit on mobile and desktop: Core Web Vitals, render-blocking resources, unused JS/CSS, images, caching, fonts, third parties… | none — runs in local headless Chrome |
| [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) + Chrome UX Report | Lighthouse run by Google, plus 28 days of real-user field data. | optional `PSI_API_KEY` (free) |
| Built-in page inspector | Redirect chain, compression (gzip/Brotli), HTTP/2 and HTTP/3, cache headers, HSTS, CDN detection, HTML structure (blocking scripts, unsized/legacy images, third-party origins, font loading). | none |
| [WebPageTest](https://www.webpagetest.org) (optional) | Real-browser page loads from WPT locations near the selected cities. | optional `WPT_API_KEY` |

The recommendation engine cross-checks every source, merges duplicates (e.g.
render-blocking scripts found by both the inspector and Lighthouse) and ranks
each fix by **severity** (critical → low), then by **estimated time saved**,
**bytes saved** and **number of locations affected**. Each fix comes with the
evidence behind it and concrete steps.

## Quick start

Requires Node.js 20.19+ and, for local Lighthouse runs, Chrome or Chromium.

```bash
npm install
cp .env.example .env      # optional: add API keys
npm run dev               # API on :8787, UI on http://localhost:5173
```

Production:

```bash
npm run build
npm start                 # serves UI + API on http://localhost:8787
```

Environment variables (all optional) are documented in [`.env.example`](.env.example).
Load them with your process manager or `node --env-file=.env`.

## How a test works

1. **Inspect** — the server fetches the page itself (following and recording redirects).
2. In parallel:
   - **Globalping** runs an HTTP request from one probe in each selected city, repeats it from the
     same probes (warm caches), and pings from them for network RTT.
   - **Lighthouse** audits mobile and desktop — via PageSpeed Insights when it is available, falling
     back to local headless Chrome.
   - **WebPageTest** (if configured) loads the page in real browsers.
3. **Analyse** — scores, per-region statistics and the ranked recommendations.

Reports are stored as JSON in `data/reports/` and have shareable URLs (`/report/<id>`).
Each report can be exported as JSON, printed, or copied as a Markdown checklist.

### Scoring

* **Global delivery (0–100)** — Lighthouse-style log-normal score of time to first byte per location
  (200 ms → 90, 600 ms → 50); failed locations count as 0.
* **Overall grade** — 45% mobile performance, 20% desktop performance, 35% global delivery
  (re-weighted when a part is unavailable). A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, E ≥ 50, else F.
* Location status uses the Web Vitals TTFB thresholds: good ≤ 800 ms, poor > 1.8 s.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/config` | Location catalogue, regions and server capabilities |
| `POST` | `/api/tests` | Start a test: `{ "url": "example.com", "locations": ["london", "sydney"], "lighthouse": true }` → `202 { id }` |
| `GET` | `/api/tests/:id` | Report (poll while `status` is `running`) |
| `GET` | `/api/tests` | Recent reports |

## Project layout

```
server/
  providers/      one module per data source (Globalping, PSI, local Lighthouse, inspector, WebPageTest)
  analysis/       pure functions: scoring, HTML/CDN analysis, Lighthouse normalisation, recommendation rules
  security/       SSRF guard — only public http(s) targets are tested
  jobs.ts         orchestration and step progress
  storage.ts      JSON report store
shared/           types and thresholds used by server and browser
src/              React UI (Vite)
tests/            Vitest unit and API tests, with recorded Globalping and Lighthouse fixtures
docs/             design notes and implementation plan
```

```bash
npm test            # unit + API tests
npm run typecheck
npm run build:dots  # regenerate the dot-matrix world map
```

## Limits worth knowing

* Globalping measures the **HTML document** from each city (DNS → download). Full page loads with
  rendering come from Lighthouse (from where the server or Google runs it) and, optionally, WebPageTest.
* Anonymous Globalping use allows 250 probe measurements per hour per IP; a default 20-city test uses 60.
  A free token raises this.
* Without `PSI_API_KEY`, Google usually rate-limits anonymous PageSpeed Insights calls, so Lighthouse
  runs locally and real-user (CrUX) data is not available.
* Private and local network addresses are refused unless `ALLOW_PRIVATE_TARGETS=true`.
