import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('opens the assistant shell, renders static assistant sections, and supports placeholder actions', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return undefined;
    });

    try {
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
      expect(
        screen.queryByRole('button', { name: /open assistant panel/i }),
      ).toBeNull();

      expect(screen.getByRole('heading', { name: 'Livepair' })).toBeVisible();
      expect(
        screen.getByRole('button', { name: /close assistant panel/i }),
      ).toBeVisible();

      const panelScope = within(panel);
      expect(panelScope.getByRole('heading', { name: 'Status' })).toBeVisible();
      expect(panelScope.getByText('Assistant')).toBeVisible();
      expect(panelScope.getByText('Disconnected')).toBeVisible();
      expect(panelScope.getByText('Backend')).toBeVisible();
      expect(panelScope.getByText('Not connected')).toBeVisible();

      expect(panelScope.getByRole('heading', { name: 'Session' })).toBeVisible();
      expect(panelScope.getByText('Mode')).toBeVisible();
      expect(panelScope.getByText('Fast')).toBeVisible();
      expect(panelScope.getByText('Goal')).toBeVisible();
      expect(panelScope.getByText('Assist with desktop tasks')).toBeVisible();
      expect(panelScope.getByText('Transcript')).toBeVisible();
      expect(panelScope.getByText('(No conversation yet)')).toBeVisible();

      expect(panelScope.getByRole('heading', { name: 'Actions' })).toBeVisible();
      fireEvent.click(panelScope.getByRole('button', { name: 'Connect' }));
      fireEvent.click(panelScope.getByRole('button', { name: 'Start Listening' }));

      expect(consoleLogSpy).toHaveBeenCalledWith('action triggered');

      fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

      fireEvent.click(
        screen.getByRole('button', { name: /close assistant panel/i }),
      );
      expect(panel).toHaveAttribute('aria-hidden', 'true');
      expect(
        screen.getByRole('button', { name: /open assistant panel/i }),
      ).toBeVisible();
    } finally {
      consoleLogSpy.mockRestore();
    }
  });
});
