import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { EncryptionService } from '../../crypto/encryption.service';
import type { SecurityConfig } from '../../config/configuration';

/**
 * CSRF protection via the double-submit cookie pattern.
 *
 * On login the server issues a non-httpOnly CSRF cookie. For every state-
 * changing request the client must echo that token back in the
 * `X-CSRF-Token` header. Because a cross-site attacker cannot read the victim's
 * cookie (same-origin policy) nor forge a matching header, mismatches are
 * rejected. Safe (read-only) methods are exempt.
 *
 * This complements the SameSite=strict refresh cookie for defense in depth.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly SAFE_METHODS = new Set([
    'GET',
    'HEAD',
    'OPTIONS',
  ]);

  private readonly cookieName: string;

  constructor(private readonly config: ConfigService) {
    this.cookieName =
      this.config.getOrThrow<SecurityConfig>('security').csrfCookieName;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (CsrfGuard.SAFE_METHODS.has(request.method)) {
      return true;
    }

    const cookieToken: string | undefined = request.cookies?.[this.cookieName];
    const headerToken = request.header('x-csrf-token');

    if (
      !cookieToken ||
      !headerToken ||
      !EncryptionService.safeEqual(cookieToken, headerToken)
    ) {
      throw new ForbiddenException('Invalid or missing CSRF token.');
    }

    return true;
  }
}
