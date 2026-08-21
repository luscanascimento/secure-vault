import { utilities as nestWinstonUtilities } from 'nest-winston';
import * as winston from 'winston';

/**
 * Structured logging with Winston.
 *  - JSON logs in production (machine-parseable for log aggregation).
 *  - Pretty, colorized logs in development.
 * Sensitive fields are never logged by the application layer.
 */
export function buildWinstonOptions(
  nodeEnv: string,
): winston.LoggerOptions {
  const isProd = nodeEnv === 'production';

  return {
    level: isProd ? 'info' : 'debug',
    format: isProd
      ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        )
      : winston.format.combine(
          winston.format.timestamp(),
          winston.format.ms(),
          nestWinstonUtilities.format.nestLike('SecureVault', {
            colors: true,
            prettyPrint: true,
          }),
        ),
    transports: [new winston.transports.Console()],
  };
}
