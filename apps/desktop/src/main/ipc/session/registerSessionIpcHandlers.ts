import { ipcMain } from 'electron';
import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  HealthResponse,
} from '@livepair/shared-types';
import { IPC_CHANNELS } from '../../../shared';
import { createBackendClient } from '../../backend/backendClient';
import { isCreateEphemeralTokenRequest } from '../validators/sessionValidators';

type SessionBackendClient = {
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    request: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
};

type RegisterSessionIpcHandlersOptions = {
  fetchImpl?: typeof fetch | undefined;
};

function createSessionBackendClient({
  fetchImpl = fetch,
}: RegisterSessionIpcHandlersOptions): SessionBackendClient {
  return createBackendClient({
    fetchImpl,
  });
}

export function registerSessionIpcHandlers(
  options: RegisterSessionIpcHandlersOptions,
): void {
  const backendClient = createSessionBackendClient(options);

  ipcMain.handle(IPC_CHANNELS.checkHealth, async () => {
    return backendClient.checkHealth();
  });

  ipcMain.handle(IPC_CHANNELS.requestSessionToken, async (_event, req: unknown) => {
    if (!isCreateEphemeralTokenRequest(req)) {
      throw new Error('Invalid token request payload');
    }

    return backendClient.requestSessionToken(req);
  });
}
