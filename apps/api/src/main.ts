import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { env, validateApiRuntimeEnv } from './config/env';

function logStartupValidationFailure(error: unknown): void {
  console.error('[api:startup] invalid configuration', {
    errorMessage: error instanceof Error ? error.message : 'Unknown error',
    errorName: error instanceof Error ? error.name : 'Error',
  });
}

try {
  validateApiRuntimeEnv();
} catch (error) {
  logStartupValidationFailure(error);
  throw error;
}

function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  // Requests without an Origin header are not subject to the browser CORS
  // protocol (same-origin or non-browser callers), so they bypass the
  // allowlist. A defined-but-empty value, however, is suspicious and is
  // treated as a cross-origin request that must match the allowlist.
  if (typeof origin === 'undefined') {
    return true;
  }

  return allowedOrigins.includes(origin);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.enableCors({
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin, env.corsAllowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
  });

  if (env.disableHttpListen) {
    console.warn('[api:startup] HTTP listen disabled', {
      disableHttpListen: true,
      host: env.host,
      port: env.port,
    });
    if (env.nodeEnv === 'test') {
      return;
    }

    // Keep dev process alive when network binding is intentionally disabled.
    await new Promise<void>(() => undefined);
    return;
  }

  await app.listen(env.port, env.host);
  console.info('[api:startup] listening', {
    corsAllowedOrigins: env.corsAllowedOrigins,
    host: env.host,
    nodeEnv: env.nodeEnv,
    port: env.port,
    trustProxy: 1,
  });
}

void bootstrap().catch((error) => {
  console.error('[api:startup] bootstrap failed', {
    errorMessage: error instanceof Error ? error.message : 'Unknown error',
    errorName: error instanceof Error ? error.name : 'Error',
    host: env.host,
    port: env.port,
  });
  process.exitCode = 1;
});
