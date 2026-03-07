import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UiStoreProvider } from '../../store/uiStore';
import { Launcher } from './Launcher';

describe('Launcher', () => {
  it('toggles aria attributes and open class using shared ui store state', () => {
    render(
      <UiStoreProvider>
        <Launcher />
      </UiStoreProvider>,
    );

    const openButton = screen.getByRole('button', { name: /open assistant panel/i });
    expect(openButton).toHaveAttribute('aria-expanded', 'false');
    expect(openButton).toHaveClass('launcher');
    expect(openButton).not.toHaveClass('launcher--open');

    fireEvent.click(openButton);

    const closeButton = screen.getByRole('button', { name: /close assistant panel/i });
    expect(closeButton).toHaveAttribute('aria-expanded', 'true');
    expect(closeButton).toHaveClass('launcher--open');
  });
});
