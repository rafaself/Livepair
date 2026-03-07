import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      <output aria-label="assistant-state">{controller.assistantState}</output>
      <output aria-label="backend-label">{controller.backendLabel}</output>
      <output aria-label="token-feedback">{controller.tokenFeedback ?? 'none'}</output>
      <output aria-label="panel-view">{controller.panelView}</output>

      <button type="button" onClick={togglePanel}>
        toggle panel
      </button>
      <button type="button" onClick={() => void controller.handleStartTalking()}>
        start talking
      </button>
      <button type="button" onClick={() => controller.setPanelView('debug')}>
        open debug
      </button>
      <button type="button" onClick={() => controller.setPanelView('chat')}>
        close debug
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

  it('checks backend health when the panel is opened and maps success to ready', async () => {
    render(
      <UiStoreProvider>
        <HookHarness />
      </UiStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    expect(checkBackendHealth).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('ready');
    });
    expect(screen.getByLabelText('backend-label')).toHaveTextContent('Connected');
  });

  it('maps backend health failures to the error state', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue(false);

    render(
      <UiStoreProvider>
        <HookHarness />
      </UiStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('error');
    });
    expect(screen.getByLabelText('backend-label')).toHaveTextContent('Not connected');
  });

  it('maps start talking to thinking while the token request is pending and returns to ready on success', async () => {
    let resolveToken: (() => void) | undefined;
    vi.mocked(requestSessionToken).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveToken = () =>
            resolve({
              token: 'stub-token',
              expiresAt: 'later',
              isStub: true,
            });
        }),
    );

    render(
      <UiStoreProvider>
        <HookHarness />
      </UiStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'start talking' }));

    expect(requestSessionToken).toHaveBeenCalledWith({});
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('thinking');
    expect(screen.getByLabelText('token-feedback')).toHaveTextContent('Requesting token...');

    resolveToken?.();

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('ready');
    });
    expect(screen.getByLabelText('token-feedback')).toHaveTextContent('Token received');
  });

  it('maps token request failures to the error state', async () => {
    vi.mocked(requestSessionToken).mockRejectedValueOnce(new Error('token failed'));

    render(
      <UiStoreProvider>
        <HookHarness />
      </UiStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'start talking' }));

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('error');
    });
    expect(screen.getByLabelText('token-feedback')).toHaveTextContent('Connection failed');
  });

  it('resets panel view to chat when the panel closes', async () => {
    render(
      <UiStoreProvider>
        <HookHarness />
      </UiStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'open debug' }));
    await waitFor(() => {
      expect(screen.getByLabelText('panel-view')).toHaveTextContent('debug');
    });

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    await waitFor(() => {
      expect(screen.getByLabelText('panel-view')).toHaveTextContent('chat');
    });
  });
});
