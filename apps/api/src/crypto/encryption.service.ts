import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { SecurityConfig } from '../config/configuration';

/** The three parts we persist to reconstruct an authenticated ciphertext. */
export interface EncryptedPayload {
  /** Base64 initialization vector (12 bytes, unique per record). */
  iv: string;
  /** Base64 GCM authentication tag (16 bytes). */
  tag: string;
  /** Base64 ciphertext. */
  ciphertext: string;
}

/**
 * Authenticated encryption at rest with AES-256-GCM.
 *
 * - 256-bit key loaded from `NOTE_ENCRYPTION_KEY` (base64, 32 bytes).
 * - A fresh random 96-bit IV per record (never reused with the same key).
 * - The GCM auth tag guarantees integrity + authenticity; decryption throws if
 *   the ciphertext or tag was tampered with.
 *
 * Key management & rotation are documented in the root README.
 */
@Injectable()
export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_BYTES = 12;
  private static readonly KEY_BYTES = 32;

  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const security = this.config.getOrThrow<SecurityConfig>('security');
    const key = Buffer.from(security.noteEncryptionKey, 'base64');
    if (key.length !== EncryptionService.KEY_BYTES) {
      throw new InternalServerErrorException(
        'NOTE_ENCRYPTION_KEY must decode to exactly 32 bytes.',
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = randomBytes(EncryptionService.IV_BYTES);
    const cipher = createCipheriv(EncryptionService.ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    const decipher = createDecipheriv(
      EncryptionService.ALGORITHM,
      this.key,
      iv,
    );
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Constant-time comparison helper (used for token-hash checks). */
  static safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
