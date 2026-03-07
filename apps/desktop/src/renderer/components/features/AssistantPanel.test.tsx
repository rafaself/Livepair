import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBackendHealth, requestSessionToken } from '../../api/backend';
import { UiStoreProvider, useUiStore } from '../../store/uiStore';
import { AssistantPanel } from './AssistantPanel';

vi.mock('../../api/backend', () => ({
  checkBackendHealth: vi.fn(),
  requestSessionToken: vi.fn(),
}));

type AssistantPanelHarnessProps = {
  showStateDevControls?: boolean;
};

function AssistantPanelHarness({
  showStateDevControls = false,
}: AssistantPanelHarnessProps): JSX.Element {
  const { togglePanel } = useUiStore();

  return (
    <>
      <button type="button" onClick={togglePanel}>
        toggle panel
      </button>
      <AssistantPanel showStateDevControls={showStateDevControls} />
    </>
  );
}

function renderAssistantPanel(
  props: AssistantPanelHarnessProps = {},
): ReturnType<typeof render> {
  return render(
    <UiStoreProvider>
      <AssistantPanelHarness {...props} />
    </UiStoreProvider>,
  );
}

describe('AssistantPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    vi.mocked(requestSessionToken).mockResolvedValue({
      token: 'stub-token',
      expiresAt: 'later',
      isStub: true,
    });
  });

  it('renders panel content, allows runtime state switching, checks backend, and opens settings modal', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return undefined;
    });

    try {
      renderAssistantPanel({ showStateDevControls: true });
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

      const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
      const panelScope = within(panel);
      expect(panel).toHaveAttribute('aria-hidden', 'false');
      expect(screen.getByRole('heading', { name: 'Livepair' })).toBeVisible();
      expect(screen.getByText('Panel')).toBeVisible();
      expect(screen.getByText('Open')).toBeVisible();
      expect(checkBackendHealth).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Connected')).toBeVisible();
      expect(panelScope.getByRole('heading', { name: 'Status' })).toBeVisible();
      expect(panelScope.getByRole('heading', { name: 'Session' })).toBeVisible();
      expect(panelScope.getByRole('heading', { name: 'Actions' })).toBeVisible();

      const statusHeading = panelScope.getByRole('heading', {
        name: 'Status',
        level: 3,
      });
      const sessionHeading = panelScope.getByRole('heading', {
        name: 'Session',
        level: 3,
      });
      const actionsHeading = panelScope.getByRole('heading', {
        name: 'Actions',
        level: 3,
      });
      expect(statusHeading.compareDocumentPosition(sessionHeading)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(sessionHeading.compareDocumentPosition(actionsHeading)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );

      expect(panelScope.getByRole('button', { name: 'Connect' })).toHaveClass(
        'assistant-panel__action-primary',
        'btn--primary',
      );
      expect(panelScope.getByRole('button', { name: 'Start Listening' })).toHaveClass(
        'assistant-panel__action-secondary',
        'btn--secondary',
      );

      const speakingStateButton = screen.getByRole('button', { name: 'speaking' });
      fireEvent.click(speakingStateButton);
      expect(screen.getByRole('status', { name: 'Speaking' })).toBeVisible();

      fireEvent.click(screen.getByRole('button', { name: 'Start Listening' }));
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

      expect(logSpy).toHaveBeenCalledWith('action triggered');
      const dialog = screen.getByRole('dialog', { name: 'Settings' });
      const modal = within(dialog);
      expect(dialog).toBeVisible();
      expect(modal.getByRole('heading', { name: 'General' })).toBeVisible();
      expect(modal.getByRole('heading', { name: 'Audio' })).toBeVisible();
      expect(modal.getByRole('heading', { name: 'Backend' })).toBeVisible();
      expect(modal.getByRole('heading', { name: 'Advanced' })).toBeVisible();
      expect(modal.getByText('Preferred mode')).toBeVisible();
      expect(modal.getByText('Fast')).toBeVisible();
      expect(modal.getByText('Input device')).toBeVisible();
      expect(modal.getByText('Default microphone')).toBeVisible();
      expect(modal.getByText('Backend URL')).toBeVisible();
      expect(modal.getByText('http://localhost:3000')).toBeVisible();
      expect(modal.getByText('Debug mode')).toBeVisible();
      expect(modal.getByText('Disabled')).toBeVisible();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('shows retry when backend health check fails and reconnects on retry', async () => {
    vi.mocked(checkBackendHealth)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    expect(await screen.findByText('Not connected')).toBeVisible();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeVisible();

    fireEvent.click(retry);
    expect(await screen.findByText('Connected')).toBeVisible();
    expect(checkBackendHealth).toHaveBeenCalledTimes(2);
  });

  it('shows token request loading, success, and failure states', async () => {
    vi.mocked(requestSessionToken)
      .mockResolvedValueOnce({
        token: 'stub-token',
        expiresAt: 'later',
        isStub: true,
      })
      .mockRejectedValueOnce(new Error('token failed'));

    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    const connect = screen.getByRole('button', { name: 'Connect' });
    fireEvent.click(connect);
    expect(screen.getByText('Requesting token...')).toBeVisible();
    expect(await screen.findByText('Token received')).toBeVisible();

    fireEvent.click(connect);
    expect(screen.getByText('Requesting token...')).toBeVisible();
    expect(await screen.findByText('Connection failed')).toBeVisible();
    expect(requestSessionToken).toHaveBeenCalledTimes(2);
  });

  it('hides dev state controls when showStateDevControls is false', async () => {
    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    await screen.findByText('Connected');

    expect(screen.queryByRole('button', { name: 'disconnected' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'error' })).toBeNull();
  });

  it('closes settings modal via close button, escape key, and panel close action', async () => {
    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    await screen.findByText('Connected');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.getByRole('complementary', { hidden: true })).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });

  it('renders hidden panel when closed', () => {
    renderAssistantPanel();
    expect(
      screen.getByLabelText('Assistant Panel', {
        selector: '[role="complementary"]',
      }),
    ).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Closed')).toBeVisible();
  });
});
