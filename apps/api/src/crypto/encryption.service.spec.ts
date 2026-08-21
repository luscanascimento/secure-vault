import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { EncryptionService } from './encryption.service';

/**
 * Minimal ConfigService stand-in: EncryptionService only ever asks for the
 * `security` namespace.
 */
function build(noteEncryptionKey: string): EncryptionService {
  return new EncryptionService({
    getOrThrow: () => ({ noteEncryptionKey }),
  } as unknown as ConfigService);
}

const VALID_KEY = randomBytes(32).toString('base64');

describe('EncryptionService', () => {
  describe('key validation at construction (boot)', () => {
    it('accepts a base64 key that decodes to exactly 32 bytes', () => {
      expect(() => build(VALID_KEY)).not.toThrow();
    });

    it.each([16, 24, 31, 33, 64])(
      'refuses a %i-byte key',
      (bytes: number) => {
        expect(() => build(randomBytes(bytes).toString('base64'))).toThrow(
          InternalServerErrorException,
        );
      },
    );

    it('refuses an empty key', () => {
      expect(() => build('')).toThrow(
        /must decode to exactly 32 bytes/,
      );
    });
  });

  describe('encrypt / decrypt round-trip', () => {
    const service = build(VALID_KEY);

    it.each([
      'hello vault',
      '',
      'multi\nline\tnote with émojis 🔐 and ünicode',
      'x'.repeat(50_000),
    ])('returns the exact plaintext it was given', (plaintext: string) => {
      expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
    });

    it('emits a 12-byte IV and a 16-byte GCM tag', () => {
      const payload = service.encrypt('some note body');
      expect(Buffer.from(payload.iv, 'base64')).toHaveLength(12);
      expect(Buffer.from(payload.tag, 'base64')).toHaveLength(16);
    });

    it('never stores the plaintext in the ciphertext', () => {
      const payload = service.encrypt('sensitive');
      expect(
        Buffer.from(payload.ciphertext, 'base64').toString('utf8'),
      ).not.toContain('sensitive');
    });
  });

  describe('IV uniqueness', () => {
    it('uses a fresh IV (and thus a fresh ciphertext) for identical plaintext', () => {
      const service = build(VALID_KEY);
      const a = service.encrypt('same body');
      const b = service.encrypt('same body');

      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext);
      expect(service.decrypt(a)).toBe(service.decrypt(b));
    });

    it('does not repeat an IV across many encryptions', () => {
      const service = build(VALID_KEY);
      const ivs = new Set(
        Array.from({ length: 500 }, () => service.encrypt('body').iv),
      );
      expect(ivs.size).toBe(500);
    });
  });

  describe('authenticated encryption — tampering is rejected', () => {
    const service = build(VALID_KEY);

    /** Flips the first byte of a base64 field. */
    function flipFirstByte(base64: string): string {
      const buf = Buffer.from(base64, 'base64');
      buf[0] ^= 0xff;
      return buf.toString('base64');
    }

    it('throws when the auth tag was altered', () => {
      const payload = service.encrypt('top secret');
      expect(() =>
        service.decrypt({ ...payload, tag: flipFirstByte(payload.tag) }),
      ).toThrow();
    });

    it('throws when the ciphertext was altered', () => {
      const payload = service.encrypt('top secret');
      expect(() =>
        service.decrypt({
          ...payload,
          ciphertext: flipFirstByte(payload.ciphertext),
        }),
      ).toThrow();
    });

    it('throws when the IV was altered', () => {
      const payload = service.encrypt('top secret');
      expect(() =>
        service.decrypt({ ...payload, iv: flipFirstByte(payload.iv) }),
      ).toThrow();
    });

    it('throws when the tag belongs to a different record', () => {
      const a = service.encrypt('note A');
      const b = service.encrypt('note B');
      expect(() => service.decrypt({ ...a, tag: b.tag })).toThrow();
    });

    it('throws when decrypting under a different key', () => {
      const other = build(randomBytes(32).toString('base64'));
      expect(() => other.decrypt(service.encrypt('top secret'))).toThrow();
    });
  });

  describe('safeEqual', () => {
    it('is true only for identical strings', () => {
      expect(EncryptionService.safeEqual('abc123', 'abc123')).toBe(true);
      expect(EncryptionService.safeEqual('abc123', 'abc124')).toBe(false);
    });

    it('returns false (instead of throwing) on a length mismatch', () => {
      expect(EncryptionService.safeEqual('short', 'much-longer')).toBe(false);
    });
  });
});
