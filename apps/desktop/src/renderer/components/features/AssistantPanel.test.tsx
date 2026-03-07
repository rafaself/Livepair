import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanel } from './index';

describe('AssistantPanel', () => {
  it('renders panel content and handles close/settings/actions', () => {
    const onClose = vi.fn();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return undefined;
    });

    try {
      render(<AssistantPanel isOpen={true} onClose={onClose} />);

      const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
      expect(panel).toHaveAttribute('aria-hidden', 'false');
      expect(screen.getByRole('heading', { name: 'Livepair' })).toBeVisible();

      fireEvent.click(
        screen.getByRole('button', { name: /close assistant panel/i }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start Listening' }));
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

      expect(logSpy).toHaveBeenCalledWith('action triggered');
      expect(logSpy).toHaveBeenCalledWith('open settings');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('renders hidden panel when closed', () => {
    render(<AssistantPanel isOpen={false} onClose={() => undefined} />);
    expect(
      screen.getByLabelText('Assistant Panel', {
        selector: '[role="complementary"]',
      }),
    ).toHaveAttribute('aria-hidden', 'true');
  });
});
