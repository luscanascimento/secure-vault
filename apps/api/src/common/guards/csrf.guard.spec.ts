import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CsrfGuard } from './csrf.guard';

const COOKIE_NAME = 'sv_csrf';
const TOKEN = 'a'.repeat(64);

function buildGuard(): CsrfGuard {
  return new CsrfGuard({
    getOrThrow: () => ({ csrfCookieName: COOKIE_NAME }),
  } as unknown as ConfigService);
}

/** Bare-minimum ExecutionContext exposing the bits the guard reads. */
function ctx(
  method: string,
  cookies: Record<string, string> = {},
  headerToken?: string,
): ExecutionContext {
  const request = {
    method,
    cookies,
    header: (name: string): string | undefined =>
      name.toLowerCase() === 'x-csrf-token' ? headerToken : undefined,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = buildGuard();

  describe('safe methods are exempt', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])(
      '%s passes with no cookie and no header',
      (method: string) => {
        expect(guard.canActivate(ctx(method))).toBe(true);
      },
    );
  });

  describe('state-changing methods require a matching double-submit token', () => {
    it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
      '%s passes when the header equals the cookie',
      (method: string) => {
        expect(
          guard.canActivate(
            ctx(method, { [COOKIE_NAME]: TOKEN }, TOKEN),
          ),
        ).toBe(true);
      },
    );

    it('rejects a POST with the cookie but NO header', () => {
      expect(() =>
        guard.canActivate(ctx('POST', { [COOKIE_NAME]: TOKEN })),
      ).toThrow(ForbiddenException);
    });

    it('rejects a POST whose header differs from the cookie', () => {
      expect(() =>
        guard.canActivate(
          ctx('POST', { [COOKIE_NAME]: TOKEN }, 'b'.repeat(64)),
        ),
      ).toThrow(ForbiddenException);
    });

    it('rejects a POST whose header differs by a single character', () => {
      const almost = `${'a'.repeat(63)}b`;
      expect(() =>
        guard.canActivate(ctx('POST', { [COOKIE_NAME]: TOKEN }, almost)),
      ).toThrow(ForbiddenException);
    });

    it('rejects a POST whose header is a different LENGTH (no crash in the compare)', () => {
      expect(() =>
        guard.canActivate(ctx('POST', { [COOKIE_NAME]: TOKEN }, 'a')),
      ).toThrow(ForbiddenException);
    });

    it('rejects a POST with the header but NO cookie', () => {
      expect(() => guard.canActivate(ctx('POST', {}, TOKEN))).toThrow(
        ForbiddenException,
      );
    });

    it('rejects a POST with neither cookie nor header', () => {
      expect(() => guard.canActivate(ctx('POST'))).toThrow(ForbiddenException);
    });

    it('rejects when cookies were never parsed at all', () => {
      const request = {
        method: 'POST',
        header: () => TOKEN,
      };
      const bare = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(bare)).toThrow(ForbiddenException);
    });

    it('ignores a token stored under a different cookie name', () => {
      expect(() =>
        guard.canActivate(ctx('POST', { other_cookie: TOKEN }, TOKEN)),
      ).toThrow(ForbiddenException);
    });

    it('does not leak the expected token in the error message', () => {
      try {
        guard.canActivate(ctx('POST', { [COOKIE_NAME]: TOKEN }));
        throw new Error('expected the guard to reject');
      } catch (error) {
        expect((error as Error).message).not.toContain(TOKEN);
      }
    });
  });
});
