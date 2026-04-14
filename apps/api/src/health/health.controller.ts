import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@livepair/shared-types';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    // Return the time of the request rather than process startup, so the
    // response cannot be used to infer process uptime.
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
