import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtConfig } from '../config/configuration';
import type {
  AccessTokenPayload,
  IssuedTokens,
  RefreshTokenPayload,
} from './auth.types';

/**
 * Issues and rotates JWTs.
 *
 *  - Access token: short-lived, stateless, carries the principal.
 *  - Refresh token: long-lived, ROTATING. Only a SHA-256 hash of each refresh
 *    token is persisted, so a DB leak cannot be replayed. Every refresh revokes
 *    the presented token and issues a new one (rotation + reuse detection).
 *  - CSRF token: a random value returned to the client to seed the double-
 *    submit cookie.
 */
@Injectable()
export class TokenService {
  private readonly jwtConfig: JwtConfig;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.jwtConfig = config.getOrThrow<JwtConfig>('jwt');
  }

  /** Deterministic hash used to store refresh tokens without the raw value. */
  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueTokens(user: {
    id: string;
    email: string;
    tokenVersion: number;
  }): Promise<IssuedTokens> {
    const jti = randomUUID();

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      tokenVersion: user.tokenVersion,
      jti,
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.jwtConfig.accessSecret,
      expiresIn: this.jwtConfig.accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.jwtConfig.refreshSecret,
      expiresIn: this.jwtConfig.refreshTtl,
    });

    await this.persistRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      csrfToken: randomBytes(32).toString('hex'),
    };
  }

  /**
   * Validates a presented refresh token, rotates it, and returns a fresh pair.
   * Throws on any tampering, expiry, version mismatch or reuse of a revoked
   * token.
   */
  async rotate(rawRefreshToken: string): Promise<IssuedTokens> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        rawRefreshToken,
        { secret: this.jwtConfig.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const tokenHash = TokenService.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    // Reuse detection: an already-rotated token coming back means the old value
    // leaked (stolen cookie, replayed request). We cannot tell the thief from
    // the victim, so we end the whole family — bump tokenVersion and revoke
    // every outstanding token for that user.
    if (stored.revokedAt) {
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked.');
    }

    // Rotate: revoke the presented token before issuing a new pair. The
    // `revokedAt: null` guard makes this a single conditional statement, so two
    // concurrent refreshes of the same token cannot both win — exactly one gets
    // count === 1. The loser is indistinguishable from a replay, so it falls
    // into the same reuse handling as the check above.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    return this.issueTokens(user);
  }

  /** Revoke a single refresh token (logout of the current session). */
  async revoke(rawRefreshToken: string): Promise<void> {
    const tokenHash = TokenService.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Bump the user's token version — invalidates every outstanding session. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async persistRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const decoded = this.jwt.decode<{ exp: number }>(refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: TokenService.hashToken(refreshToken),
        expiresAt,
      },
    });
  }
}
