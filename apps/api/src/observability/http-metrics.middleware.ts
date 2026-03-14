import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ObservabilityService } from './observability.service';

type NextFunctionLike = () => void;

type RoutedRequest = {
  method: string;
  route?: {
    path?: string;
  };
  baseUrl: string;
};

type ResponseLike = {
  statusCode: number;
  on(event: 'finish', listener: () => void): void;
};

function getRouteLabel(request: RoutedRequest): string {
  const routePath = request.route?.path;

  if (typeof routePath !== 'string') {
    return 'unmatched';
  }

  if (routePath.includes('*')) {
    return 'unmatched';
  }

  return `${request.baseUrl}${routePath === '/' ? '' : routePath}`;
}

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly observabilityService: ObservabilityService) {}

  use(request: RoutedRequest, response: ResponseLike, next: NextFunctionLike): void {
    const startTime = process.hrtime.bigint();

    response.on('finish', () => {
      const durationSeconds =
        Number(process.hrtime.bigint() - startTime) / 1_000_000_000;

      this.observabilityService.recordHttpRequest(
        {
          method: request.method,
          route: getRouteLabel(request as RoutedRequest),
          status_code: String(response.statusCode),
        },
        durationSeconds,
      );
    });

    next();
  }
}
