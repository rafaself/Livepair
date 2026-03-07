import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanel } from './AssistantPanel';

describe('AssistantPanel', () => {
  it('renders panel content and handles settings/actions', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return undefined;
    });

    try {
      render(<AssistantPanel isOpen={true} />);

      const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
      expect(panel).toHaveAttribute('aria-hidden', 'false');
      expect(screen.getByRole('heading', { name: 'Livepair' })).toBeVisible();

      // No close button should be present in the panel anymore
      expect(
        screen.queryByRole('button', { name: /close assistant panel/i }),
      ).toBeNull();

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
    render(<AssistantPanel isOpen={false} />);
    expect(
      screen.getByLabelText('Assistant Panel', {
        selector: '[role="complementary"]',
      }),
    ).toHaveAttribute('aria-hidden', 'true');
  });
});
