import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

/**
 * Liveness probe used by the deploy pipeline (and uptime checks) to confirm the
 * process is up and routing works. Marked @Public so it bypasses JwtAuthGuard /
 * ScopeGuard. Intentionally does NOT touch the DB — this is liveness, not
 * readiness; a brief DB blip should not flap the health gate.
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: string; ts: string } {
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
