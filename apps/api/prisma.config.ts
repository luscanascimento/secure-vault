import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Load env from the monorepo root `.env` (fallback to a local one if present).
loadEnv({ path: [`${__dirname}/../../.env`, `${__dirname}/.env`] });

/**
 * Prisma 7 moves connection + migration config out of schema.prisma and into
 * this typed config file. The DATABASE_URL is resolved from the environment.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
