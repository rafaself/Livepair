import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UiStoreProvider } from '../../store/uiStore';
import { AssistantPanelSettingsView } from './AssistantPanelSettingsView';

describe('AssistantPanelSettingsView', () => {
  it('renders settings sections', () => {
    render(
      <UiStoreProvider>
        <AssistantPanelSettingsView />
      </UiStoreProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeVisible();
  });

  it('lets the user lock the panel from settings', () => {
    render(
      <UiStoreProvider>
        <AssistantPanelSettingsView />
      </UiStoreProvider>,
    );

    const lockPanelSwitch = screen.getByRole('switch', { name: /lock panel/i });
    expect(lockPanelSwitch).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Lock panel')).toBeVisible();

    fireEvent.click(lockPanelSwitch);

    expect(screen.getByRole('switch', { name: /lock panel/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('lets the user change preferred mode from settings', () => {
    render(
      <UiStoreProvider>
        <AssistantPanelSettingsView />
      </UiStoreProvider>,
    );

    const preferredModeSelect = screen.getByRole('button', { name: /preferred mode/i });
    expect(preferredModeSelect).toHaveTextContent('Fast');

    fireEvent.click(preferredModeSelect);
    fireEvent.click(screen.getByRole('option', { name: 'Thinking' }));

    expect(screen.getByRole('button', { name: /preferred mode/i })).toHaveTextContent('Thinking');
  });
});
