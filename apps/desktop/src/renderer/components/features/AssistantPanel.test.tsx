import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanel } from './AssistantPanel';

describe('AssistantPanel', () => {
  it('renders panel content, allows runtime state switching, handles actions, and opens settings modal', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return undefined;
    });

    try {
      render(<AssistantPanel panelState="expanded" showStateDevControls={true} />);

      const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
      expect(panel).toHaveAttribute('aria-hidden', 'false');
      expect(screen.getByRole('heading', { name: 'Livepair' })).toBeVisible();
      expect(screen.getByText('Panel')).toBeVisible();
      expect(screen.getByText('Expanded')).toBeVisible();

      // No close button should be present in the panel anymore
      expect(
        screen.queryByRole('button', { name: /close assistant panel/i }),
      ).toBeNull();

      const runtimeStateSelect = screen.getByRole('combobox', {
        name: 'Assistant runtime state',
      });
      expect(runtimeStateSelect).toHaveValue('disconnected');
      fireEvent.change(runtimeStateSelect, { target: { value: 'speaking' } });
      expect(runtimeStateSelect).toHaveValue('speaking');
      expect(screen.getByRole('status', { name: 'Speaking' })).toBeVisible();

      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start Listening' }));
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

      expect(logSpy).toHaveBeenCalledWith('action triggered');
      const dialog = screen.getByRole('dialog', { name: 'Settings' });
      const modal = within(dialog);
      expect(dialog).toBeVisible();
      expect(modal.getByRole('heading', { name: 'General' })).toBeVisible();
      expect(modal.getByRole('heading', { name: 'Audio' })).toBeVisible();
      expect(modal.getByRole('heading', { name: 'Backend' })).toBeVisible();
      expect(modal.getByRole('heading', { name: 'Advanced' })).toBeVisible();
      expect(modal.getByText('Preferred mode')).toBeVisible();
      expect(modal.getByText('Fast')).toBeVisible();
      expect(modal.getByText('Input device')).toBeVisible();
      expect(modal.getByText('Default microphone')).toBeVisible();
      expect(modal.getByText('Backend URL')).toBeVisible();
      expect(modal.getByText('http://localhost:3000')).toBeVisible();
      expect(modal.getByText('Debug mode')).toBeVisible();
      expect(modal.getByText('Disabled')).toBeVisible();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('hides dev state controls when showStateDevControls is false', () => {
    render(<AssistantPanel panelState="expanded" />);
    expect(
      screen.queryByRole('combobox', { name: 'Assistant runtime state' }),
    ).toBeNull();
  });

  it('closes settings modal via close button and escape key', () => {
    render(<AssistantPanel panelState="expanded" />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });

  it('renders hidden panel when closed', () => {
    render(<AssistantPanel panelState="collapsed" />);
    expect(
      screen.getByLabelText('Assistant Panel', {
        selector: '[role="complementary"]',
      }),
    ).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Collapsed')).toBeVisible();
  });
});
