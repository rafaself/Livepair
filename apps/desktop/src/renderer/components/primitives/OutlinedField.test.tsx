import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutlinedField } from './OutlinedField';

describe('OutlinedField', () => {
  it('renders a visible label linked to the child control', () => {
    render(
      <OutlinedField label="Backend URL" htmlFor="backend-url" size="sm">
        <input id="backend-url" type="text" />
      </OutlinedField>,
    );

    const label = screen.getByText('Backend URL', { selector: 'label' });
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'backend-url');
  });

  it('renders the interrupted outline structure with segmented notch outline', () => {
    render(
      <OutlinedField label="Backend URL" htmlFor="backend-url" floating>
        <input id="backend-url" type="text" />
      </OutlinedField>,
    );

    const control = screen
      .getByText('Backend URL', { selector: 'label' })
      .closest('.outlined-field__control');
    const outline = control?.querySelector('.outlined-field__outline');
    const start = outline?.querySelector('.outlined-field__outline-start');
    const notch = outline?.querySelector('.outlined-field__outline-notch');
    const end = outline?.querySelector('.outlined-field__outline-end');
    const notchLabel = notch?.querySelector('.outlined-field__outline-notch-label');

    expect(outline).toHaveAttribute('aria-hidden', 'true');
    expect(start).toBeInTheDocument();
    expect(notch).toBeInTheDocument();
    expect(end).toBeInTheDocument();
    expect(notchLabel).toHaveTextContent('Backend URL');
  });

  it('exposes state through data attributes', () => {
    render(
      <OutlinedField
        label="Backend URL"
        htmlFor="backend-url"
        focused
        filled
        floating
        invalid
        disabled
      >
        <input id="backend-url" type="text" />
      </OutlinedField>,
    );

    const control = screen
      .getByText('Backend URL', { selector: 'label' })
      .closest('.outlined-field__control');

    expect(control).toHaveAttribute('data-focused', 'true');
    expect(control).toHaveAttribute('data-filled', 'true');
    expect(control).toHaveAttribute('data-floating', 'true');
    expect(control).toHaveAttribute('data-invalid', 'true');
    expect(control).toHaveAttribute('data-disabled', 'true');
  });
});
