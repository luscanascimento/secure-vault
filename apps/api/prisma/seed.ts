/**
 * Optional development seed.
 *
 * Creates a demo user and a couple of encrypted notes so the app is browsable
 * immediately after `prisma migrate dev`. It re-implements the minimal hashing
 * and encryption logic locally (rather than importing Nest providers) so it can
 * run as a standalone script.
 *
 * Run with:  npm run prisma:seed  (from apps/api)
 */
import { config as loadEnv } from 'dotenv';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

loadEnv({ path: [`${__dirname}/../../../.env`, `${__dirname}/../.env`] });

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

const DEMO_EMAIL = 'demo@securevault.dev';
const DEMO_PASSWORD = 'Demo-Passw0rd!';

function encrypt(plaintext: string, keyB64: string) {
  const key = Buffer.from(keyB64, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    contentIv: iv.toString('base64'),
    contentTag: tag.toString('base64'),
    content: ciphertext.toString('base64'),
  };
}

async function main(): Promise<void> {
  const pepper = process.env.PASSWORD_PEPPER;
  const encKey = process.env.NOTE_ENCRYPTION_KEY;

  if (!pepper || !encKey) {
    throw new Error('PASSWORD_PEPPER and NOTE_ENCRYPTION_KEY must be set to seed.');
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD + pepper, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash },
  });

  // Reset notes for idempotency.
  await prisma.note.deleteMany({ where: { userId: user.id } });

  const notes = [
    {
      title: 'Welcome to Secure Vault',
      body: 'Every note body is encrypted at rest with AES-256-GCM. This text is ciphertext in the database.',
      tags: ['welcome', 'security'],
    },
    {
      title: 'Recovery codes',
      body: 'ALPHA-1234\nBRAVO-5678\nCHARLIE-9012',
      tags: ['private', '2fa'],
    },
  ];

  for (const note of notes) {
    const enc = encrypt(note.body, encKey);
    await prisma.note.create({
      data: {
        userId: user.id,
        title: note.title,
        tags: note.tags,
        ...enc,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded demo user ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}) with ${notes.length} notes.`);
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
