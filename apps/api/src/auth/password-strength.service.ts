import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PasswordStrengthConfig } from '../config/configuration';

/** The subset of guardsvc's `POST /score` response this API acts on. */
export interface StrengthVerdict {
  score: number;
  acceptable: boolean;
  warning?: string;
  suggestions: string[];
}

/**
 * Client for guardsvc, the external password-strength scorer.
 *
 * This is advisory, never load-bearing. The rules that must always hold live in
 * `RegisterDto` (length + character classes) and in Argon2id hashing; guardsvc
 * only adds the checks a regex cannot do — breach wordlists, keyboard walks,
 * the user's own email inside their password.
 *
 * So the client fails OPEN. A timeout, a connection error, a 5xx, or an unset
 * `GUARDSVC_URL` all return `null` and registration proceeds. A password scorer
 * being down must never be able to stop people from signing up.
 *
 * Privacy: the password is sent over the wire to guardsvc and nowhere else. It
 * is never logged here, not on the success path and not in an error handler —
 * that is the one place this side could undo guardsvc's own guarantee.
 */
@Injectable()
export class PasswordStrengthService {
  private readonly logger = new Logger(PasswordStrengthService.name);
  private readonly config: PasswordStrengthConfig;

  // Minimal circuit breaker: after `failureThreshold` consecutive failures,
  // stop calling for `openMs` so a dead dependency costs one timeout per
  // window instead of one per registration.
  // ponytail: a counter and a timestamp, single process. If the API is ever
  // scaled out and the breaker state needs to be shared, that is what a real
  // breaker library (or a Redis-backed one) is for.
  private static readonly failureThreshold = 3;
  private static readonly openMs = 30_000;
  private failures = 0;
  private openUntil = 0;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<PasswordStrengthConfig>('passwordStrength');
    if (!this.config.url) {
      this.logger.log('GUARDSVC_URL is not set — password strength scoring is disabled.');
    }
  }

  /**
   * Scores a password. Returns `null` when no verdict could be obtained, which
   * callers must treat as "no objection", not as "weak".
   *
   * @param userInputs values the user already gave us (email, display name).
   *        guardsvc tokenizes them, so passing the raw email is enough.
   */
  async score(password: string, userInputs: string[] = []): Promise<StrengthVerdict | null> {
    if (!this.config.url || Date.now() < this.openUntil) {
      return null;
    }

    try {
      const response = await fetch(`${this.config.url}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, userInputs }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        // A 4xx means this client and guardsvc disagree about the contract; a
        // 5xx means guardsvc is unwell. Neither is the user's problem.
        this.recordFailure(`guardsvc responded ${response.status}`);
        return null;
      }

      const verdict = (await response.json()) as StrengthVerdict;
      this.failures = 0;
      return verdict;
    } catch (error) {
      // Only the error's own message is logged. The request body is never
      // touched here, because it holds the password.
      this.recordFailure(error instanceof Error ? error.message : 'unknown error');
      return null;
    }
  }

  private recordFailure(reason: string): void {
    this.failures += 1;
    if (this.failures >= PasswordStrengthService.failureThreshold) {
      this.openUntil = Date.now() + PasswordStrengthService.openMs;
      this.failures = 0;
      this.logger.warn(
        `guardsvc unreachable (${reason}); skipping strength checks for ${
          PasswordStrengthService.openMs / 1000
        }s. Registration is unaffected.`,
      );
      return;
    }
    this.logger.warn(`guardsvc call failed (${reason}); allowing registration to continue.`);
  }
}
