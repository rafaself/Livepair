import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const shouldDisableHttpListen =
    process.env['DISABLE_HTTP_LISTEN'] === 'true' ||
    process.env['CODEX_SANDBOX_NETWORK_DISABLED'] === '1';
  if (shouldDisableHttpListen) {
    console.warn(
      'HTTP listen disabled (DISABLE_HTTP_LISTEN=true or CODEX_SANDBOX_NETWORK_DISABLED=1).',
    );
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }

    // Keep dev process alive when network binding is intentionally disabled.
    await new Promise<void>(() => undefined);
  }

  const port = env.port;
  const host = env.host;
  await app.listen(port, host);
  console.log(`API listening on ${host}:${port}`);
}

bootstrap();
