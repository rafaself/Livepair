import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
} from '@nestjs/common';
import { SESSION_TOKEN_AUTH_HEADER_NAME } from '@livepair/shared-types';
import { env } from '../config/env';
import { ObservabilityService } from '../observability/observability.service';
import {
  resolveSessionTokenRequestContext,
  type SessionTokenRequestLike,
} from './session-token-request-context';

type RequestLike = {
  ip?: string | undefined;
  method?: string | undefined;
  originalUrl?: string | undefined;
  url?: string | undefined;
  socket?: {
    remoteAddress?: string | undefined;
  };
  headers?: Record<string, string | string[] | undefined>;
};

function readHeader(
  request: RequestLike,
  headerName: string,
): string | undefined {
  const value = request.headers?.[headerName];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

@Injectable()
export class SessionTokenAuthGuard implements CanActivate {
  constructor(
    private readonly observabilityService: ObservabilityService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const requestContext = resolveSessionTokenRequestContext(
      request as SessionTokenRequestLike,
    );

    if (!env.sessionTokenAuthSecret) {
      this.observabilityService.recordSessionTokenRequest({
        outcome: 'service_unavailable',
      });
      console.error('[session:token] auth unavailable', {
        ...requestContext,
        reason: 'auth_secret_missing',
      });
      throw new ServiceUnavailableException(
        'Session token auth secret is not configured',
      );
    }

    const credential = readHeader(request, SESSION_TOKEN_AUTH_HEADER_NAME);

    if (typeof credential !== 'string' || credential.trim().length === 0) {
      this.observabilityService.recordSessionTokenRequest({
        outcome: 'auth_required',
      });
      console.warn('[session:token] auth rejected', {
        ...requestContext,
        reason: 'missing_credential',
      });
      throw new UnauthorizedException('Session token credential is required');
    }

    if (credential !== env.sessionTokenAuthSecret) {
      this.observabilityService.recordSessionTokenRequest({
        outcome: 'auth_invalid',
      });
      console.warn('[session:token] auth rejected', {
        ...requestContext,
        reason: 'invalid_credential',
      });
      throw new ForbiddenException('Session token credential is invalid');
    }

    return true;
  }
}
