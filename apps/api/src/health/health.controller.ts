import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

/**
 * Liveness probe used by the deploy pipeline (and uptime checks) to confirm the
 * process is up and routing works. Marked @Public so it bypasses JwtAuthGuard /
 * ScopeGuard. Intentionally does NOT touch the DB — this is liveness, not
 * readiness; a brief DB blip should not flap the health gate.
 *
 * VERSION_NEUTRAL keeps this off the /v1 version prefix so the deploy pipeline's liveness
 * probe stays at /health (not /v1/health).
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Public()
  @Get()
  check(): { status: string; ts: string } {
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
