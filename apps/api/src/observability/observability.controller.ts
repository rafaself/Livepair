import { Controller, Get, Res } from '@nestjs/common';
import { ObservabilityService } from './observability.service';

type ResponseLike = {
  setHeader(name: string, value: string): void;
};

@Controller()
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('metrics')
  async getMetrics(@Res({ passthrough: true }) response: ResponseLike): Promise<string> {
    response.setHeader('Content-Type', this.observabilityService.contentType);
    return this.observabilityService.getMetrics();
  }
}
