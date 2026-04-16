import {
  HttpException,
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { env } from '../config/env';
import {
  resolveSessionTokenRequestContext,
  type SessionTokenRequestLike,
} from '../session/session-token-request-context';

type RateLimitBucket = {
  count: number;
  windowStartedAt: number;
};

const RATE_LIMIT_BUCKET_MAX_SIZE = 10_000;

@Injectable()
export class ProjectKnowledgeRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private lastSweepAt = 0;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SessionTokenRequestLike>();
    const requestContext = resolveSessionTokenRequestContext(request);
    const clientIp = requestContext.clientIp;
    const now = Date.now();
    const windowMs = env.projectKnowledgeRateLimitWindowMs;
    const maxRequests = env.projectKnowledgeRateLimitMaxRequests;
    this.sweepExpiredBuckets(now, windowMs);
    const currentBucket = this.buckets.get(clientIp);

    if (!currentBucket || now >= currentBucket.windowStartedAt + windowMs) {
      this.buckets.set(clientIp, {
        count: 1,
        windowStartedAt: now,
      });

      return true;
    }

    if (currentBucket.count >= maxRequests) {
      console.warn('[project-knowledge] rate limited', {
        ...requestContext,
        limit: maxRequests,
        windowMs,
        requestsInWindow: currentBucket.count,
        windowStartedAt: new Date(currentBucket.windowStartedAt).toISOString(),
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Project knowledge rate limit exceeded',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    currentBucket.count += 1;
    this.buckets.set(clientIp, currentBucket);

    return true;
  }

  private sweepExpiredBuckets(now: number, windowMs: number): void {
    const dueForTimeSweep = now >= this.lastSweepAt + windowMs;
    const dueForSizeSweep = this.buckets.size > RATE_LIMIT_BUCKET_MAX_SIZE;

    if (!dueForTimeSweep && !dueForSizeSweep) {
      return;
    }

    for (const [ip, bucket] of this.buckets) {
      if (now >= bucket.windowStartedAt + windowMs) {
        this.buckets.delete(ip);
      }
    }

    this.lastSweepAt = now;
  }
}
