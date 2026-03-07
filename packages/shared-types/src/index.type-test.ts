import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  HealthResponse,
} from './index';

type Assert<T extends true> = T;
type IsExact<T, U> =
  (<G>() => G extends T ? 1 : 2) extends
  (<G>() => G extends U ? 1 : 2) ? true : false;

type _HealthShape = Assert<
  IsExact<HealthResponse, { status: 'ok'; timestamp: string }>
>;
type _RequestShape = Assert<
  IsExact<CreateEphemeralTokenRequest, { sessionId?: string }>
>;
type _ResponseToken = Assert<
  IsExact<CreateEphemeralTokenResponse['token'], string>
>;
type _ResponseExpiresAt = Assert<
  IsExact<CreateEphemeralTokenResponse['expiresAt'], string>
>;
type _ResponseIsStubLiteral = Assert<
  IsExact<CreateEphemeralTokenResponse['isStub'], true>
>;

export const typeAssertionsAreCompiled = true;
