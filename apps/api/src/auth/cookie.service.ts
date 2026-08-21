import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { IssuedTokens } from './auth.types';
import type { JwtConfig, SecurityConfig } from '../config/configuration';

/**
 * Centralizes secure cookie handling so flags are applied consistently.
 *
 *  - Refresh cookie: httpOnly (JS cannot read it), Secure (HTTPS in prod),
 *    SameSite=strict (blocks cross-site sends), path-scoped to /auth.
 *  - CSRF cookie: readable by JS (double-submit), Secure, SameSite=strict.
 */
@Injectable()
export class CookieService {
  private readonly security: SecurityConfig;
  private readonly jwt: JwtConfig;

  constructor(config: ConfigService) {
    this.security = config.getOrThrow<SecurityConfig>('security');
    this.jwt = config.getOrThrow<JwtConfig>('jwt');
  }

  /** Path the refresh cookie is scoped to (matches the versioned auth routes). */
  private static readonly REFRESH_PATH = '/api/v1/auth';

  setSessionCookies(res: Response, tokens: IssuedTokens): void {
    res.cookie(this.security.refreshCookieName, tokens.refreshToken, {
      ...this.baseOptions(),
      httpOnly: true,
      path: CookieService.REFRESH_PATH,
      maxAge: this.parseTtlMs(this.jwt.refreshTtl),
    });

    res.cookie(this.security.csrfCookieName, tokens.csrfToken, {
      ...this.baseOptions(),
      httpOnly: false, // must be readable so the SPA can echo it in a header
      path: '/',
      maxAge: this.parseTtlMs(this.jwt.refreshTtl),
    });
  }

  clearSessionCookies(res: Response): void {
    res.clearCookie(this.security.refreshCookieName, {
      ...this.baseOptions(),
      httpOnly: true,
      path: CookieService.REFRESH_PATH,
    });
    res.clearCookie(this.security.csrfCookieName, {
      ...this.baseOptions(),
      httpOnly: false,
      path: '/',
    });
  }

  get refreshCookieName(): string {
    return this.security.refreshCookieName;
  }

  private baseOptions(): Pick<CookieOptions, 'secure' | 'sameSite'> {
    return {
      secure: this.security.cookieSecure,
      sameSite: 'strict',
    };
  }

  /** Converts a duration like "7d" / "15m" / "3600s" to milliseconds. */
  private parseTtlMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const factors: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * factors[unit];
  }
}
