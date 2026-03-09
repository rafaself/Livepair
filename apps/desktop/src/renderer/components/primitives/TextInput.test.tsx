import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('renders a visible label linked to the input and floats on focus', () => {
    render(<TextInput label="Backend URL" />);

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    const label = screen.getByText('Backend URL', { selector: 'label' });
    const control = textbox.closest('.outlined-field__control');

    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', textbox.id);
    expect(control).toHaveAttribute('data-floating', 'false');

    fireEvent.focus(textbox);

    expect(control).toHaveAttribute('data-focused', 'true');
    expect(control).toHaveAttribute('data-floating', 'true');
  });

  it('keeps the label floating when initialized with a value or defaultValue', () => {
    const { unmount } = render(<TextInput label="Backend URL" value="https://api.example.com" />);

    let textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    let control = textbox.closest('.outlined-field__control');
    expect(control).toHaveAttribute('data-filled', 'true');
    expect(control).toHaveAttribute('data-floating', 'true');

    unmount();
    render(<TextInput label="Backend URL" defaultValue="https://fallback.example.com" />);

    textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    control = textbox.closest('.outlined-field__control');
    expect(control).toHaveAttribute('data-filled', 'true');
    expect(control).toHaveAttribute('data-floating', 'true');
  });

  it('returns a labeled uncontrolled field to resting state when cleared and blurred', () => {
    render(<TextInput label="Backend URL" defaultValue="https://api.example.com" />);

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    const control = textbox.closest('.outlined-field__control');

    fireEvent.change(textbox, { target: { value: '' } });
    fireEvent.blur(textbox);

    expect(control).toHaveAttribute('data-filled', 'false');
    expect(control).toHaveAttribute('data-focused', 'false');
    expect(control).toHaveAttribute('data-floating', 'false');
  });

  it('renders an accessible textbox and forwards input events', () => {
    const onChange = vi.fn();

    render(
      <TextInput
        aria-label="Backend URL"
        value="http://localhost:3000"
        onChange={onChange}
      />,
    );

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    expect(textbox).toHaveValue('http://localhost:3000');

    fireEvent.change(textbox, { target: { value: 'https://api.example.com' } });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('applies size and invalid classes while forwarding native props', () => {
    render(
      <TextInput
        label="Backend URL"
        aria-label="Backend URL"
        size="sm"
        invalid
        disabled
        placeholder="https://api.example.com"
      />,
    );

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    const control = textbox.closest('.outlined-field__control');
    expect(textbox).toHaveAttribute('placeholder', '');
    expect(textbox).toHaveClass('text-input', 'text-input--sm', 'text-input--invalid');
    expect(textbox).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAttribute('data-invalid', 'true');
    expect(control).toHaveAttribute('data-disabled', 'true');
  });

  it('renders the text input inside the outlined field shell', () => {
    render(<TextInput label="Backend URL" />);

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    const control = textbox.closest('.outlined-field__control');
    const outline = control?.querySelector('.outlined-field__outline');

    expect(outline).toHaveAttribute('aria-hidden', 'true');
    expect(outline?.querySelector('.outlined-field__outline-start')).toBeInTheDocument();
    expect(outline?.querySelector('.outlined-field__outline-notch')).toBeInTheDocument();
    expect(outline?.querySelector('.outlined-field__outline-end')).toBeInTheDocument();
    expect(outline?.querySelector('.outlined-field__outline-notch-label')).toHaveTextContent(
      'Backend URL',
    );
  });

  it('shows a hint on focus and connects it with aria-describedby', () => {
    render(
      <TextInput
        label="Backend URL"
        hint="Use an https URL when available."
        placeholder="https://api.example.com"
      />,
    );

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    expect(screen.queryByText('Use an https URL when available.')).not.toBeInTheDocument();
    expect(textbox).toHaveAttribute('placeholder', '');

    fireEvent.focus(textbox);

    const details = screen.getByText('Use an https URL when available.');
    expect(textbox).toHaveAttribute('aria-describedby', details.id);
    expect(textbox).toHaveAttribute('placeholder', 'https://api.example.com');
  });

  it('validates on blur with rules and announces the validation message', () => {
    render(
      <TextInput
        label="Backend URL"
        aria-label="Backend URL"
        defaultValue="localhost"
        rules={[
          (value) => {
            return value.startsWith('https://') || 'URL must start with https://';
          },
        ]}
      />,
    );

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });

    fireEvent.blur(textbox);

    const details = screen.getByText('URL must start with https://');
    expect(textbox.closest('.outlined-field__control')).toHaveAttribute('data-invalid', 'true');
    expect(textbox).toHaveAttribute('aria-invalid', 'true');
    expect(textbox).toHaveAttribute('aria-describedby', details.id);
  });

  it('derives filled state from value prop without an extra render cycle', () => {
    function Wrapper(): JSX.Element {
      const [url, setUrl] = useState('https://api.example.com');

      return (
        <>
          <TextInput label="Backend URL" value={url} onChange={() => {}} />
          <button type="button" onClick={() => setUrl('')}>Clear</button>
        </>
      );
    }

    render(<Wrapper />);

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    const control = textbox.closest('.outlined-field__control');

    expect(control).toHaveAttribute('data-filled', 'true');
    expect(control).toHaveAttribute('data-floating', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(control).toHaveAttribute('data-filled', 'false');
    expect(control).toHaveAttribute('data-floating', 'false');
  });
});
