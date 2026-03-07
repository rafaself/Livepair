import { fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('keeps the launcher visible and toggles the assistant panel', () => {
    render(<App />);

    const launcher = screen.getByRole('button', {
      name: /open assistant panel/i,
    });
    const panelContent = screen.getByText('Assistant Panel');
    const panel = panelContent.closest('[role="complementary"]');

    expect(launcher).toBeVisible();
    expect(panel).not.toBeNull();
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(launcher);

    expect(launcher).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(panelContent).toBeVisible();

    fireEvent.click(launcher);

    expect(launcher).toBeVisible();
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });
});
