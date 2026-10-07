# Security policy

## Reporting a vulnerability

Please report security issues privately using
[GitHub's private vulnerability reporting](https://github.com/MarciusWong/meridian/security/advisories/new)
rather than opening a public issue. Include steps to reproduce and the impact you see.

## Scope

Meridian fetches URLs that visitors submit, so the areas that matter most are:

- **Server-side request forgery** — reaching private or internal addresses through the page inspector, Globalping
  targets or the headless browser used for Lighthouse.
- **Resource abuse** — bypassing rate limits or concurrency limits.
- **Injection** — content from tested pages or third-party APIs being rendered unsafely in the UI.

## Hardening built in

- Only public `http(s)` targets are accepted; every redirect hop is re-checked, and the headless browser blocks
  requests to private IP ranges. (`ALLOW_PRIVATE_TARGETS=true` turns this off — use it only on trusted networks.)
- Per-client hourly rate limits and a global concurrency cap.
- Strict Content Security Policy, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy` headers.
- Unguessable report ids; shared report history is off by default.
