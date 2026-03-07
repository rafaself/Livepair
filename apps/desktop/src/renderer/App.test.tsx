import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBackendHealth, requestSessionToken } from './api/backend';
import { App } from './App';

vi.mock('./api/backend', () => ({
  checkBackendHealth: vi.fn(),
  requestSessionToken: vi.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    vi.mocked(requestSessionToken).mockResolvedValue({
      token: 'stub-token',
      expiresAt: 'later',
      isStub: true,
    });
  });

  it('wires launcher, panel, settings, and backend connectivity actions through the shared ui store', async () => {
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

    expect(screen.getByRole('heading', { name: 'Livepair' })).toBeVisible();

    const panelScope = within(panel);
    expect(panelScope.getByRole('heading', { name: 'Status' })).toBeVisible();
    expect(panelScope.getByText('Assistant')).toBeVisible();
    expect(panelScope.getByRole('status', { name: 'Disconnected' })).toBeVisible();
    expect(panelScope.getByText('Panel')).toBeVisible();
    expect(panelScope.getByText('Open')).toBeVisible();
    expect(panelScope.getByText('Backend')).toBeVisible();
    expect(await panelScope.findByText('Connected')).toBeVisible();
    expect(checkBackendHealth).toHaveBeenCalledTimes(1);

    expect(panelScope.getByRole('heading', { name: 'Session' })).toBeVisible();
    expect(panelScope.getByText('Mode')).toBeVisible();
    expect(panelScope.getByText('Fast')).toBeVisible();
    expect(panelScope.getByText('Goal')).toBeVisible();
    expect(panelScope.getByText('Assist with desktop tasks')).toBeVisible();
    expect(panelScope.getByText('Transcript')).toBeVisible();
    expect(panelScope.getByText('(No conversation yet)')).toBeVisible();

    expect(panelScope.getByRole('heading', { name: 'Actions' })).toBeVisible();
    fireEvent.click(panelScope.getByRole('button', { name: 'Connect' }));
    expect(panelScope.getByText('Requesting token...')).toBeVisible();
    expect(await panelScope.findByText('Token received')).toBeVisible();
    expect(requestSessionToken).toHaveBeenCalledTimes(1);

    fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    fireEvent.click(launcherClose);
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /open assistant panel/i }));
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(await panelScope.findByText('Connected')).toBeVisible();
    fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });
});
