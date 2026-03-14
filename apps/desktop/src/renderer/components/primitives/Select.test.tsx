import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { Select, type SelectRootProps } from './Select';

type TestSelectProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  items?: ReactNode;
};

function TestSelect({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  disabled,
  loading,
  items,
}: TestSelectProps): JSX.Element {
  const selectRootProps: Omit<SelectRootProps, 'children'> = {
    ...(value !== undefined ? { value } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(onValueChange !== undefined ? { onValueChange } : {}),
    ...(open !== undefined ? { open } : {}),
    ...(defaultOpen !== undefined ? { defaultOpen } : {}),
    ...(onOpenChange !== undefined ? { onOpenChange } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
    ...(loading !== undefined ? { loading } : {}),
  };

  return (
    <Select.Root {...selectRootProps}>
      <Select.Trigger aria-label="Preferred mode">
        <Select.Value placeholder="Select mode" />
        <Select.Icon />
      </Select.Trigger>

      <Select.Content>
        <Select.Viewport>
          {items ?? (
            <>
              <Select.Item value="fast" textValue="Quick">
                <Select.ItemText>Fast</Select.ItemText>
              </Select.Item>
              <Select.Item value="balanced" disabled>
                <Select.ItemText>Balanced</Select.ItemText>
              </Select.Item>
              <Select.Item value="thinking">
                <Select.ItemText>Thinking</Select.ItemText>
              </Select.Item>
            </>
          )}
        </Select.Viewport>
      </Select.Content>
    </Select.Root>
  );
}

function mockSelectGeometry(contentHeight = 160): () => void {
  const getBoundingClientRectSpy = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function mockRect(this: HTMLElement): DOMRect {
      if (this.classList.contains('select__trigger')) {
        return {
          x: 100,
          y: 100,
          width: 180,
          height: 32,
          top: 100,
          right: 280,
          bottom: 132,
          left: 100,
          toJSON: () => ({}),
        } as DOMRect;
      }

      if (this.classList.contains('select__content')) {
        return {
          x: 0,
          y: 0,
          width: 180,
          height: contentHeight,
          top: 0,
          right: 180,
          bottom: contentHeight,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

  const offsetHeightSpy = vi
    .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
    .mockImplementation(function mockOffsetHeight(this: HTMLElement): number {
      if (this.classList.contains('select__content')) {
        return contentHeight;
      }

      if (this.classList.contains('select__trigger')) {
        return 32;
      }

      return 0;
    });

  const offsetWidthSpy = vi
    .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockImplementation(function mockOffsetWidth(this: HTMLElement): number {
      if (this.classList.contains('select__content') || this.classList.contains('select__trigger')) {
        return 180;
      }

      return 0;
    });

  return () => {
    getBoundingClientRectSpy.mockRestore();
    offsetHeightSpy.mockRestore();
    offsetWidthSpy.mockRestore();
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Select', () => {
  it('supports uncontrolled value changes and renders placeholder state', async () => {
    const restoreGeometry = mockSelectGeometry();

    render(<TestSelect />);

    const trigger = screen.getByRole('button', { name: 'Preferred mode' });
    expect(trigger).toHaveAttribute('data-placeholder');
    expect(screen.getByText('Select mode')).toBeVisible();

    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    await waitFor(() => expect(listbox).toHaveFocus());

    fireEvent.click(screen.getByRole('option', { name: 'Thinking' }));

    expect(screen.getByRole('button', { name: 'Preferred mode' })).toHaveTextContent('Thinking');
    expect(screen.getByRole('button', { name: 'Preferred mode' })).not.toHaveAttribute(
      'data-placeholder',
    );

    restoreGeometry();
  });

  it('supports controlled value and controlled open state', async () => {
    const onOpenChange = vi.fn();
    const onValueChange = vi.fn();
    const restoreGeometry = mockSelectGeometry();

    const { rerender } = render(
      <TestSelect value="fast" open={false} onOpenChange={onOpenChange} onValueChange={onValueChange} />,
    );

    const trigger = screen.getByRole('button', { name: 'Preferred mode' });
    expect(trigger).toHaveTextContent('Fast');

    fireEvent.click(trigger);

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    rerender(
      <TestSelect value="fast" open={true} onOpenChange={onOpenChange} onValueChange={onValueChange} />,
    );

    const listbox = screen.getByRole('listbox');
    await waitFor(() => expect(listbox).toHaveFocus());

    fireEvent.click(screen.getByRole('option', { name: 'Thinking' }));

    expect(onValueChange).toHaveBeenCalledWith('thinking');
    expect(trigger).toHaveTextContent('Fast');

    restoreGeometry();
  });

  it('implements keyboard navigation, typeahead, tab flow, and focus restoration', async () => {
    const restoreGeometry = mockSelectGeometry();

    render(
      <>
        <TestSelect />
        <button type="button">After select</button>
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'Preferred mode' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const listbox = screen.getByRole('listbox');
    await waitFor(() => expect(listbox).toHaveFocus());
    expect(screen.getByRole('option', { name: 'Fast' })).toHaveAttribute('data-highlighted');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Thinking' })).toHaveAttribute('data-highlighted');

    fireEvent.keyDown(listbox, { key: 'Home' });
    expect(screen.getByRole('option', { name: 'Fast' })).toHaveAttribute('data-highlighted');

    fireEvent.keyDown(listbox, { key: 'q' });
    expect(screen.getByRole('option', { name: 'Fast' })).toHaveAttribute('data-highlighted');

    fireEvent.keyDown(listbox, { key: 'End' });
    expect(screen.getByRole('option', { name: 'Thinking' })).toHaveAttribute('data-highlighted');

    fireEvent.keyDown(listbox, { key: 'Tab' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'After select' })).toHaveFocus();

    fireEvent.keyDown(trigger, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('listbox')).toHaveFocus());

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    restoreGeometry();
  });

  it('marks disabled items, skips them during navigation, and sets empty/loading attributes', async () => {
    const restoreGeometry = mockSelectGeometry();

    const { rerender } = render(<TestSelect loading defaultOpen />);

    const content = document.querySelector('.select__content');
    if (!content) throw new Error('Expected select content');

    const listbox = screen.getByRole('listbox');
    await waitFor(() => expect(listbox).toHaveFocus());
    expect(content).toHaveAttribute('aria-busy', 'true');

    const disabledOption = screen.getByRole('option', { name: 'Balanced' });
    expect(disabledOption).toHaveAttribute('data-disabled');
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: 'Fast' })).toHaveAttribute('data-highlighted');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Thinking' })).toHaveAttribute('data-highlighted');

    rerender(
      <TestSelect
        defaultOpen
        items={
          <Select.Group>
            <Select.Label>No options</Select.Label>
          </Select.Group>
        }
      />,
    );

    const emptyViewport = screen.getByRole('listbox');
    expect(emptyViewport).toHaveAttribute('data-empty');

    restoreGeometry();
  });

  it('renders the placeholder when the selected item is removed', () => {
    const restoreGeometry = mockSelectGeometry();

    const { rerender } = render(<TestSelect value="thinking" />);

    expect(screen.getByRole('button', { name: 'Preferred mode' })).toHaveTextContent('Thinking');

    rerender(
      <TestSelect
        value="thinking"
        items={
          <>
            <Select.Item value="fast">
              <Select.ItemText>Fast</Select.ItemText>
            </Select.Item>
          </>
        }
      />,
    );

    expect(screen.getByRole('button', { name: 'Preferred mode' })).toHaveTextContent('Select mode');
    expect(screen.getByRole('button', { name: 'Preferred mode' })).toHaveAttribute(
      'data-placeholder',
    );

    restoreGeometry();
  });

  it('positions the portal content against the trigger and flips near the viewport edge', async () => {
    const originalInnerHeight = window.innerHeight;
    const originalInnerWidth = window.innerWidth;
    const restoreGeometry = mockSelectGeometry(200);

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });

    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function mockRect(this: HTMLElement): DOMRect {
        if (this.classList.contains('select__trigger')) {
          return {
            x: 580,
            y: 560,
            width: 180,
            height: 32,
            top: 560,
            right: 760,
            bottom: 592,
            left: 580,
            toJSON: () => ({}),
          } as DOMRect;
        }

        if (this.classList.contains('select__content')) {
          return {
            x: 0,
            y: 0,
            width: 180,
            height: 200,
            top: 0,
            right: 180,
            bottom: 200,
            left: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }

        return {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    render(<TestSelect defaultOpen />);

    const content = document.querySelector('.select__content');
    if (!content) throw new Error('Expected select content');

    await waitFor(() => {
      expect(content).toHaveStyle({
        left: '580px',
        top: '356px',
        minWidth: '180px',
        maxHeight: '552px',
      });
    });

    expect(content).toHaveAttribute('data-side', 'top');

    getBoundingClientRectSpy.mockRestore();
    restoreGeometry();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
  });

  it('works with a controlled state harness end to end', async () => {
    const restoreGeometry = mockSelectGeometry();

    function Harness(): JSX.Element {
      const [value, setValue] = useState('fast');
      const [open, setOpen] = useState(false);

      return <TestSelect value={value} open={open} onValueChange={setValue} onOpenChange={setOpen} />;
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Preferred mode' }));
    await waitFor(() => expect(screen.getByRole('listbox')).toHaveFocus());

    fireEvent.click(screen.getByRole('option', { name: 'Thinking' }));

    expect(screen.getByRole('button', { name: 'Preferred mode' })).toHaveTextContent('Thinking');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    restoreGeometry();
  });
});
