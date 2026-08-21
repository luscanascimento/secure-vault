<div align="center">

# 🔐 Secure Vault

### A server-side hardened, encrypted personal notes vault.

*Every note body is encrypted at rest with AES-256-GCM under a server-held key. Every password is hashed with Argon2id. Every session rotates.*

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-EF4444?logo=turborepo&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-34e0a1)

</div>

---

## Why this project

Secure Vault is a deliberately **security-first** full-stack application built to
demonstrate production-grade practice, not just CRUD. It maps every OWASP-relevant
control to real, readable, layered code — and documents where each one lives.

- **Encryption at rest** — note bodies are sealed with AES-256-GCM (unique IV +
  auth tag per record) by the API before they reach the database, using a key
  that lives only in the server's environment. Titles and tags stay in plaintext
  so they remain queryable — see [Trust boundary](#trust-boundary).
- **Modern authentication** — Argon2id password hashing (salt **+** application
  pepper), short-lived JWT access tokens, and **rotating** refresh tokens stored
  as hashes and delivered via httpOnly, `SameSite=strict` cookies. Replaying a
  spent refresh token destroys the whole token family for that user — with a
  bounded blind spot documented under [Revocation window](#revocation-window).
- **Defense in depth** — a strict Content-Security-Policy on the SPA (nginx),
  Helmet on the API, CORS lock-down, CSRF double-submit tokens, global +
  per-route rate limiting, strict validation/sanitization, and a leak-proof
  global exception filter.
- **Clean architecture** — a Turborepo monorepo with a layered NestJS API
  (controller → service → repository → Prisma) and a signals-based, zoneless
  Angular SPA. Strict TypeScript throughout, **zero `any`**.

---

## Screenshots

No screenshots are committed to this repository. The UI — vault grid, slide-over
note editor and split-panel auth screen — is reproducible in one command: run
`docker compose up -d --build` and open http://localhost:4200.

---

## Architecture

```
                           ┌──────────────────────────────────────────┐
                           │              Browser (Angular 22)         │
                           │  signals · zoneless · typed reactive forms│
                           │  access token in memory only              │
                           └───────────────┬──────────────────────────┘
             Bearer access token · X-CSRF-Token header · httpOnly refresh cookie
                                           │  (withCredentials)
                                           ▼
        ┌───────────────────────────────── NestJS 11 API ─────────────────────────────────┐
        │  Helmet + CSP → CORS → cookie-parser → ThrottlerGuard → JwtAuthGuard → CsrfGuard  │
        │  → ValidationPipe (whitelist/forbid/transform)                                    │
        │                                                                                   │
        │   Controller  ──►  Service  ──►  Repository  ──►  Prisma Client (parameterized)   │
        │      auth          auth/token       notes            │                            │
        │      notes         notes            (userId-scoped)   ▼                            │
        │   Crypto: PasswordService (Argon2id+pepper) · EncryptionService (AES-256-GCM)     │
        │   AllExceptionsFilter (no internal leakage) · Winston structured logs             │
        └────────────────────────────────────────┬──────────────────────────────────────────┘
                                                  ▼
                                   ┌────────────────────────────┐
                                   │   PostgreSQL 17 (volume)    │
                                   │  users · notes(body enc.)   │
                                   │  refresh_tokens (hashed)    │
                                   └────────────────────────────┘
```

## Monorepo layout

```
secure-vault/
├── apps/
│   ├── api/                 # NestJS 11 + Prisma 7 + PostgreSQL
│   │   ├── src/
│   │   │   ├── auth/        # controller → service → token/cookie services
│   │   │   ├── notes/       # controller → service → repository
│   │   │   ├── crypto/      # Argon2id + AES-256-GCM services
│   │   │   ├── common/      # exception filter, CSRF guard, decorators, logger
│   │   │   ├── config/      # typed config + Joi env validation
│   │   │   └── prisma/      # PrismaService (driver adapter)
│   │   └── prisma/          # schema, migrations, seed
│   └── web/                 # Angular 22 SPA (standalone, signals, zoneless)
│       └── nginx.conf       # static serving + API proxy + CSP/security headers
├── packages/
│   └── shared-types/        # shared transport contracts
├── .github/workflows/ci.yml # lint + test + build on every push/PR
├── docker-compose.yml       # postgres + api + web
├── turbo.json               # build pipeline
├── .env.example             # every var, safe placeholders
└── Makefile                 # convenience targets
```

---

## Trust boundary

**This is encryption at rest, not end-to-end encryption.** The AES key comes from
`NOTE_ENCRYPTION_KEY` in the API's environment, so the running server can decrypt
every note body — and does, on every read, to serve it back to the owner. Titles
and tags are stored in plaintext because the app queries and filters on them.

What that buys you:

- A stolen database dump, a leaked backup, a snapshot of the Postgres volume or a
  SQL-injection read primitive yields ciphertext for every note body. Without the
  application secret it stays ciphertext.
- The GCM auth tag means a tampered row fails to decrypt instead of returning
  attacker-chosen content.

What it does **not** protect against:

- An attacker with code execution on the API host, or with both the DB and the
  environment, reads everything.
- The operator can read your notes. There is no key derived from your password
  and no key held only by the browser.
- Note titles and tags leak metadata even from a DB-only breach.

Real end-to-end encryption would mean deriving a key in the browser from the
user's passphrase and shipping only ciphertext to the API — which also means
losing server-side search, server-side rendering of note previews, and any
recovery path when a user forgets the passphrase. This project chose the
server-side model deliberately and documents it rather than overclaiming.

---

## Revocation window

Refresh-token reuse detection is real: replaying an already-rotated refresh token
makes `TokenService.rotate` call `revokeAllForUser`, which bumps `tokenVersion`
and marks every outstanding refresh row revoked in one transaction. From that
moment **no new access token can be minted** for that user.

What it does **not** do is kill access tokens that were already handed out.
`JwtAuthGuard` verifies the access JWT's signature and expiry and nothing else —
it never reads `tokenVersion`, and deliberately never touches the database, so
every authenticated request stays a single signature check with no query.

The practical consequence:

| Event | Effect |
| --- | --- |
| Reuse detected / logout-all | Refresh family dead immediately; no further rotation |
| A stolen **access** token already in the attacker's hands | Still valid until it expires — up to `JWT_ACCESS_TTL` (**15 minutes** by default) |

So the honest claim is "revokes every session within one access-token lifetime",
not "instantly". That is the standard stateless-JWT trade-off: the alternative is
a `tokenVersion` (or denylist) lookup on **every** request, which puts the
database on the hot path of every API call. Shrink `JWT_ACCESS_TTL` to shrink the
window; add the DB check to the guard if your threat model cannot tolerate it at
all.

---

## 🛡️ Security checklist

Each control is mapped to exactly where it is implemented.

| # | Control | How it's done | Where |
| - | ------- | ------------- | ----- |
| 1 | **Password hashing — Argon2id + salt + pepper** | argon2id (19 MiB, t=2); argon2 adds a per-user random **salt**; an app-level **pepper** from env is concatenated to the password before hashing, so it never reaches the DB | `apps/api/src/crypto/password.service.ts` |
| 2 | **Encryption at rest — AES-256-GCM** | Note **bodies** encrypted with a random 96-bit IV + GCM auth tag **per record**, under a server-held key; the body column holds only ciphertext. Titles and tags are plaintext by design ([trust boundary](#trust-boundary)) | `apps/api/src/crypto/encryption.service.ts`, `notes.service.ts` |
| 3 | **JWT access + rotating refresh, with reuse detection** | Short-lived access JWT; refresh JWT rotated on every use; only a **SHA-256 hash** of the refresh token is stored; replaying an already-rotated token revokes the whole family via `tokenVersion`. Access tokens already issued survive until they expire — see [Revocation window](#revocation-window) | `apps/api/src/auth/token.service.ts` |
| 4 | **Secure httpOnly cookies** | Refresh + CSRF cookies with `httpOnly` (refresh), `Secure`, `SameSite=strict`, path-scoped | `apps/api/src/auth/cookie.service.ts` |
| 5 | **Session invalidation / logout** | Logout revokes the presented refresh token; `revokeAllForUser` bumps `tokenVersion` and kills every outstanding **refresh** token — invoked automatically on refresh-token reuse. Bounded by the [revocation window](#revocation-window) | `token.service.ts`, `auth.controller.ts` |
| 6 | **CSRF — double-submit token** | Non-httpOnly CSRF cookie echoed in `X-CSRF-Token`; verified with constant-time compare on state-changing routes | `apps/api/src/common/guards/csrf.guard.ts` |
| 7 | **XSS prevention** | Angular's built-in contextual escaping; **no** `innerHTML`/`DomSanitizer`; access token never in `localStorage` | `apps/web/**`, `auth.service.ts` |
| 8 | **SQL-injection prevention** | 100% Prisma parameterized queries; no string-concatenated SQL; all reads scoped by `userId` | `apps/api/src/notes/notes.repository.ts` |
| 9 | **Rate limiting** | Global `@nestjs/throttler` + **stricter** per-route limits on auth (5/min login & register) | `app.module.ts`, `auth.controller.ts` |
| 10 | **Security headers** | API: Helmet with HSTS, `no-referrer`, cross-origin resource policy. SPA: nginx sets `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` — repeated inside the static-asset `location` because a single `add_header` there discards the ones inherited from `server` | `apps/api/src/main.ts`, `apps/web/nginx.conf` |
| 11 | **Content-Security-Policy** | The CSP that matters is on the **HTML**, set by nginx: `default-src 'self'`, `script-src 'self'` (no inline scripts — `inlineCritical` is disabled in `angular.json` so the build stops emitting an inline `onload` handler), `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `connect-src 'self'`. `style-src` keeps `'unsafe-inline'`: Angular injects component styles at runtime via `document.createElement('style')`, which needs either that or a per-response `ngCspNonce` a static nginx cannot mint. The API sends its own `default-src 'none'` CSP, which only ever covers JSON | `apps/web/nginx.conf`, `apps/api/src/main.ts` |
| 12 | **CORS lock-down** | Single allowed origin, `credentials: true`, explicit methods/headers | `apps/api/src/main.ts` |
| 13 | **Input validation & sanitization** | Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`); typed DTOs; tag/email normalization | `main.ts`, `**/dto/*.ts` |
| 14 | **Exception hygiene** | Global filter returns safe, uniform errors labelled with the concrete exception (`NotFound`, `Conflict`, …); non-HTTP errors collapse to a generic 500; internals only in server logs. `suggestions` is the one extra field forwarded, and only when it is a plain array of strings | `apps/api/src/common/filters/all-exceptions.filter.ts` |
| 15 | **Config validation** | Joi schema validates every env var at boot (fail-fast); strong-secret length checks | `apps/api/src/config/env.validation.ts` |
| 16 | **User-enumeration / timing defense** | Login returns a generic error and always runs a verify (dummy hash when the user is absent) | `apps/api/src/auth/auth.service.ts` |
| 17 | **Structured logging** | Winston (JSON in prod), no secrets logged | `apps/api/src/common/logger/winston.config.ts` |
| 18 | **HTTPS / TLS** | `Secure` cookies + HSTS enabled via `COOKIE_SECURE=true` behind a TLS-terminating proxy (deployment note below) | deployment |

---

## Key management & rotation

- **`NOTE_ENCRYPTION_KEY`** — a base64-encoded 32-byte key used for AES-256-GCM.
  Generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
  Store it in a secrets manager (AWS Secrets Manager / Vault / Doppler), **never**
  in the repo. Because each record stores its own IV + tag, you can rotate to a
  new key by introducing a `keyVersion` column and re-encrypting rows lazily or in
  a migration job (decrypt with the old key, encrypt with the new one).
- **`PASSWORD_PEPPER`** — an app-level secret mixed into every password hash. It is
  intentionally **not** in the database, so a DB-only breach cannot mount an offline
  attack without also compromising the app secret. Rotating it invalidates existing
  hashes, so treat it as long-lived (or add a versioned pepper scheme).
- **`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`** — separate secrets per token
  domain. Rotating the refresh secret invalidates outstanding sessions.

---

## Environment variables

Copy `.env.example` → `.env` and fill in real values. Every variable is validated
at startup.

| Variable | Description | Example |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment | `development` |
| `API_PORT` | API listen port | `3000` |
| `WEB_ORIGIN` | Allowed CORS origin | `http://localhost:4200` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://vault:...@localhost:5432/securevault` |
| `PASSWORD_PEPPER` | App-level pepper (≥32 chars) | *(secret)* |
| `JWT_ACCESS_SECRET` | Access-token secret (≥32 chars) | *(secret)* |
| `JWT_REFRESH_SECRET` | Refresh-token secret (≥32 chars) | *(secret)* |
| `JWT_ACCESS_TTL` | Access-token lifetime | `15m` |
| `JWT_REFRESH_TTL` | Refresh-token lifetime | `7d` |
| `NOTE_ENCRYPTION_KEY` | base64 32-byte AES key | *(secret)* |
| `COOKIE_SECURE` | Set `Secure` cookie flag (HTTPS) | `false` (dev) / `true` (prod) |
| `REFRESH_COOKIE_NAME` | Refresh cookie name | `sv_refresh` |
| `CSRF_COOKIE_NAME` | CSRF cookie name | `sv_csrf` |
| `THROTTLE_TTL_SECONDS` | Global rate-limit window | `60` |
| `THROTTLE_LIMIT` | Global requests per window | `100` |
| `GUARDSVC_URL` | Password-strength scorer, empty = off | `http://guardsvc:8080` |
| `GUARDSVC_TIMEOUT_MS` | Budget for that call | `400` |

---

## Password strength (optional, fails open)

Registration enforces its own rules — 12 characters minimum plus mixed
character classes, validated in `RegisterDto`. Those are the rules that always
hold.

On top of that, if `GUARDSVC_URL` is set, `AuthService.register` asks
[guardsvc](../guardsvc) whether the password is one an attacker would guess
early: a breach-wordlist entry, a keyboard walk, or the user's own email address
rearranged. A rejection comes back as a 400 carrying guardsvc's warning as
`message` and its advice as a `suggestions` array; `AllExceptionsFilter` forwards
that array (and only that array, only when every element is a string), and the
register screen renders it under the error alert.

The call is deliberately not load-bearing:

- 400 ms timeout (`AbortSignal.timeout`), then the answer is discarded.
- After three consecutive failures the client stops calling for 30 seconds, so a
  dead scorer costs one timeout per window instead of one per signup.
- Any timeout, connection error, 5xx or unset URL is treated as "no objection".
  **guardsvc being down can never block a registration.**
- The password is sent to guardsvc and nowhere else. It is never written to this
  API's logs, including in the error handler.

guardsvc is a separate repository. `docker compose --profile guardsvc up`
starts it from a sibling checkout; without the profile the API runs exactly as
before, on the DTO rules alone.

---

## Run with Docker (recommended)

```bash
cp .env.example .env
# Generate real secrets, e.g.:
#   openssl rand -base64 48                                   # for pepper / JWT secrets
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # for NOTE_ENCRYPTION_KEY

docker compose up -d --build      # or: make up
```

- Web → **http://localhost:4200**
- API → proxied at **http://localhost:4200/api/v1** (also reachable inside the network)
- The API container runs `prisma migrate deploy` on start, then boots.

Tear down with `docker compose down` (add `-v` to drop the database volume).

## Run locally

> Requires **Node.js `^22.22.3 || ^24.15.0 || >=26`** (Angular 22 constraint),
> npm 10+, and a running PostgreSQL.

```bash
cp .env.example .env               # fill in real values + a local DATABASE_URL
npm install
npm run prisma:generate            # generate the typed Prisma client
npm run prisma:migrate             # apply migrations
npm run prisma:seed                # optional: demo user + encrypted notes

# In two terminals (or `npm run dev` for both via turbo):
npm run dev
```

Demo credentials after seeding: `demo@securevault.dev` / `Demo-Passw0rd!`.

## Build & verify

```bash
npm run build     # turbo: builds api (nest build) + web (ng build) + shared-types
npm run lint      # turbo: ESLint on the API (no-explicit-any enforced);
                  # web and shared-types type-check with `tsc --noEmit`
npm test          # turbo: the API's Jest suites
```

## Tests

The suites target the security claims above, not coverage percentage. They are
pure unit tests — no database, no HTTP server, no Docker — so `npm test` runs
offline in seconds. Prisma and `ConfigService` are stubbed; argon2, `node:crypto`
and `@nestjs/jwt` run for real.

| Suite | What it pins down |
| --- | --- |
| `crypto/encryption.service.spec.ts` | encrypt→decrypt round-trip (incl. empty, unicode, 50 kB bodies); a fresh 12-byte IV per call and no IV collisions over 500 encryptions; decryption **throws** when the auth tag, ciphertext or IV is flipped, when a tag from another record is spliced in, or under a different key; a key that does not decode to 32 bytes is refused at construction (boot) |
| `crypto/password.service.spec.ts` | hashes are `$argon2id$` with `m=19456,t=2,p=1`; correct password verifies, wrong/empty/case-shifted ones do not; the same password hashes differently twice (auto-salt); a hash does **not** verify under a different pepper; a malformed stored hash returns `false` instead of throwing |
| `auth/token.service.spec.ts` | only a SHA-256 hash of the refresh token is persisted; rotation revokes the presented row and mints a new pair; replaying an **already-revoked** token triggers `revokeAllForUser` (tokenVersion `+1` and mass-revoke, in one `$transaction`) and issues nothing; forged signature, unknown row, expired row and stale `tokenVersion` are all rejected — and only the reuse case nukes the family |
| `common/guards/csrf.guard.spec.ts` | `GET`/`HEAD`/`OPTIONS` pass with no token at all; `POST`/`PATCH`/`PUT`/`DELETE` pass only when header equals cookie; missing header, missing cookie, unparsed cookies, a one-character difference, a length mismatch and a token under the wrong cookie name are each rejected |
| `common/filters/all-exceptions.filter.spec.ts` | each exception is labelled with its own class (`BadRequest`, `NotFound`, …); `suggestions` reaches the client, but only as a plain string array; validation-pipe message arrays are joined; a raw `Error` never leaks its text or stack |

---

## API reference

Base path: `/api/v1`. Authenticated routes expect `Authorization: Bearer <access>`.
State-changing routes expect the `X-CSRF-Token` header (double-submit).

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | public | Create an account; sets session cookies, returns access token |
| `POST` | `/auth/login` | public | Authenticate; sets session cookies, returns access token |
| `POST` | `/auth/refresh` | cookie + CSRF | Rotate refresh token; returns a fresh access token |
| `POST` | `/auth/logout` | cookie + CSRF | Revoke the current refresh token, clear cookies |
| `GET` | `/auth/me` | bearer | Current user profile |
| `GET` | `/notes` | bearer | List notes (`?search=`, `?tag=`) — decrypted for the owner |
| `GET` | `/notes/:id` | bearer | Get a single note |
| `POST` | `/notes` | bearer + CSRF | Create a note (encrypted on write) |
| `PATCH` | `/notes/:id` | bearer + CSRF | Update a note |
| `DELETE` | `/notes/:id` | bearer + CSRF | Delete a note |
| `GET` | `/health` | public | Liveness probe |

---

## Tech stack

**Backend** — NestJS 11 · Prisma 7 (`prisma-client` + `@prisma/adapter-pg`) ·
PostgreSQL 17 · argon2 · Node `crypto` (AES-256-GCM) · @nestjs/throttler · Helmet ·
class-validator/transformer · Winston · Joi.

**Frontend** — Angular 22 (standalone, signals, zoneless, new control flow) ·
typed reactive forms · functional guards + interceptors · strict TypeScript.

**Tooling** — Turborepo · npm workspaces · Docker Compose · multi-stage Dockerfiles.

## License

MIT — built as a portfolio showcase. Use it, learn from it, harden further.
