import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UiStoreProvider, useUiStore } from '../../store/uiStore';
import { AssistantPanel } from './AssistantPanel';

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
  it('renders panel content, allows runtime state switching, handles actions, and opens settings modal', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return undefined;
    });

    try {
      renderAssistantPanel({ showStateDevControls: true });
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

      const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
      expect(panel).toHaveAttribute('aria-hidden', 'false');
      expect(screen.getByRole('heading', { name: 'Livepair' })).toBeVisible();
      expect(screen.getByText('Panel')).toBeVisible();
      expect(screen.getByText('Open')).toBeVisible();

      const speakingStateButton = screen.getByRole('button', { name: 'speaking' });
      fireEvent.click(speakingStateButton);
      expect(screen.getByRole('status', { name: 'Speaking' })).toBeVisible();

      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
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

  it('hides dev state controls when showStateDevControls is false', () => {
    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    expect(screen.queryByRole('button', { name: 'disconnected' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'error' })).toBeNull();
  });

  it('closes settings modal via close button, escape key, and panel close action', () => {
    renderAssistantPanel();
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

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
