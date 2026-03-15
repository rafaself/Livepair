import { Injectable, type NestMiddleware } from '@nestjs/common';

type ResponseLike = {
  setHeader(name: string, value: string): void;
};

@Injectable()
export class SessionTokenCacheControlMiddleware implements NestMiddleware {
  use(
    _request: unknown,
    response: ResponseLike,
    next: () => void,
  ): void {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    next();
  }
}
