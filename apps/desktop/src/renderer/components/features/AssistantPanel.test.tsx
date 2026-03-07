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

  it('renders hidden panel when closed', () => {
    renderAssistantPanel();

    expect(
      screen.getByLabelText('Assistant Panel', {
        selector: '[role="complementary"]',
      }),
    ).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Closed')).toBeVisible();
  });

  it('renders core sections and settings in a full panel flow', async () => {
    renderAssistantPanel({ showStateDevControls: true });
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(panelScope.getByRole('heading', { name: 'Status' })).toBeVisible();
    expect(panelScope.getByRole('heading', { name: 'Session' })).toBeVisible();
    expect(panelScope.getByRole('heading', { name: 'Actions' })).toBeVisible();
    expect(await panelScope.findByText('Connected')).toBeVisible();

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

    fireEvent.click(panelScope.getByRole('button', { name: 'speaking' }));
    expect(screen.getByRole('status', { name: 'Speaking' })).toBeVisible();

    fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const modal = within(dialog);
    expect(dialog).toBeVisible();
    expect(modal.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(modal.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(modal.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(modal.getByRole('heading', { name: 'Advanced' })).toBeVisible();
  });

  it('checks backend on panel open and supports retry after failure', async () => {
    vi.mocked(checkBackendHealth)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    expect(await screen.findByText('Not connected')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Connected')).toBeVisible();
    expect(checkBackendHealth).toHaveBeenCalledTimes(2);
  });

  it('shows token loading, success and failure feedback and sends explicit request payload', async () => {
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
    expect(requestSessionToken).toHaveBeenNthCalledWith(1, {});
    expect(requestSessionToken).toHaveBeenNthCalledWith(2, {});
  });

  it('hides dev controls when showStateDevControls is false', async () => {
    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    await screen.findByText('Connected');

    expect(screen.queryByRole('button', { name: 'disconnected' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'error' })).toBeNull();
  });

  it('closes settings modal via close button, Escape and panel close', async () => {
    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    await screen.findByText('Connected');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.getByRole('complementary', { hidden: true })).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });
});
