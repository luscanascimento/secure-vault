import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { SecurityConfig } from '../config/configuration';

/**
 * Password hashing with Argon2id — the recommended memory-hard KDF.
 *
 * Defense in depth:
 *  - argon2 generates a unique random SALT per hash automatically.
 *  - We additionally mix an application-level PEPPER (from env, NOT in the DB)
 *    before hashing, so a database-only leak is not sufficient to mount an
 *    offline attack without also compromising the application secret.
 *
 * OWASP-aligned parameters (memoryCost 19 MiB, timeCost 2, parallelism 1).
 */
@Injectable()
export class PasswordService {
  private readonly pepper: string;

  private static readonly OPTIONS: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };

  constructor(private readonly config: ConfigService) {
    this.pepper = this.config.getOrThrow<SecurityConfig>('security').passwordPepper;
  }

  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(this.applyPepper(plainPassword), PasswordService.OPTIONS);
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, this.applyPepper(plainPassword));
    } catch {
      // Malformed hash / verification error — treat as a failed login.
      return false;
    }
  }

  private applyPepper(plainPassword: string): string {
    return `${plainPassword}${this.pepper}`;
  }
}
