import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

/** Liveness probe — public, cheap, no secrets. Used by Docker healthchecks. */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
