import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Augment Express' Request so `request.user` is strongly typed everywhere,
 * avoiding `any` when reading the JWT principal.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
