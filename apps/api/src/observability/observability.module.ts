import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';

@Module({
  controllers: [ObservabilityController],
  providers: [ObservabilityService, HttpMetricsMiddleware],
  exports: [ObservabilityService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });
  }
}
