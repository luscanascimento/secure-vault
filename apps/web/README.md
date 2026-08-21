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
| `npm test` | Unit tests |

## Configuration

`src/environments/environment.ts` sets `apiBaseUrl`. The production build
(`environment.prod.ts`) points at a same-origin `/api/v1`, reverse-proxied by
nginx in the Docker image.

> Requires Node.js `^22.22.3 || ^24.15.0 || >=26` (Angular 22 engine constraint).
