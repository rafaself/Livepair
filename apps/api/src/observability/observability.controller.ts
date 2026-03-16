import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ReportLiveTelemetryDto } from './dto/report-live-telemetry.dto';
import { LiveTelemetryAuthGuard } from './live-telemetry-auth.guard';
import { LiveTelemetryService } from './live-telemetry.service';
import { ObservabilityService } from './observability.service';

type ResponseLike = {
  setHeader(name: string, value: string): void;
};

@Controller()
export class ObservabilityController {
  constructor(
    private readonly observabilityService: ObservabilityService,
    private readonly liveTelemetryService: LiveTelemetryService,
  ) {}

  @Get('metrics')
  async getMetrics(@Res({ passthrough: true }) response: ResponseLike): Promise<string> {
    response.setHeader('Content-Type', this.observabilityService.contentType);
    return this.observabilityService.getMetrics();
  }

  @Post('observability/live-telemetry')
  @HttpCode(202)
  @UseGuards(LiveTelemetryAuthGuard)
  reportLiveTelemetry(@Body() dto: ReportLiveTelemetryDto): void {
    this.liveTelemetryService.acceptBatch(dto.events);
  }
}
