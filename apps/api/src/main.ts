import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER, WinstonModule } from 'nest-winston';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { buildWinstonOptions } from './common/logger/winston.config';

async function bootstrap(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  const app = await NestFactory.create(AppModule, {
    // Structured Winston logger replaces the default Nest logger.
    logger: WinstonModule.createLogger(buildWinstonOptions(nodeEnv)),
    bufferLogs: true,
  });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const config = app.get(ConfigService);
  const appConfig = config.getOrThrow<AppConfig>('app');

  // --- Security headers (Helmet) with a strict Content-Security-Policy. -----
  // This is an API returning JSON; lock everything down to 'self' and forbid
  // framing, inline scripts, and object embeds.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: {
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // --- Cookies (refresh + CSRF double-submit) -------------------------------
  app.use(cookieParser());

  // --- CORS locked to the single web origin, with credentials --------------
  app.enableCors({
    origin: appConfig.webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    maxAge: 600,
  });

  // --- Global validation + sanitization ------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // reject requests carrying unknown props
      transform: true, // coerce payloads into DTO instances
      transformOptions: { enableImplicitConversion: false },
      forbidUnknownValues: true,
    }),
  );

  // Versioned API surface: /v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Trust the reverse proxy so Secure cookies + client IPs work behind TLS.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  await app.listen(appConfig.port);
}

void bootstrap();
