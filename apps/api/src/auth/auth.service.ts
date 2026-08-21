import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../crypto/password.service';
import { TokenService } from './token.service';
import { PasswordStrengthService } from './password-strength.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { IssuedTokens } from './auth.types';

export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: IssuedTokens;
}

/**
 * Orchestrates registration, login, refresh and logout. Controllers stay thin;
 * all credential logic lives here, delegating hashing/crypto to dedicated
 * services.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly strength: PasswordStrengthService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    // Advisory strength check. `null` means guardsvc had no opinion (disabled,
    // slow or down) and registration continues on the DTO's own rules — a
    // scorer outage must not turn into a signup outage.
    const verdict = await this.strength.score(dto.password, [dto.email]);
    if (verdict && !verdict.acceptable) {
      throw new BadRequestException({
        message: verdict.warning ?? 'This password is too easy to guess.',
        suggestions: verdict.suggestions,
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash },
    });

    const tokens = await this.tokens.issueTokens(user);
    return { user: this.toPublic(user), tokens };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Generic message + always-run verify to avoid user-enumeration and
    // timing side channels.
    const passwordOk = user
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : await this.passwords.verify(DUMMY_HASH, dto.password);

    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const tokens = await this.tokens.issueTokens(user);
    return { user: this.toPublic(user), tokens };
  }

  async refresh(rawRefreshToken: string | undefined): Promise<IssuedTokens> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('No refresh token supplied.');
    }
    return this.tokens.rotate(rawRefreshToken);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) {
      await this.tokens.revoke(rawRefreshToken);
    }
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Account not found.');
    }
    return this.toPublic(user);
  }

  private toPublic(user: {
    id: string;
    email: string;
    createdAt: Date;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

/**
 * A valid Argon2id hash of a random string, used to equalize timing when the
 * email does not exist (mitigates user-enumeration via response time).
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zdGF0aWMtc2FsdA$Zm9yLXRpbWluZy1lcXVhbGl6YXRpb24taGFzaA';
