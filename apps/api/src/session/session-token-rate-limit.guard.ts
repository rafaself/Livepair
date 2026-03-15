import {
  HttpException,
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { env } from '../config/env';

type RequestLike = {
  ip?: string | undefined;
  method?: string | undefined;
  originalUrl?: string | undefined;
  url?: string | undefined;
  socket?: {
    remoteAddress?: string | undefined;
  };
};

type RateLimitBucket = {
  count: number;
  windowStartedAt: number;
};

function resolveClientIp(request: RequestLike): string {
  return request.ip?.trim() || request.socket?.remoteAddress?.trim() || 'unknown';
}

@Injectable()
export class SessionTokenRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const clientIp = resolveClientIp(request);
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
      console.warn('[session:token-rate-limit] rejected', {
        clientIp,
        method: request.method ?? 'POST',
        path: request.originalUrl ?? request.url ?? '/session/token',
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
