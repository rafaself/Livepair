import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelSettingsModal } from './AssistantPanelSettingsModal';

describe('AssistantPanelSettingsModal', () => {
  it('renders settings sections when open and closes via close button', () => {
    const onClose = vi.fn();

    render(<AssistantPanelSettingsModal isOpen={true} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps dialog hidden when closed', () => {
    const onClose = vi.fn();

    render(<AssistantPanelSettingsModal isOpen={false} onClose={onClose} />);

    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });
});
