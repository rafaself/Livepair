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

    fireEvent.click(screen.getByRole('button', { name: 'Developer tools' }));
    const dialog = screen.getByRole('dialog', { name: 'Developer tools' });
    const modal = within(dialog);

    expect(modal.getByText('Backend status')).toBeVisible();
    expect(modal.getByText('Not connected')).toBeVisible();

    fireEvent.click(modal.getByRole('button', { name: 'Retry backend' }));

    expect(await panelScope.findByRole('status', { name: 'Ready' })).toBeVisible();
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

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const modal = within(dialog);

    expect(dialog).toBeVisible();
    expect(modal.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(modal.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(modal.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(modal.getByRole('heading', { name: 'Advanced' })).toBeVisible();
  });

  it('closes settings and developer dialogs via close button, Escape and panel close', async () => {
    renderAssistantPanel({ showStateDevControls: true });
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    await screen.findByRole('status', { name: 'Ready' });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Developer tools' }));
    expect(screen.getByRole('dialog', { name: 'Developer tools' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close developer tools' }));
    expect(screen.queryByRole('dialog', { name: 'Developer tools' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Developer tools' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Developer tools' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Developer tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    expect(screen.getByRole('complementary', { hidden: true })).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Developer tools' })).toBeNull();
  });
});
