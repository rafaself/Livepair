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

type RequestLike = {
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
  canActivate(context: ExecutionContext): boolean {
    if (!env.sessionTokenAuthSecret) {
      throw new ServiceUnavailableException(
        'Session token auth secret is not configured',
      );
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const credential = readHeader(request, SESSION_TOKEN_AUTH_HEADER_NAME);

    if (typeof credential !== 'string' || credential.trim().length === 0) {
      throw new UnauthorizedException('Session token credential is required');
    }

    if (credential !== env.sessionTokenAuthSecret) {
      throw new ForbiddenException('Session token credential is invalid');
    }

    return true;
  }
}
