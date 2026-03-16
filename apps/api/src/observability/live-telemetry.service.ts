import { Injectable } from '@nestjs/common';
import type { ReportLiveTelemetryDto } from './dto/report-live-telemetry.dto';

@Injectable()
export class LiveTelemetryService {
  acceptBatch(_events: ReportLiveTelemetryDto['events']): void {
    // Intentionally no-op for Wave 3: auth + validation + acceptance only.
  }
}
