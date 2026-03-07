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

    expect(screen.getByRole('heading', { name: 'Title' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Action' })).toBeVisible();
  });
});

