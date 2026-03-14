import { create } from 'zustand';
import { createSessionStoreActions } from './sessionStore.actions';
import { buildDefaultSessionState } from './sessionStore.defaults';
import type { SessionStoreState } from './sessionStore.types';

export type {
  BackendConnectionState,
  TokenRequestState,
  SessionStoreState,
} from './sessionStore.types';

export function getTextSessionStatus(
  state: Pick<SessionStoreState, 'textSessionLifecycle'>,
): SessionStoreState['textSessionLifecycle']['status'] {
  return state.textSessionLifecycle.status;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  ...buildDefaultSessionState(),
  ...createSessionStoreActions(set),
}));
