import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelSection } from './PanelSection';

describe('PanelSection', () => {
  it('renders title, body and custom className', () => {
    render(
      <PanelSection title="Section" className="section-custom">
        <span>Section body</span>
      </PanelSection>,
    );

    const section = document.querySelector('.panel-section');
    expect(section).toHaveClass('section-custom');
    expect(screen.getByRole('heading', { name: 'Section' })).toBeVisible();
    expect(screen.getByText('Section body')).toBeVisible();
  });
});

