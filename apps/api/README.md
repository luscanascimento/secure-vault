# Secure Vault — API

NestJS + Prisma 7 + PostgreSQL backend for the Secure Vault app. Layered
architecture (**controller → service → repository → Prisma**), fully typed, no
`any`.

## Stack

- **NestJS 11** (standalone providers, global guards/filters/pipes)
- **Prisma 7** with the Rust-free `prisma-client` generator + `@prisma/adapter-pg`
- **PostgreSQL**
- **argon2** (Argon2id) for password hashing
- Node **`crypto`** for AES-256-GCM encryption at rest
- **@nestjs/throttler**, **helmet**, **class-validator/transformer**, **winston**

## Layout

```
src/
  main.ts                 # bootstrap: helmet, CSP, CORS, cookies, global pipe
  app.module.ts           # global guards (throttler, JWT), global filter
  config/                 # typed config + Joi env validation
  prisma/                 # PrismaService (driver adapter) + module
  crypto/                 # PasswordService (Argon2id + pepper), EncryptionService (AES-GCM)
  common/                 # exception filter, guards (CSRF), decorators, logger
  auth/                   # controller → service → token/cookie services + DTOs
  notes/                  # controller → service → repository + DTOs
  health/                 # liveness probe
prisma/
  schema.prisma           # User, Note, RefreshToken
  migrations/             # SQL migrations
  seed.ts                 # optional demo data
prisma.config.ts          # Prisma 7 config (datasource URL, seed)
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run build` | Compile with the Nest CLI |
| `npm run start:dev` | Watch mode |
| `npm run prisma:generate` | Generate the typed Prisma client |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:deploy` | Apply migrations (production) |
| `npm run prisma:seed` | Seed a demo user + encrypted notes |
| `npm run lint` | ESLint (`no-explicit-any` enforced) |

## API surface

All routes are prefixed `/api/v1`. See the root `README.md` for the full
endpoint table and the security checklist.

## Configuration

Every environment variable is validated at startup with Joi (`src/config/env.validation.ts`).
The process refuses to boot on missing/weak config. See root `.env.example`.
