import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextInput } from './TextInput';

describe('TextInput', () => {
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
        aria-label="Backend URL"
        size="sm"
        invalid
        placeholder="https://api.example.com"
      />,
    );

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    expect(textbox).toHaveAttribute('placeholder', 'https://api.example.com');
    expect(textbox).toHaveClass('text-input', 'text-input--sm', 'text-input--invalid');
    expect(textbox).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a hint on focus and connects it with aria-describedby', () => {
    render(<TextInput aria-label="Backend URL" hint="Use an https URL when available." />);

    const textbox = screen.getByRole('textbox', { name: 'Backend URL' });
    expect(screen.queryByText('Use an https URL when available.')).not.toBeInTheDocument();

    fireEvent.focus(textbox);

    const details = screen.getByText('Use an https URL when available.');
    expect(textbox).toHaveAttribute('aria-describedby', details.id);
  });

  it('validates on blur with rules and announces the validation message', () => {
    render(
      <TextInput
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
    expect(textbox).toHaveAttribute('aria-invalid', 'true');
    expect(textbox).toHaveAttribute('aria-describedby', details.id);
  });
});
