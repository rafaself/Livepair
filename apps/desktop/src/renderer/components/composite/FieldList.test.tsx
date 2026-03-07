import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldList } from './FieldList';

describe('FieldList', () => {
  it('renders all label/value pairs', () => {
    render(
      <FieldList
        items={[
          { label: 'Mode', value: 'Fast' },
          { label: 'Status', value: 'Connected' },
        ]}
      />,
    );

    expect(screen.getByText('Mode')).toBeVisible();
    expect(screen.getByText('Fast')).toBeVisible();
    expect(screen.getByText('Status')).toBeVisible();
    expect(screen.getByText('Connected')).toBeVisible();
  });

  it('renders labels as dt and values as dd', () => {
    const { container } = render(
      <FieldList items={[{ label: 'Mode', value: 'Fast' }]} />,
    );

    expect(container.querySelector('dt')).toHaveTextContent('Mode');
    expect(container.querySelector('dd')).toHaveTextContent('Fast');
  });

  it('renders ReactNode values', () => {
    render(
      <FieldList
        items={[{ label: 'Backend', value: <span data-testid="node-value">complex</span> }]}
      />,
    );

    expect(screen.getByTestId('node-value')).toBeVisible();
  });

  it('renders an empty list without errors', () => {
    const { container } = render(<FieldList items={[]} />);
    expect(container.querySelector('dl')).toBeInTheDocument();
    expect(container.querySelectorAll('dt')).toHaveLength(0);
  });
});
