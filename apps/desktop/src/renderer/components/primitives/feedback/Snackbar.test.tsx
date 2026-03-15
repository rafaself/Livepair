import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Snackbar } from './Snackbar';
import { SnackbarProvider } from './SnackbarProvider';
import { useSnackbar } from './useSnackbar';

describe('Snackbar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders message with error variant and role="alert" by default', () => {
    render(<Snackbar id="t1" message="Something went wrong" onDismiss={vi.fn()} />);

    const el = screen.getByRole('alert');
    expect(el).toHaveClass('snackbar', 'snackbar--error');
    expect(el).toHaveTextContent('Something went wrong');
  });

  it('uses role="status" for non-error variants', () => {
    render(<Snackbar id="t1" message="Saved!" variant="success" onDismiss={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveClass('snackbar--success');
  });

  it('calls onDismiss with the snackbar id after close click and exit animation', () => {
    const onDismiss = vi.fn();
    render(<Snackbar id="t1" message="Error" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });

  it('auto-dismisses after the specified duration', () => {
    const onDismiss = vi.fn();
    render(<Snackbar id="t1" message="Error" duration={3000} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });

  it('does not call onDismiss twice when both auto and manual dismiss fire', () => {
    const onDismiss = vi.fn();
    render(<Snackbar id="t1" message="Error" duration={1000} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('SnackbarProvider + useSnackbar', () => {
  function Trigger() {
    const { showError, showSnackbar } = useSnackbar();
    return (
      <>
        <button onClick={() => showError('Network error')}>Trigger error</button>
        <button onClick={() => showSnackbar('Done', 'success')}>Trigger success</button>
      </>
    );
  }

  it('renders an error alert when showError is called', () => {
    render(
      <SnackbarProvider>
        <Trigger />
      </SnackbarProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger error' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });

  it('renders a success status when showSnackbar is called with success variant', () => {
    render(
      <SnackbarProvider>
        <Trigger />
      </SnackbarProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger success' }));
    expect(screen.getByRole('status')).toHaveTextContent('Done');
  });

  it('removes the snackbar from the DOM after dismissal', () => {
    vi.useFakeTimers();
    render(
      <SnackbarProvider>
        <Trigger />
      </SnackbarProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByRole('alert')).toBeNull();
    vi.useRealTimers();
  });

  it('throws when useSnackbar is called outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Bad() {
      useSnackbar();
      return null;
    }
    expect(() => render(<Bad />)).toThrow('useSnackbar must be used within a <SnackbarProvider>.');
    spy.mockRestore();
  });
});
