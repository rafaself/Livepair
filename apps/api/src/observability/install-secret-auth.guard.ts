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
import { ObservabilityService } from './observability.service';

type RequestLike = SessionTokenRequestLike & {
  headers?: Record<string, string | string[] | undefined>;
};

type ProtectedRouteDescriptor = {
  serviceUnavailableMessage: string;
  invalidCredentialMessage: string;
  missingCredentialMessage: string;
  recordSessionMetric: boolean;
  scope: string;
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

function normalizePath(path: string): string {
  if (path.startsWith('/')) {
    return path;
  }

  return `/${path}`;
}

function describeProtectedRoute(path: string): ProtectedRouteDescriptor {
  const normalizedPath = normalizePath(path);

  if (normalizedPath.startsWith('/session/token')) {
    return {
      scope: 'session:token',
      recordSessionMetric: true,
      serviceUnavailableMessage: 'Session token auth secret is not configured',
      missingCredentialMessage: 'Session token credential is required',
      invalidCredentialMessage: 'Session token credential is invalid',
    };
  }

  if (normalizedPath.startsWith('/chat-memory')) {
    return {
      scope: 'chat-memory',
      recordSessionMetric: false,
      serviceUnavailableMessage: 'Chat memory auth secret is not configured',
      missingCredentialMessage: 'Chat memory credential is required',
      invalidCredentialMessage: 'Chat memory credential is invalid',
    };
  }

  if (normalizedPath.startsWith('/observability/live-telemetry')) {
    return {
      scope: 'observability:live-telemetry',
      recordSessionMetric: false,
      serviceUnavailableMessage: 'Live telemetry auth secret is not configured',
      missingCredentialMessage: 'Session token credential is required',
      invalidCredentialMessage: 'Session token credential is invalid',
    };
  }

  if (normalizedPath.startsWith('/project-knowledge/search')) {
    return {
      scope: 'project-knowledge',
      recordSessionMetric: false,
      serviceUnavailableMessage: 'Project knowledge auth secret is not configured',
      missingCredentialMessage: 'Project knowledge credential is required',
      invalidCredentialMessage: 'Project knowledge credential is invalid',
    };
  }

  if (normalizedPath.startsWith('/metrics')) {
    return {
      scope: 'observability:metrics',
      recordSessionMetric: false,
      serviceUnavailableMessage: 'Metrics auth secret is not configured',
      missingCredentialMessage: 'Metrics credential is required',
      invalidCredentialMessage: 'Metrics credential is invalid',
    };
  }

  return {
    scope: 'install-secret',
    recordSessionMetric: false,
    serviceUnavailableMessage: 'Install auth secret is not configured',
    missingCredentialMessage: 'Install credential is required',
    invalidCredentialMessage: 'Install credential is invalid',
  };
}

@Injectable()
export class InstallSecretAuthGuard implements CanActivate {
  constructor(
    private readonly observabilityService: ObservabilityService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const requestContext = resolveSessionTokenRequestContext(request);
    const route = describeProtectedRoute(requestContext.path);

    if (!env.sessionTokenAuthSecret) {
      if (route.recordSessionMetric) {
        this.observabilityService.recordSessionTokenRequest({
          outcome: 'service_unavailable',
        });
      }

      console.error(`[${route.scope}] auth unavailable`, {
        ...requestContext,
        reason: 'auth_secret_missing',
      });
      throw new ServiceUnavailableException(route.serviceUnavailableMessage);
    }

    const credential = readHeader(request, SESSION_TOKEN_AUTH_HEADER_NAME);

    if (typeof credential !== 'string' || credential.trim().length === 0) {
      if (route.recordSessionMetric) {
        this.observabilityService.recordSessionTokenRequest({
          outcome: 'auth_required',
        });
      }

      console.warn(`[${route.scope}] auth rejected`, {
        ...requestContext,
        reason: 'missing_credential',
      });
      throw new UnauthorizedException(route.missingCredentialMessage);
    }

    if (credential !== env.sessionTokenAuthSecret) {
      if (route.recordSessionMetric) {
        this.observabilityService.recordSessionTokenRequest({
          outcome: 'auth_invalid',
        });
      }

      console.warn(`[${route.scope}] auth rejected`, {
        ...requestContext,
        reason: 'invalid_credential',
      });
      throw new ForbiddenException(route.invalidCredentialMessage);
    }

    return true;
  }
}
