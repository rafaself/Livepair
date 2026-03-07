import { fireEvent, render, screen } from '@testing-library/react';
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

      expect(screen.getByRole('heading', { name: 'Status' })).toBeVisible();
      expect(screen.getByText('Assistant')).toBeVisible();
      expect(screen.getByText('Disconnected')).toBeVisible();
      expect(screen.getByText('Backend')).toBeVisible();
      expect(screen.getByText('Not connected')).toBeVisible();

      expect(screen.getByRole('heading', { name: 'Session' })).toBeVisible();
      expect(screen.getByText('Mode')).toBeVisible();
      expect(screen.getByText('Fast')).toBeVisible();
      expect(screen.getByText('Goal')).toBeVisible();
      expect(screen.getByText('Assist with desktop tasks')).toBeVisible();
      expect(screen.getByText('Transcript')).toBeVisible();
      expect(screen.getByText('(No conversation yet)')).toBeVisible();

      expect(screen.getByRole('heading', { name: 'Actions' })).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start Listening' }));

      expect(consoleLogSpy).toHaveBeenCalledWith('action triggered');

      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      expect(consoleLogSpy).toHaveBeenCalledWith('open settings');

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
