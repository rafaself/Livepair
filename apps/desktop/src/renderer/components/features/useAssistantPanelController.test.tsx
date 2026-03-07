import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBackendHealth, requestSessionToken } from '../../api/backend';
import { UiStoreProvider, useUiStore } from '../../store/uiStore';
import { useAssistantPanelController } from './useAssistantPanelController';

vi.mock('../../api/backend', () => ({
  checkBackendHealth: vi.fn(),
  requestSessionToken: vi.fn(),
}));

function HookHarness(): JSX.Element {
  const { togglePanel } = useUiStore();
  const controller = useAssistantPanelController();

  return (
    <div>
      <output aria-label="backend-label">{controller.backendLabel}</output>
      <output aria-label="token-feedback">{controller.tokenFeedback ?? 'none'}</output>

      <button type="button" onClick={togglePanel}>
        toggle panel
      </button>
      <button type="button" onClick={() => void controller.handleConnect()}>
        connect
      </button>
    </div>
  );
}

describe('useAssistantPanelController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    vi.mocked(requestSessionToken).mockResolvedValue({
      token: 'stub-token',
      expiresAt: 'later',
      isStub: true,
    });
  });

  it('checks backend health when panel is opened', async () => {
    render(
      <UiStoreProvider>
        <HookHarness />
      </UiStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    expect(checkBackendHealth).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Connected')).toBeVisible();
  });

  it('requests token with explicit empty payload and updates feedback', async () => {
    render(
      <UiStoreProvider>
        <HookHarness />
      </UiStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'connect' }));

    expect(requestSessionToken).toHaveBeenCalledWith({});
    expect(await screen.findByText('Token received')).toBeVisible();
  });
});
