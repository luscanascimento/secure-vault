# Secure Vault — Web

Angular 22 single-page app for Secure Vault. Standalone components, **signals**,
the new control flow (`@if` / `@for` / `@switch`), **zoneless** change detection,
and strict TypeScript.

## Highlights

- **Typed reactive forms** with client-side validation mirroring the API DTOs.
- **Functional auth guard** (`authGuard`) + guest guard; lazy-loaded routes.
- **Functional HTTP interceptor** that sends credentials, attaches the CSRF
  double-submit header, and transparently refreshes on `401` (single-flight
  refresh with request queueing).
- **Access token kept in memory only** (a signal) — never in `localStorage` —
  so it is not exposed to persisted-XSS theft. The refresh token is an httpOnly
  cookie the JS never reads.
- **Signals-based state** for auth, notes and theme.
- Light/dark theme (persisted), fully responsive, keyboard accessible,
  `prefers-reduced-motion` aware.
- **Never bypasses Angular sanitization** — no `innerHTML`/`DomSanitizer`; all
  user content is rendered through interpolation and bindings.

## Structure

```
src/app/
  core/            # services (auth, notes, theme), guard, interceptor, models
  features/
    auth/          # login + register (reactive forms)
    vault/         # dashboard, note cards, slide-over editor
  app.ts           # shell (topbar, theme toggle, boot state)
  app.config.ts    # providers + silent session restore on load
  app.routes.ts    # lazy standalone routes
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run build` | Production build (`ng build`) |
| `npm start` | Dev server (`ng serve`) |
| `npm run lint` | Type-check (`tsc -p tsconfig.app.json --noEmit`) |

There is **no** `npm test` here yet: no runner is configured and no specs exist.
The automated suites live in `apps/api` (`npm test` from the repo root). Adding
web tests means wiring a runner (Vitest or Karma) into `angular.json` first.

## Content-Security-Policy

`nginx.conf` — not the API — sets the CSP for the HTML this app is served from.
`optimization.styles.inlineCritical` is turned **off** in `angular.json` for that
reason: with it on, the build emits `<link ... onload="this.media='all'">`, an
inline event handler that would force `script-src 'unsafe-inline'` and hollow out
the policy. The trade is a render-blocking stylesheet request (~5 kB).

`style-src` still carries `'unsafe-inline'`, because Angular injects component
styles at runtime through `document.createElement('style')`. Removing it requires
a per-response nonce via `ngCspNonce`, which needs a dynamic server; nginx serving
a static `index.html` cannot generate one.

## Configuration

`src/environments/environment.ts` sets `apiBaseUrl`. The production build
(`environment.prod.ts`) points at a same-origin `/api/v1`, reverse-proxied by
nginx in the Docker image.

> Requires Node.js `^22.22.3 || ^24.15.0 || >=26` (Angular 22 engine constraint).
