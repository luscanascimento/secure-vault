/**
 * Typed configuration namespaces. Everything is read once at startup (after
 * Joi validation) so services consume strongly-typed values, never raw
 * `process.env` lookups.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  webOrigin: string;
}

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
}

export interface SecurityConfig {
  passwordPepper: string;
  noteEncryptionKey: string;
  cookieSecure: boolean;
  refreshCookieName: string;
  csrfCookieName: string;
}

export interface ThrottleConfig {
  ttlSeconds: number;
  limit: number;
}

/**
 * guardsvc, the external password-strength scorer. An empty `url` disables the
 * call entirely; the check is advisory and always fails open.
 */
export interface PasswordStrengthConfig {
  url: string;
  timeoutMs: number;
}

export interface RootConfig {
  app: AppConfig;
  jwt: JwtConfig;
  security: SecurityConfig;
  throttle: ThrottleConfig;
  passwordStrength: PasswordStrengthConfig;
}

export default (): RootConfig => ({
  app: {
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    port: parseInt(process.env.API_PORT ?? '3000', 10),
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:4200',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  security: {
    passwordPepper: process.env.PASSWORD_PEPPER as string,
    noteEncryptionKey: process.env.NOTE_ENCRYPTION_KEY as string,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    refreshCookieName: process.env.REFRESH_COOKIE_NAME ?? 'sv_refresh',
    csrfCookieName: process.env.CSRF_COOKIE_NAME ?? 'sv_csrf',
  },
  throttle: {
    ttlSeconds: parseInt(process.env.THROTTLE_TTL_SECONDS ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
  passwordStrength: {
    url: (process.env.GUARDSVC_URL ?? '').replace(/\/+$/, ''),
    timeoutMs: parseInt(process.env.GUARDSVC_TIMEOUT_MS ?? '400', 10),
  },
});
