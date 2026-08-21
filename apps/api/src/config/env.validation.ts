import * as Joi from 'joi';

/**
 * Startup-time validation of every environment variable the API depends on.
 * The app refuses to boot with missing/weak configuration — fail fast instead
 * of discovering a missing secret at request time.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  API_PORT: Joi.number().port().default(3000),

  WEB_ORIGIN: Joi.string().uri().required(),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  PASSWORD_PEPPER: Joi.string().min(32).required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),

  // Base64-encoded 32-byte key (44 chars incl. padding).
  NOTE_ENCRYPTION_KEY: Joi.string().base64().length(44).required(),

  COOKIE_SECURE: Joi.boolean().default(false),
  REFRESH_COOKIE_NAME: Joi.string().default('sv_refresh'),
  CSRF_COOKIE_NAME: Joi.string().default('sv_csrf'),

  THROTTLE_TTL_SECONDS: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),

  // Optional: base URL of guardsvc, the password-strength scorer. Empty or
  // absent turns the check off. The call is advisory and fails open, so this is
  // not `required()` — the API must boot and register users without it.
  GUARDSVC_URL: Joi.string().uri().allow('').default(''),
  GUARDSVC_TIMEOUT_MS: Joi.number().min(50).max(5000).default(400),
});
