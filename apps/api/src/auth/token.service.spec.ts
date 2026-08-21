import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

const JWT_CONFIG = {
  accessSecret: 'access-secret-at-least-32-characters-long',
  refreshSecret: 'refresh-secret-at-least-32-characters-long',
  accessTtl: '15m',
  refreshTtl: '7d',
};

const USER = { id: 'user-1', email: 'demo@securevault.dev', tokenVersion: 0 };

type PrismaMock = {
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  user: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

function buildPrismaMock(): PrismaMock {
  return {
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(USER),
      update: jest.fn().mockResolvedValue(USER),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

function buildService(prisma: PrismaMock): TokenService {
  return new TokenService(
    new JwtService({}),
    prisma as unknown as PrismaService,
    { getOrThrow: () => JWT_CONFIG } as unknown as ConfigService,
  );
}

const inAWeek = (): Date => new Date(Date.now() + 7 * 24 * 3600 * 1000);

describe('TokenService', () => {
  let prisma: PrismaMock;
  let service: TokenService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = buildService(prisma);
  });

  describe('issueTokens', () => {
    it('persists only a SHA-256 hash of the refresh token, never the raw value', async () => {
      const tokens = await service.issueTokens(USER);

      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.refreshToken.create.mock.calls[0][0] as {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      };

      expect(data.userId).toBe(USER.id);
      expect(data.tokenHash).toBe(TokenService.hashToken(tokens.refreshToken));
      expect(data.tokenHash).toHaveLength(64);
      expect(data.tokenHash).not.toContain(tokens.refreshToken);
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('issues a fresh 32-byte CSRF token per session', async () => {
      const a = await service.issueTokens(USER);
      const b = await service.issueTokens(USER);

      expect(a.csrfToken).toHaveLength(64);
      expect(a.csrfToken).not.toBe(b.csrfToken);
    });
  });

  describe('rotate — happy path', () => {
    it('revokes the presented token and issues a new pair', async () => {
      const { refreshToken } = await service.issueTokens(USER);
      prisma.refreshToken.create.mockClear();
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: USER.id,
        expiresAt: inAWeek(),
        revokedAt: null,
      });

      const rotated = await service.rotate(refreshToken);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(rotated.refreshToken).not.toBe(refreshToken);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('rotate — reuse detection', () => {
    it('destroys the whole family when an ALREADY-REVOKED refresh token is replayed', async () => {
      const { refreshToken } = await service.issueTokens(USER);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: USER.id,
        expiresAt: inAWeek(),
        revokedAt: new Date(), // already rotated once — this is a replay
      });

      await expect(service.rotate(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );

      // revokeAllForUser: bump tokenVersion + revoke every outstanding token,
      // atomically.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: { tokenVersion: { increment: 1 } },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: USER.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('does not issue a replacement pair when reuse is detected', async () => {
      const { refreshToken } = await service.issueTokens(USER);
      prisma.refreshToken.create.mockClear();
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: USER.id,
        expiresAt: inAWeek(),
        revokedAt: new Date(),
      });

      await expect(service.rotate(refreshToken)).rejects.toThrow();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('revokes the family of the token OWNER recorded in the DB row', async () => {
      const { refreshToken } = await service.issueTokens(USER);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-in-db-row',
        expiresAt: inAWeek(),
        revokedAt: new Date(),
      });

      await expect(service.rotate(refreshToken)).rejects.toThrow();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-in-db-row' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });

  describe('rotate — other rejections', () => {
    it('rejects a token signed with the wrong secret', async () => {
      const forged = await new JwtService({}).signAsync(
        { sub: USER.id, tokenVersion: 0, jti: 'x' },
        { secret: 'an-attacker-controlled-secret-32-chars', expiresIn: '7d' },
      );

      await expect(service.rotate(forged)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejects garbage', async () => {
      await expect(service.rotate('not-a-jwt')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a valid token with no matching DB row, without nuking the family', async () => {
      const { refreshToken } = await service.issueTokens(USER);
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotate(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an expired DB row', async () => {
      const { refreshToken } = await service.issueTokens(USER);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: USER.id,
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      });

      await expect(service.rotate(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when the user tokenVersion moved on (post-logout / post-reuse)', async () => {
      const { refreshToken } = await service.issueTokens(USER);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: USER.id,
        expiresAt: inAWeek(),
        revokedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({ ...USER, tokenVersion: 1 });

      await expect(service.rotate(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('rejects when the user no longer exists', async () => {
      const { refreshToken } = await service.issueTokens(USER);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: USER.id,
        expiresAt: inAWeek(),
        revokedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.rotate(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('revoke', () => {
    it('revokes only the presented token, by hash', async () => {
      await service.revoke('some-raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash: TokenService.hashToken('some-raw-token'),
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('hashToken', () => {
    it('is deterministic and does not embed the input', () => {
      const hash = TokenService.hashToken('token-value');

      expect(hash).toBe(TokenService.hashToken('token-value'));
      expect(hash).not.toBe(TokenService.hashToken('token-valuf'));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
