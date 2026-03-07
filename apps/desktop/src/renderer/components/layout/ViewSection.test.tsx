import { render, screen } from '@testing-library/react';
import { Wifi } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ViewSection } from './ViewSection';

describe('ViewSection', () => {
  it('renders the title as an h3 and exposes it as the section label', () => {
    render(
      <ViewSection icon={Wifi} title="Connection">
        <span>body</span>
      </ViewSection>,
    );

    expect(screen.getByRole('heading', { name: 'Connection', level: 3 })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Connection' })).toBeVisible();
  });

  it('renders children below the header', () => {
    render(
      <ViewSection icon={Wifi} title="Connection">
        <span>Section content</span>
      </ViewSection>,
    );

    expect(screen.getByText('Section content')).toBeVisible();
  });

  it('renders the horizontal rule', () => {
    render(
      <ViewSection icon={Wifi} title="Connection">
        <span>x</span>
      </ViewSection>,
    );

    expect(document.querySelector('.view-section__rule')).toBeInTheDocument();
  });

  it('renders the icon as decorative (aria-hidden)', () => {
    render(
      <ViewSection icon={Wifi} title="Connection">
        <span>x</span>
      </ViewSection>,
    );

    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
