import { SetMetadata } from '@nestjs/common';

/** Metadata key marking a route as not requiring authentication. */
export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a route out of the global JWT guard (e.g. login/register). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
