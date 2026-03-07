import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('handles open state, escape key, focus and backdrop click', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal isOpen={false} onClose={onClose} ariaLabel="Closed modal">
        <button type="button">Inner</button>
      </Modal>,
    );

    const closedBackdrop = document.querySelector('.modal__backdrop');
    expect(closedBackdrop).toHaveAttribute('aria-hidden', 'true');
    expect(closedBackdrop).not.toHaveClass('modal__backdrop--open');

    rerender(
      <Modal isOpen={true} onClose={onClose} ariaLabel="Open modal">
        <button type="button">First focus</button>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Open modal' });
    expect(screen.getByRole('button', { name: 'First focus' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);

    const openBackdrop = document.querySelector('.modal__backdrop');
    if (!openBackdrop) throw new Error('Expected modal backdrop');
    fireEvent.click(openBackdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

