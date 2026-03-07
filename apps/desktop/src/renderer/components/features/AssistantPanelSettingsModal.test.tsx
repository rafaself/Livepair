import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelSettingsView } from './AssistantPanelSettingsView';

describe('AssistantPanelSettingsView', () => {
  it('renders settings sections and calls onBack when back button is clicked', () => {
    const onBack = vi.fn();

    render(<AssistantPanelSettingsView onBack={onBack} />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
