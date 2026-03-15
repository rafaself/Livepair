import {
  HttpException,
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { env } from '../config/env';
import { ObservabilityService } from '../observability/observability.service';
import {
  resolveSessionTokenRequestContext,
  type SessionTokenRequestLike,
} from './session-token-request-context';

type RateLimitBucket = {
  count: number;
  windowStartedAt: number;
};

@Injectable()
export class SessionTokenRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly observabilityService: ObservabilityService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SessionTokenRequestLike>();
    const requestContext = resolveSessionTokenRequestContext(request);
    const clientIp = requestContext.clientIp;
    const now = Date.now();
    const windowMs = env.sessionTokenRateLimitWindowMs;
    const maxRequests = env.sessionTokenRateLimitMaxRequests;
    const currentBucket = this.buckets.get(clientIp);

    if (!currentBucket || now >= currentBucket.windowStartedAt + windowMs) {
      this.buckets.set(clientIp, {
        count: 1,
        windowStartedAt: now,
      });

      return true;
    }

    if (currentBucket.count >= maxRequests) {
      this.observabilityService.recordSessionTokenRequest({
        outcome: 'rate_limited',
      });
      console.warn('[session:token] rate limited', {
        ...requestContext,
        limit: maxRequests,
        windowMs,
        requestsInWindow: currentBucket.count,
        windowStartedAt: new Date(currentBucket.windowStartedAt).toISOString(),
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Session token rate limit exceeded',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    currentBucket.count += 1;
    this.buckets.set(clientIp, currentBucket);

    return true;
  }
}
