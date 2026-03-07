import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelFooter } from './PanelFooter';

describe('PanelFooter', () => {
  it('renders children', () => {
    render(
      <PanelFooter>
        <button type="button">Settings</button>
      </PanelFooter>,
    );

    expect(screen.getByRole('button', { name: 'Settings' })).toBeVisible();
  });
});

