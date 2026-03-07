import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBackendHealth } from './api/backend';
import { App } from './App';

vi.mock('./api/backend', () => ({
  checkBackendHealth: vi.fn(),
  requestSessionToken: vi.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkBackendHealth).mockImplementation(
      () => new Promise<boolean>(() => {}),
    );
  });

  it('wires control dock and panel visibility through the shared ui store', () => {
    render(<App />);

    const panelToggleOpen = screen.getByRole('button', {
      name: /open panel/i,
    });
    const panel = screen.getByRole('complementary', { hidden: true });

    expect(panelToggleOpen).toBeVisible();
    expect(panelToggleOpen).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('aria-label', 'Assistant Panel');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(panelToggleOpen);

    expect(panel).toHaveAttribute('aria-hidden', 'false');
    const panelToggleClose = screen.getByRole('button', {
      name: /close panel/i,
    });
    expect(panelToggleClose).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(panelToggleClose);
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });
});
