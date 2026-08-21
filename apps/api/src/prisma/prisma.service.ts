import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Thin wrapper that ties the Prisma client lifecycle to the Nest module
 * lifecycle. Prisma 7 uses a driver adapter (@prisma/adapter-pg) for the
 * database connection; the URL comes from validated config, never a raw
 * `process.env` read. All DB access goes through this typed client — queries
 * are parameterized by Prisma, so the app is not exposed to SQL injection.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
