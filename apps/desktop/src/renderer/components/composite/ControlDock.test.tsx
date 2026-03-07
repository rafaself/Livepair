import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UiStoreProvider } from '../../store/uiStore';
import { ControlDock } from './ControlDock';

function renderDock() {
  return render(
    <UiStoreProvider>
      <ControlDock />
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
});
