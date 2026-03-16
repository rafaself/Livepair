import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@livepair/shared-types';

const STARTUP_TIMESTAMP = new Date().toISOString();

@Controller('health')
export class HealthController {
  private readonly startupTimestamp = STARTUP_TIMESTAMP;

  @Get()
  check(): HealthResponse {
    return { status: 'ok', timestamp: this.startupTimestamp };
  }
}
