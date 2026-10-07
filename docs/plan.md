# Implementation plan

Each step ends with its tests passing (`npm test`) and a typecheck
(`npm run typecheck`). Pure logic is written test-first.

1. **Scaffold** — package.json, TypeScript configs, Vite, Vitest, Express
   entry, shared types.
2. **Location catalogue** (`server/locations.ts`) + tests: ids unique, every
   region represented, default set covers all continents.
3. **Target guard** (TDD) — URL normalisation and private-address rejection.
4. **Scoring** (TDD) — log-normal metric scoring, TTFB status thresholds,
   global delivery score, overall grade.
5. **Globalping provider** — request builder + response normaliser (TDD on the
   normaliser with recorded fixtures), then the HTTP client with polling and
   rate-limit handling.
6. **CDN detection + HTML inspection** (TDD) — pure functions over headers /
   HTML strings; then the page inspector provider that fetches and calls them.
7. **Lighthouse normaliser** (TDD) — turns a Lighthouse result (from PSI or
   local) into `LighthouseSummary`; then PSI and local Lighthouse providers.
8. **Recommendation engine** (TDD) — rules per source, merge, rank.
9. **Jobs + storage + API routes** — orchestration with step progress,
   persistence, rate limiting; an integration test with providers stubbed.
10. **World dot-map data** — build script producing `src/data/world-dots.json`.
11. **Front end** — tokens/theme, home view, report view and components.
12. **Verification** — run a real test end to end against a public site,
    screenshot both themes at desktop and phone widths, fix what looks wrong.
