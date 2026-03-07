import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBackendHealth } from '../../api/backend';
import { UiStoreProvider, useUiStore } from '../../store/uiStore';
import { AssistantPanel } from './AssistantPanel';

vi.mock('../../api/backend', () => ({
  checkBackendHealth: vi.fn(),
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
  });

  it('renders hidden panel when closed', () => {
    renderAssistantPanel();

    expect(
      screen.getByLabelText('Assistant Panel', {
        selector: '[role="complementary"]',
      }),
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders a voice-first hierarchy and keeps developer details out of the main panel', async () => {
    renderAssistantPanel({ showStateDevControls: true });
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(panelScope.getByRole('heading', { name: 'Livepair' })).toBeVisible();

    const hero = await panelScope.findByRole('status', { name: 'Ready' });
    const conversationHeading = panelScope.getByRole('heading', { name: 'Conversation' });

    expect(panelScope.getByRole('button', { name: 'Developer tools' })).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'Settings' })).toBeVisible();
    expect(panelScope.getByText('No conversation yet')).toBeVisible();
    expect(hero.compareDocumentPosition(conversationHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(panelScope.queryByRole('button', { name: 'Start talking' })).toBeNull();
    expect(panelScope.queryByText('Backend status')).toBeNull();
    expect(panelScope.queryByText('Token request')).toBeNull();
    expect(panelScope.queryByText('Mode')).toBeNull();
    expect(panelScope.queryByText('Set assistant state')).toBeNull();
  });

  it('shows backend failures as an error state and supports retry inside developer tools', async () => {
    vi.mocked(checkBackendHealth)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    renderAssistantPanel({ showStateDevControls: true });
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(await panelScope.findByRole('status', { name: 'Error' })).toBeVisible();

    fireEvent.click(panelScope.getByRole('button', { name: 'Developer tools' }));

    expect(panelScope.getByText('Backend status')).toBeVisible();
    expect(panelScope.getByText('Not connected')).toBeVisible();

    fireEvent.click(panelScope.getByRole('button', { name: 'Retry backend' }));

    await panelScope.findByText('Connected');
    expect(checkBackendHealth).toHaveBeenCalledTimes(2);
  });


  it('omits developer tools when showStateDevControls is false', async () => {
    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    await screen.findByRole('status', { name: 'Ready' });

    expect(screen.queryByRole('button', { name: 'Developer tools' })).toBeNull();
  });

  it('opens settings from the header', async () => {
    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    await screen.findByRole('status', { name: 'Ready' });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));

    expect(panelScope.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(panelScope.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(panelScope.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(panelScope.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(panelScope.getByRole('heading', { name: 'Advanced' })).toBeVisible();
  });

  it('returns to chat via back button and panel close resets view', async () => {
    renderAssistantPanel({ showStateDevControls: true });
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    await screen.findByRole('status', { name: 'Ready' });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    // Open settings view
    fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    expect(panelScope.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(panelScope.queryByText('No conversation yet')).toBeNull();

    // Return to chat via Chat button
    fireEvent.click(panelScope.getByRole('button', { name: 'Chat' }));
    expect(panelScope.queryByRole('heading', { name: 'Settings' })).toBeNull();
    expect(panelScope.getByText('No conversation yet')).toBeVisible();

    // Open debug view
    fireEvent.click(panelScope.getByRole('button', { name: 'Developer tools' }));
    expect(panelScope.getByRole('heading', { name: 'Developer tools' })).toBeVisible();

    // Return to chat via Chat button
    fireEvent.click(panelScope.getByRole('button', { name: 'Chat' }));
    expect(panelScope.queryByRole('heading', { name: 'Developer tools' })).toBeNull();
    expect(panelScope.getByText('No conversation yet')).toBeVisible();

    // Panel close resets view — re-open with debug active, then close
    fireEvent.click(panelScope.getByRole('button', { name: 'Developer tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    expect(screen.getByRole('complementary', { hidden: true })).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
