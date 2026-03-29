import { isTokenValidForReconnect } from './voiceSessionToken';
import { asErrorDetail } from '../../core/runtimeUtils';
import type { SessionEvent } from '../../core/session.types';
import type { TransportKind } from '../../transport/transport.types';
import type {
  VoiceSessionDurabilityState,
} from '../voice.types';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import type { TokenRequestState, BackendConnectionState } from '../../../store/sessionStore';

type TokenStoreApi = {
  getState: () => {
    setTokenRequestState: (state: TokenRequestState) => void;
    setBackendState: (state: BackendConnectionState) => void;
  };
};

export type VoiceTokenManager = {
  get: () => CreateEphemeralTokenResponse | null;
  set: (token: CreateEphemeralTokenResponse | null) => void;
  clear: () => void;
  request: (operationId: number) => Promise<CreateEphemeralTokenResponse | null>;
  refresh: (
    operationId: number,
    detail: string,
  ) => Promise<CreateEphemeralTokenResponse | null>;
  syncDurabilityState: (
    token: CreateEphemeralTokenResponse | null,
    patch?: Partial<VoiceSessionDurabilityState>,
  ) => void;
};

export function createVoiceTokenManager(
  store: TokenStoreApi,
  requestSessionToken: (params: Record<string, never>) => Promise<CreateEphemeralTokenResponse>,
  isCurrentSessionOperation: (id: number) => boolean,
  setVoiceSessionDurability: (patch: Partial<VoiceSessionDurabilityState>) => void,
  recordSessionEvent: (event: SessionEvent) => void,
  onError: (detail: string) => void,
  liveAdapterKey: TransportKind,
): VoiceTokenManager {
  let activeVoiceToken: CreateEphemeralTokenResponse | null = null;

  const syncDurabilityState = (
    token: CreateEphemeralTokenResponse | null,
    patch: Partial<VoiceSessionDurabilityState> = {},
  ): void => {
    setVoiceSessionDurability({
      compressionEnabled: true,
      tokenValid: isTokenValidForReconnect(token),
      tokenRefreshing: false,
      tokenRefreshFailed: false,
      expireTime: token?.expireTime ?? null,
      newSessionExpireTime: token?.newSessionExpireTime ?? null,
      lastDetail: null,
      ...patch,
    });
  };

  const request = async (
    operationId: number,
  ): Promise<CreateEphemeralTokenResponse | null> => {
    const s = store.getState();
    s.setTokenRequestState('loading');
    recordSessionEvent({ type: 'session.token.request.started' });

    try {
      const token = await requestSessionToken({});

      if (!isCurrentSessionOperation(operationId)) {
        return null;
      }

      s.setTokenRequestState('success');
      s.setBackendState('connected');
      recordSessionEvent({
        type: 'session.token.request.succeeded',
        transport: liveAdapterKey,
      });
      activeVoiceToken = token;
      syncDurabilityState(token);
      return token;
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return null;
      }

      const detail = asErrorDetail(error, 'Failed to request voice session token');
      s.setTokenRequestState('error');
      s.setBackendState('failed');
      recordSessionEvent({ type: 'session.token.request.failed', detail });
      setVoiceSessionDurability({
        tokenValid: false,
        tokenRefreshing: false,
        tokenRefreshFailed: true,
        lastDetail: detail,
      });
      onError(detail);
      return null;
    }
  };

  const refresh = async (
    operationId: number,
    detail: string,
  ): Promise<CreateEphemeralTokenResponse | null> => {
    setVoiceSessionDurability({
      tokenRefreshing: true,
      tokenRefreshFailed: false,
      lastDetail: detail,
    });

    try {
      const token = await requestSessionToken({});

      if (!isCurrentSessionOperation(operationId)) {
        return null;
      }

      activeVoiceToken = token;
      syncDurabilityState(token, {
        tokenRefreshing: false,
        lastDetail: detail,
      });
      return token;
    } catch (error) {
      const refreshDetail = asErrorDetail(error, 'Failed to refresh voice session token');

      if (!isCurrentSessionOperation(operationId)) {
        return null;
      }

      setVoiceSessionDurability({
        tokenValid: false,
        tokenRefreshing: false,
        tokenRefreshFailed: true,
        lastDetail: refreshDetail,
      });
      return null;
    }
  };

  return {
    get: () => activeVoiceToken,
    set: (token) => {
      activeVoiceToken = token;
    },
    clear: () => {
      activeVoiceToken = null;
    },
    request,
    refresh,
    syncDurabilityState,
  };
}
