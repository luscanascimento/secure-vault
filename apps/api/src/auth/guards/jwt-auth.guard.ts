import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { JwtConfig } from '../../config/configuration';
import type { AccessTokenPayload } from '../auth.types';

/**
 * Global guard that validates the short-lived access token from the
 * `Authorization: Bearer <token>` header and attaches the principal to the
 * request. Routes marked `@Public()` bypass it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly accessSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<JwtConfig>('jwt').accessSecret;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(request);
    if (!token) {
      throw new UnauthorizedException('Missing access token.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: this.accessSecret },
      );
      const user: AuthenticatedUser = { id: payload.sub, email: payload.email };
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }

  private extractBearer(request: Request): string | null {
    const header = request.header('authorization');
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
