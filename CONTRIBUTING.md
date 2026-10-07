# Contributing to Meridian

Thanks for helping make the web faster. Bug reports, ideas and pull requests are all welcome.

## Getting set up

```bash
git clone https://github.com/MarciusWong/meridian.git
cd meridian
npm install
npm run dev     # API on :8787, UI on http://localhost:5173
```

You need Node.js 20.19+ and, to run Lighthouse locally, Chrome or Chromium (set `CHROME_PATH` if it isn't found).
API keys are optional — see [`.env.example`](.env.example).

## Before you open a pull request

```bash
npm run check   # Prettier check, typecheck and tests — the same checks CI runs
npm run build
```

- **Write a test first** for logic changes. Everything under `server/analysis/` is pure functions, so new rules and
  scoring changes are easy to test with fixtures (see `tests/recommendations.test.ts`).
- **Keep providers thin.** Code that talks to an external service lives in `server/providers/`; turning its output into
  findings belongs in `server/analysis/`.
- **Check the UI in both themes and at phone width** when you change the front end.
- Run `npm run format` to apply Prettier.
- Keep pull requests focused: one change, with a short description of what and why.

## Adding a recommendation

1. Add a rule to the right file in `server/analysis/rules/` (`network.ts`, `page.ts`, `field.ts`), or curated guidance
   for a Lighthouse audit in `server/analysis/auditGuide.ts`.
2. Give the finding a stable `id`. Findings from different tools with the same `id` are merged into one.
3. Choose the severity from measured impact, include the evidence, and write fixes as concrete steps.
4. Add tests in `tests/recommendations.test.ts` for when the rule fires and when it must not.

## Adding a test location

Add a row to `server/locations.ts`. The city name must match how [Globalping](https://globalping.io) spells it —
check that probes exist there with `curl https://api.globalping.io/v1/probes`.

## Reporting bugs

Open an issue with the URL you tested (if you can share it), what you expected and what happened. The report's
**JSON** export is very helpful.

## Security issues

Please don't open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
