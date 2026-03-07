import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelHeader } from './PanelHeader';

describe('PanelHeader', () => {
  it('renders optional title and actions', () => {
    const { rerender } = render(<PanelHeader />);
    expect(document.querySelector('.panel-header__title')).toBeNull();
    expect(document.querySelector('.panel-header__actions')).toBeNull();

    rerender(
      <PanelHeader title="Title">
        <button type="button">Action</button>
      </PanelHeader>,
    );

    expect(screen.getByRole('heading', { name: 'Title', level: 2 })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Action' })).toBeVisible();
  });

  it('renders an icon when provided', () => {
    const { container } = render(
      <PanelHeader title="Title" icon={<span data-testid="icon">Icon</span>} />,
    );
    expect(container.querySelector('.panel-header__icon')).toBeVisible();
    expect(screen.getByTestId('icon')).toBeVisible();
  });

  it('does not render icon container when icon is omitted', () => {
    const { container } = render(<PanelHeader title="Title" />);
    expect(container.querySelector('.panel-header__icon')).toBeNull();
  });
});
