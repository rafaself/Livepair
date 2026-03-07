import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssistantPanelSessionSection } from './AssistantPanelSessionSection';

describe('AssistantPanelSessionSection', () => {
  it('renders session placeholders', () => {
    render(<AssistantPanelSessionSection />);

    expect(screen.getByRole('heading', { name: 'Session' })).toBeVisible();
    expect(screen.getByText('Mode')).toBeVisible();
    expect(screen.getByText('Fast')).toBeVisible();
    expect(screen.getByText('Goal')).toBeVisible();
    expect(screen.getByText('Assist with desktop tasks')).toBeVisible();
    expect(screen.getByText('Transcript')).toBeVisible();
    expect(screen.getByText('(No conversation yet)')).toBeVisible();
  });
});
