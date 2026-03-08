import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UiStoreProvider, useUiStore } from '../../store/uiStore';
import { ControlDock } from './ControlDock';

function renderDock() {
  function DockHarness(): JSX.Element {
    const {
      state: { isPanelOpen },
    } = useUiStore();

    return (
      <>
        <output aria-label="panel-open">{String(isPanelOpen)}</output>
        <ControlDock />
      </>
    );
  }

  return render(
    <UiStoreProvider>
      <DockHarness />
    </UiStoreProvider>,
  );
}

describe('ControlDock', () => {
  it('renders all four control buttons', () => {
    renderDock();
    expect(screen.getByRole('button', { name: /unmute microphone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open panel/i })).toBeInTheDocument();
  });

  it('shows start session button when disconnected and end session when active', () => {
    renderDock();
    const startBtn = screen.getByRole('button', { name: /start session/i });
    expect(startBtn).toBeEnabled();

    fireEvent.click(startBtn);

    expect(screen.getByRole('button', { name: /end session/i })).toBeInTheDocument();
  });

  it('toggles mic aria-label on click', () => {
    renderDock();
    const micBtn = screen.getByRole('button', { name: /unmute microphone/i });
    fireEvent.click(micBtn);
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /mute microphone/i }));
    expect(screen.getByRole('button', { name: /unmute microphone/i })).toBeInTheDocument();
  });

  it('toggles camera aria-label on click', () => {
    renderDock();
    const camBtn = screen.getByRole('button', { name: /enable camera/i });
    fireEvent.click(camBtn);
    expect(screen.getByRole('button', { name: /disable camera/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /disable camera/i }));
    expect(screen.getByRole('button', { name: /enable camera/i })).toBeInTheDocument();
  });

  it('opens panel and updates settings button label on click', () => {
    renderDock();
    const openBtn = screen.getByRole('button', { name: /open panel/i });
    expect(openBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(openBtn);

    const closeBtn = screen.getByRole('button', { name: /close panel/i });
    expect(closeBtn).toHaveAttribute('aria-expanded', 'true');
    expect(closeBtn).toHaveClass('control-dock__btn--active');
  });

  it('applies panel-open class to dock when panel is open', () => {
    renderDock();
    const dock = screen.getByRole('toolbar', { name: /assistant controls/i });
    expect(dock).not.toHaveClass('control-dock--panel-open');

    fireEvent.click(screen.getByRole('button', { name: /open panel/i }));

    expect(dock).toHaveClass('control-dock--panel-open');
  });

  it('dims the dock when the app window loses focus and restores it on hover', () => {
    renderDock();
    const dock = screen.getByRole('toolbar', { name: /assistant controls/i });

    fireEvent(window, new Event('focus'));
    expect(dock).not.toHaveClass('control-dock--dimmed');

    fireEvent(window, new Event('blur'));
    expect(dock).toHaveClass('control-dock--dimmed');

    fireEvent.mouseEnter(dock);
    expect(dock).not.toHaveClass('control-dock--dimmed');

    fireEvent.mouseLeave(dock);
    expect(dock).toHaveClass('control-dock--dimmed');

    fireEvent(window, new Event('focus'));
    expect(dock).not.toHaveClass('control-dock--dimmed');
  });

  it('closes the panel when the app window loses focus', () => {
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('true');

    fireEvent(window, new Event('blur'));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('false');
  });

  it('keeps the dock opaque whenever the panel is open', () => {
    renderDock();
    const dock = screen.getByRole('toolbar', { name: /assistant controls/i });

    fireEvent(window, new Event('blur'));
    expect(dock).toHaveClass('control-dock--dimmed');

    fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    expect(dock).toHaveClass('control-dock--panel-open');
    expect(dock).not.toHaveClass('control-dock--dimmed');
  });
});
