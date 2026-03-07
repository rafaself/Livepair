import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('opens the assistant shell, renders the panel layout, and supports close/settings actions', () => {
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

      expect(screen.getByText('Assistant Status')).toBeVisible();
      expect(screen.getByText('Disconnected')).toBeVisible();
      expect(screen.getByText('Connection')).toBeVisible();
      expect(screen.getByText('Not connected')).toBeVisible();

      expect(screen.getByText('Assistant will appear here.')).toBeVisible();
      expect(screen.getByText('Future controls:')).toBeVisible();
      expect(screen.getByText('microphone')).toBeVisible();
      expect(screen.getByText('transcript')).toBeVisible();
      expect(screen.getByText('actions')).toBeVisible();

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
