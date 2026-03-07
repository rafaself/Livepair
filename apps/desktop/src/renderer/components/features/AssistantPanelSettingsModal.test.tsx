import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssistantPanelSettingsView } from './AssistantPanelSettingsView';

describe('AssistantPanelSettingsView', () => {
  it('renders settings sections', () => {
    render(<AssistantPanelSettingsView />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeVisible();
  });
});
