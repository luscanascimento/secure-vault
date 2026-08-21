import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The authenticated principal attached to the request by JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Injects the authenticated user (populated by JwtAuthGuard) into a handler:
 *   `@CurrentUser() user: AuthenticatedUser`
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as AuthenticatedUser;
  },
);
