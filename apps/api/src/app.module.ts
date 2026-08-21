import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
  seconds,
} from '@nestjs/throttler';
import configuration, { type ThrottleConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { NotesModule } from './notes/notes.module';
import { HealthController } from './health/health.controller';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Root module. Wires global providers:
 *  - ConfigModule with Joi validation (fail-fast on bad config).
 *  - ThrottlerModule (global rate limit) + ThrottlerGuard as an APP_GUARD.
 *  - JwtAuthGuard as an APP_GUARD (auth by default; opt out with @Public()).
 *  - AllExceptionsFilter as an APP_FILTER (uniform, leak-free errors).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const throttle = config.getOrThrow<ThrottleConfig>('throttle');
        return {
          throttlers: [
            {
              ttl: seconds(throttle.ttlSeconds),
              limit: throttle.limit,
            },
          ],
        };
      },
    }),
    PrismaModule,
    CryptoModule,
    AuthModule,
    NotesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
