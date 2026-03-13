import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import './ButtonGroup.css';

export type ButtonGroupOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type ButtonGroupProps<T extends string> = {
  value: T;
  options: readonly ButtonGroupOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

function getNextEnabledIndex<T extends string>(
  options: readonly ButtonGroupOption<T>[],
  startIndex: number,
  direction: 1 | -1,
): number {
  let currentIndex = startIndex;

  do {
    currentIndex = (currentIndex + direction + options.length) % options.length;
  } while (options[currentIndex]?.disabled);

  return currentIndex;
}

function getBoundaryIndex<T extends string>(
  options: readonly ButtonGroupOption<T>[],
  fromEnd: boolean,
): number {
  const orderedIndexes = options.map((_, index) => index);

  if (fromEnd) {
    orderedIndexes.reverse();
  }

  return orderedIndexes.find((index) => !options[index]?.disabled) ?? 0;
}

export function ButtonGroup<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  size = 'md',
}: ButtonGroupProps<T>): JSX.Element {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = options.findIndex((option) => option.value === value);
  const classes = ['button-group', `button-group--${size}`, className].filter(Boolean).join(' ');

  const focusOption = (index: number): void => {
    buttonRefs.current[index]?.focus();
  };

  const selectOption = (index: number): void => {
    const option = options[index];

    if (!option || option.disabled || option.value === value) {
      return;
    }

    onChange(option.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let targetIndex = index;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        targetIndex = getNextEnabledIndex(options, index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        targetIndex = getNextEnabledIndex(options, index, -1);
        break;
      case 'Home':
        targetIndex = getBoundaryIndex(options, false);
        break;
      case 'End':
        targetIndex = getBoundaryIndex(options, true);
        break;
      default:
        return;
    }

    event.preventDefault();
    selectOption(targetIndex);
    focusOption(targetIndex);
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={classes}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttonRefs.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-label={option.label}
          aria-checked={option.value === value}
          className="button-group__button"
          tabIndex={index === activeIndex ? 0 : -1}
          disabled={option.disabled}
          title={option.label}
          onClick={() => {
            selectOption(index);
          }}
          onKeyDown={(event) => {
            handleKeyDown(event, index);
          }}
        >
          {option.icon ? <span className="button-group__icon">{option.icon}</span> : option.label}
        </button>
      ))}
    </div>
  );
}
