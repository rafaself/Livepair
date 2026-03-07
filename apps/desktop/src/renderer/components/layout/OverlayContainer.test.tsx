import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverlayContainer } from './OverlayContainer';

describe('OverlayContainer', () => {
  it('portals children to document.body', () => {
    render(
      <OverlayContainer>
        <div>Overlay content</div>
      </OverlayContainer>,
    );

    expect(screen.getByText('Overlay content')).toBeInTheDocument();
    expect(document.querySelector('.overlay-container')).toBeInTheDocument();
  });
});

