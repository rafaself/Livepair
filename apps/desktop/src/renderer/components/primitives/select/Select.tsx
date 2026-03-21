import { forwardRef, useMemo, useRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import { FloatingLayer } from '../../layout/FloatingLayer';
import type { FloatingPlacementStrategy } from '../../../hooks/floatingPositioning';
import { useFloatingLayer } from '../../../hooks/useFloatingLayer';
import { SelectContent } from './SelectContent';
import { SelectOption } from './SelectOption';
import { SelectTrigger } from './SelectTrigger';
import './Select.css';

export type SelectOptionItem = {
  value: string;
  label: string;
  content?: ReactNode;
  triggerContent?: ReactNode;
  tooltip?: string;
};

export type SelectProps = {
  options: readonly SelectOptionItem[];
  size?: 'sm' | 'md';
  placeholder?: ReactNode;
  widthMode?: 'anchor' | 'minAnchor';
  maxWidthPx?: number;
  portalTarget?: HTMLElement | null;
  placement?: FloatingPlacementStrategy;
  onOpen?: () => void;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size' | 'multiple'>;

const CLOSE_ANIMATION_MS = 120;

const POSITION_OPTIONS = {
  marginPx: 8,
  horizontalAlign: 'start' as const,
  flipInLowerHalfOnly: true,
};

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    options,
    size = 'md',
    className,
    value,
    onChange,
    disabled,
    placeholder,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    id,
    title,
    widthMode = 'anchor',
    maxWidthPx,
    portalTarget,
    placement = 'auto',
    name,
    form,
    required,
    autoComplete,
    onOpen,
  },
  ref,
): JSX.Element {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const nativeSelectRef = useRef<HTMLSelectElement | null>(null);
  const overlay = useFloatingLayer({ closeAnimationMs: CLOSE_ANIMATION_MS });

  const selectedOption = useMemo(() => {
    return options.find((opt) => {
      return opt.value === value;
    });
  }, [options, value]);

  const measureContentWidth = (content: HTMLElement): number => {
    if (widthMode !== 'minAnchor') {
      return 0;
    }

    const clone = content.cloneNode(true) as HTMLElement;
    clone.style.width = 'auto';
    clone.style.position = 'absolute';
    clone.style.visibility = 'hidden';
    clone.style.display = 'block';
    document.body.appendChild(clone);
    const width = clone.getBoundingClientRect().width;
    document.body.removeChild(clone);
    return Math.ceil(width) + 4;
  };

  const handleSelect = (nextValue: string): void => {
    const nativeSelect = nativeSelectRef.current;

    if (nativeSelect) {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value',
      )?.set;
      valueSetter?.call(nativeSelect, nextValue);
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    overlay.close();
  };

  const handleNativeFocus = (): void => {
    triggerRef.current?.focus();
  };

  return (
    <div className={`select${className ? ` ${className}` : ''}`}>
      <select
        ref={nativeSelectRef}
        id={id}
        className="select__native"
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        form={form}
        required={required}
        autoComplete={autoComplete}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={onChange ?? (() => {})}
        onFocus={handleNativeFocus}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <SelectTrigger
        ref={(element) => {
          triggerRef.current = element;

          if (!ref) {
            return;
          }

          if (typeof ref === 'function') {
            ref(element);
            return;
          }

          ref.current = element;
        }}
        isOpen={overlay.isOpen}
        onToggle={() => {
          if (!overlay.isOpen) onOpen?.();
          overlay.toggle();
        }}
        valueContent={selectedOption?.triggerContent ?? selectedOption?.content ?? selectedOption?.label}
        placeholder={placeholder ?? 'Select…'}
        size={size}
        disabled={disabled}
        title={selectedOption ? (selectedOption.tooltip ?? selectedOption.label) : title}
        ariaLabel={ariaLabel}
        aria-labelledby={ariaLabelledby}
      />

      <FloatingLayer
        triggerRef={triggerRef}
        isOpen={overlay.isOpen}
        isClosing={overlay.isClosing}
        estimatedItemCount={options.length}
        onDismiss={overlay.close}
        className="select__layer"
        portalTarget={portalTarget}
        positionOptions={{
          ...POSITION_OPTIONS,
          placement,
          widthMode,
          ...(maxWidthPx === undefined ? {} : { maxWidthPx }),
        }}
        measureContentWidth={measureContentWidth}
      >
        <SelectContent isClosing={overlay.isClosing}>
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <SelectOption
                key={option.value}
                selected={isSelected}
                onSelect={() => {
                  handleSelect(option.value);
                }}
                title={option.tooltip ?? option.label}
              >
                {option.content ?? option.label}
              </SelectOption>
            );
          })}
        </SelectContent>
      </FloatingLayer>
    </div>
  );
});
