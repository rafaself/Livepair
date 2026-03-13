import type { LiveConnectMode } from '../core/session.types';
import type { GeminiLiveSdkSession } from './geminiLiveSdkClient';

export type GeminiLiveTransportState = {
  session: GeminiLiveSdkSession | null;
  hasCompletedSetup: boolean;
  hasReceivedGoAway: boolean;
  closingByClient: boolean;
  hasPendingTextResponse: boolean;
  disconnectResolver: (() => void) | null;
  activeMode: LiveConnectMode | null;
  hasOpenAudioStream: boolean;
};

export function createGeminiLiveTransportState(): GeminiLiveTransportState {
  return {
    session: null,
    hasCompletedSetup: false,
    hasReceivedGoAway: false,
    closingByClient: false,
    hasPendingTextResponse: false,
    disconnectResolver: null,
    activeMode: null,
    hasOpenAudioStream: false,
  };
}

type ResetGeminiLiveTransportStateOptions = {
  hasReceivedGoAway?: boolean;
  closingByClient?: boolean;
  disconnectResolver?: (() => void) | null;
};

export function resetGeminiLiveTransportState(
  state: GeminiLiveTransportState,
  options: ResetGeminiLiveTransportStateOptions = {},
): void {
  state.session = null;
  state.hasCompletedSetup = false;
  state.hasReceivedGoAway = options.hasReceivedGoAway ?? state.hasReceivedGoAway;
  state.closingByClient = options.closingByClient ?? state.closingByClient;
  state.hasPendingTextResponse = false;
  state.disconnectResolver = options.disconnectResolver ?? state.disconnectResolver;
  state.activeMode = null;
  state.hasOpenAudioStream = false;
}
