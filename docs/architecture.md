# Meridian — architecture

## Goal

Enter a URL, get a full speed and performance audit of that site as seen from
around the world, plus a prioritised list of fixes ordered by criticality.

## Data sources (all free and/or open source)

| Source                                                              | What it gives us                                                                                                                                                                                                     | Key needed?                                                                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Globalping** (jsDelivr, open source probe network, 5,000+ probes) | Real HTTP requests from each city: DNS, TCP, TLS, time to first byte, download, total time, status code, response headers (CDN cache status), TLS certificate. Ping RTT from the same cities.                        | No. Optional `GLOBALPING_TOKEN` raises the hourly limit.                                             |
| **Google PageSpeed Insights API**                                   | Lighthouse lab audit (mobile + desktop) run by Google, plus Chrome UX Report (CrUX) field data from real users.                                                                                                      | Optional `PSI_API_KEY`. Without a key Google often returns 429, so we fall back to local Lighthouse. |
| **Lighthouse** (open source, run locally in headless Chromium)      | Full lab audit when PSI is not available.                                                                                                                                                                            | No.                                                                                                  |
| **Built-in page inspector**                                         | Direct fetch of the page: redirect chain, compression, cache headers, HTTP/2 / HTTP/3 support, CDN detection, HTML structure (render-blocking scripts, images without dimensions, third-party origins, preconnects). | No.                                                                                                  |
| **WebPageTest** (optional)                                          | Real-browser page loads from WPT's own locations.                                                                                                                                                                    | `WPT_API_KEY`. Off unless configured.                                                                |

## Locations

A catalogue of 38 cities (`server/locations.ts`) grouped by region (North America, South America,
Europe, Middle East, Africa, Asia, Oceania). A default set of 20 covers every
inhabited continent: London, Frankfurt, Paris, Stockholm, Madrid, Warsaw,
New York, Ashburn, Chicago, Los Angeles, Toronto, São Paulo, Santiago,
Johannesburg, Lagos, Dubai, Mumbai, Singapore, Tokyo, Sydney (plus optional
extras such as Hong Kong, Seoul, Jakarta, Auckland, Tel Aviv, Istanbul …).

Each Globalping test is a single measurement with one probe per city. A second
HTTP measurement re-uses the _same probes_ (Globalping accepts a previous
measurement id as `locations`) so we get a cold and a warm request per city
— this exposes CDN caching (MISS → HIT) and connection set-up costs.

## Architecture

```
client (React + Vite)  ──POST /api/tests──▶  server (Express)
        ▲                                         │ creates Job, runs providers
        └──GET /api/tests/:id (poll)──────────────┘ in parallel, stores report JSON
```

- `server/providers/*` — one module per external source. Each returns a
  normalised result type from `shared/types.ts`; none of them know about the UI.
- `server/analysis/*` — pure functions (no I/O): scoring, CDN detection, HTML
  inspection, recommendation rules. These are unit-tested first (TDD).
- `server/jobs.ts` — orchestration: runs providers, records step progress,
  survives individual provider failures (a report is still produced with what
  succeeded, and failures are listed).
- `server/storage.ts` — reports persisted as JSON in `DATA_DIR` so report URLs
  survive a restart; reports older than `REPORT_RETENTION_DAYS` are pruned.
- `server/security/targetGuard.ts` — SSRF protection: only http(s), the
  hostname must resolve to public addresses (re-checked on every redirect), and
  local Lighthouse runs block requests to private IP ranges.
- `server/security/rateLimit.ts` — sliding-window per-client rate limit.
- `server/app.ts` — JSON API, security headers (CSP allows the one inline
  theme script by hash), compression and static file serving.

## Recommendation engine

Every finding becomes a `Recommendation`:
`{ id, title, severity: critical|high|medium|low, category, summary, evidence[],
fixes[], impactMs?, impactBytes?, locations?, sources[], learnMoreUrl? }`.

Ranking: severity tier first, then an impact score (estimated ms saved, bytes
saved, number of affected locations). Rules live in `server/analysis/rules/`
and come from four places:

1. **Global network rules** — failing locations, slow TTFB per region, large
   spread between fastest and slowest regions (missing CDN / origin far from
   users), CDN cache MISS on HTML, slow DNS, slow TLS, old TLS, certificate
   expiry, high server think-time (TTFB minus network RTT).
2. **Page inspector rules** — missing compression, no Brotli, redirect chain,
   no HTTP/2, no HTTP/3, no HSTS, missing viewport, render-blocking head
   scripts, large HTML, images without dimensions / lazy-loading / modern
   formats, many third-party origins or missing preconnects, font-display.
3. **Lighthouse audits** — every failing opportunity / diagnostic, severity
   derived from its estimated savings (paint time, blocking time, layout shift,
   bytes), with curated fix steps for common audits (`auditGuide.ts`) and
   Lighthouse's own description otherwise.
4. **Real-user data** — Core Web Vitals from the Chrome UX Report that are not
   "good" for real visitors.

Duplicates across sources (e.g. "enable text compression") are merged so each
fix appears once with all of its evidence.

## UI

Single-page app (React + Vite), two code-split views: **home** (URL input,
map-based location picker, this browser's recent reports) and **report**. The report shows: overall grade, Lighthouse scores,
Core Web Vitals (lab + field), a dot-matrix world map with each probe coloured
by TTFB status, a per-city timing breakdown (stacked bars: DNS / connect / TLS
/ server wait / download), the prioritised fix list with severity and category
filters, and technical details. Light and dark themes. Charts have hover and
keyboard tooltips, per-location values are also available as a table, and
status colours always come with an icon and a label.
