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

  it('wires launcher and panel visibility through the shared ui store', () => {
    render(<App />);

    const launcherOpen = screen.getByRole('button', {
      name: /open assistant panel/i,
    });
    const panel = screen.getByRole('complementary', { hidden: true });

    expect(launcherOpen).toBeVisible();
    expect(launcherOpen).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('aria-label', 'Assistant Panel');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(launcherOpen);

    expect(panel).toHaveAttribute('aria-hidden', 'false');
    const launcherClose = screen.getByRole('button', {
      name: /close assistant panel/i,
    });
    expect(launcherClose).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(launcherClose);
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });
});
