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
import {
  resolveSessionTokenRequestContext,
  type SessionTokenRequestLike,
} from '../session/session-token-request-context';

type RequestLike = SessionTokenRequestLike & {
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
export class ChatMemoryAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const requestContext = resolveSessionTokenRequestContext(request);

    if (!env.sessionTokenAuthSecret) {
      console.error('[chat-memory] auth unavailable', {
        ...requestContext,
        reason: 'auth_secret_missing',
      });
      throw new ServiceUnavailableException('Chat memory auth secret is not configured');
    }

    const credential = readHeader(request, SESSION_TOKEN_AUTH_HEADER_NAME);

    if (typeof credential !== 'string' || credential.trim().length === 0) {
      console.warn('[chat-memory] auth rejected', {
        ...requestContext,
        reason: 'missing_credential',
      });
      throw new UnauthorizedException('Chat memory credential is required');
    }

    if (credential !== env.sessionTokenAuthSecret) {
      console.warn('[chat-memory] auth rejected', {
        ...requestContext,
        reason: 'invalid_credential',
      });
      throw new ForbiddenException('Chat memory credential is invalid');
    }

    return true;
  }
}
