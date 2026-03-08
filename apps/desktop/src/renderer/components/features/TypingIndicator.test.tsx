import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TypingIndicator } from './TypingIndicator';

describe('TypingIndicator', () => {
  it('renders an accessible streaming indicator with three dots', () => {
    render(<TypingIndicator label="Assistant is thinking" />);

    const indicator = screen.getByLabelText('Assistant is thinking');

    expect(indicator).toHaveClass('typing-indicator');
    expect(indicator.querySelectorAll('.typing-indicator__dot')).toHaveLength(3);
  });
});
