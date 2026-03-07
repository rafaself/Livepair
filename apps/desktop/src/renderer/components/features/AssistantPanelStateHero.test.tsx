import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';

describe('AssistantPanelStateHero', () => {
  it('renders each assistant state with a matching accessible status and visual variant', () => {
    const runtimeStates = [
      { value: 'disconnected', label: 'Disconnected' },
      { value: 'ready', label: 'Ready' },
      { value: 'listening', label: 'Listening' },
      { value: 'thinking', label: 'Thinking' },
      { value: 'speaking', label: 'Speaking' },
      { value: 'error', label: 'Error' },
    ] as const;

    for (const runtimeState of runtimeStates) {
      const { unmount } = render(<AssistantPanelStateHero state={runtimeState.value} />);
      const hero = screen.getByRole('status', { name: runtimeState.label });

      expect(hero).toHaveClass('assistant-panel__hero', `assistant-panel__hero--${runtimeState.value}`);
      expect(screen.getByRole('heading', { name: runtimeState.label })).toBeVisible();

      unmount();
    }
  });
});
