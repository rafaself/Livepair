import {
  Children,
  createContext,
  useCallback,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import './Select.css';

const VIEWPORT_PADDING = 8;
const CONTENT_GAP = 4;
const TYPEAHEAD_RESET_MS = 700;

type SelectItemRecord = {
  value: string;
  disabled: boolean;
  id: string;
  order: number;
  element: HTMLDivElement | null;
  label: string | null;
  textValue: string;
};

type OpenHighlightStrategy = 'selected' | 'first' | 'last';

type SelectContextValue = {
  contentId: string;
  value: string | undefined;
  open: boolean;
  disabled: boolean;
  loading: boolean;
  highlightedValue: string | undefined;
  items: SelectItemRecord[];
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
  contentRef: MutableRefObject<HTMLDivElement | null>;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  isPlaceholder: boolean;
  selectedItem: SelectItemRecord | undefined;
  setHighlightedValue: (value: string | undefined) => void;
  onTriggerOpen: (strategy?: OpenHighlightStrategy) => void;
  onToggleOpen: () => void;
  onClose: (options?: CloseOptions) => void;
  onSelectValue: (value: string) => void;
  onMoveHighlight: (direction: 1 | -1) => void;
  onHighlightEdge: (edge: 'start' | 'end') => void;
  onTypeahead: (character: string) => void;
  registerItem: (item: Omit<SelectItemRecord, 'order'>) => void;
  updateItem: (value: string, next: Partial<Omit<SelectItemRecord, 'value' | 'order'>>) => void;
  unregisterItem: (value: string) => void;
};

type GroupContextValue = {
  labelId: string;
};

type ItemContextValue = {
  value: string;
};

type CloseOptions = {
  restoreFocus?: boolean;
};

const SelectContext = createContext<SelectContextValue | null>(null);
const SelectGroupContext = createContext<GroupContextValue | null>(null);
const SelectItemContext = createContext<ItemContextValue | null>(null);

export type SelectRootProps = {
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
};

export type SelectTriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'role' | 'type' | 'value'
>;

export type SelectValueProps = {
  placeholder?: ReactNode;
} & HTMLAttributes<HTMLSpanElement>;

export type SelectIconProps = HTMLAttributes<HTMLSpanElement>;

export type SelectContentProps = HTMLAttributes<HTMLDivElement>;

export type SelectViewportProps = HTMLAttributes<HTMLDivElement>;

export type SelectItemProps = {
  value: string;
  disabled?: boolean;
  textValue?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
    children: ReactNode;
  };

export type SelectItemTextProps = HTMLAttributes<HTMLSpanElement>;

export type SelectGroupProps = HTMLAttributes<HTMLDivElement>;

export type SelectLabelProps = HTMLAttributes<HTMLDivElement>;

export type SelectSeparatorProps = HTMLAttributes<HTMLDivElement>;

function useSelectContext(componentName: string): SelectContextValue {
  const context = useContext(SelectContext);

  if (!context) {
    throw new Error(`${componentName} must be used inside Select.Root`);
  }

  return context;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T): void {
  if (!ref) return;

  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  (ref as MutableRefObject<T>).current = value;
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): Ref<T> {
  return (value) => {
    refs.forEach((ref) => assignRef(ref, value));
  };
}

function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: {
  value: T | undefined;
  defaultValue: T;
  onChange?: (value: T) => void;
}): [T, (next: T) => void] {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const setValue = (next: T): void => {
    if (!isControlled) {
      setInternalValue(next);
    }

    if (!Object.is(currentValue, next)) {
      onChange?.(next);
    }
  };

  return [currentValue, setValue];
}

function sortItems(items: SelectItemRecord[]): SelectItemRecord[] {
  return [...items].sort((left, right) => {
    if (left.element && right.element) {
      const position = left.element.compareDocumentPosition(right.element);

      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }

      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
    }

    return left.order - right.order;
  });
}

function findEnabledItems(items: SelectItemRecord[]): SelectItemRecord[] {
  return items.filter((item) => !item.disabled);
}

function getItemLabelText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }

      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getItemLabelText(child.props.children);
      }

      return '';
    })
    .join('')
    .trim();
}

function findItemByValue(items: SelectItemRecord[], value: string | undefined): SelectItemRecord | undefined {
  if (!value) {
    return undefined;
  }

  return items.find((item) => item.value === value);
}

function getInitialHighlight(
  items: SelectItemRecord[],
  selectedValue: string | undefined,
  strategy: OpenHighlightStrategy,
): string | undefined {
  const enabledItems = findEnabledItems(items);

  if (enabledItems.length === 0) {
    return undefined;
  }

  if (strategy === 'last') {
    return enabledItems[enabledItems.length - 1]?.value;
  }

  const selectedItem = findItemByValue(enabledItems, selectedValue);
  if (selectedItem) {
    return selectedItem.value;
  }

  return enabledItems[0]?.value;
}

function getNextHighlight(
  items: SelectItemRecord[],
  currentValue: string | undefined,
  direction: 1 | -1,
): string | undefined {
  const enabledItems = findEnabledItems(items);

  if (enabledItems.length === 0) {
    return undefined;
  }

  if (!currentValue) {
    return direction === 1
      ? enabledItems[0]?.value
      : enabledItems[enabledItems.length - 1]?.value;
  }

  const currentIndex = enabledItems.findIndex((item) => item.value === currentValue);
  if (currentIndex === -1) {
    return direction === 1
      ? enabledItems[0]?.value
      : enabledItems[enabledItems.length - 1]?.value;
  }

  const nextIndex = (currentIndex + direction + enabledItems.length) % enabledItems.length;
  return enabledItems[nextIndex]?.value;
}

function findTypeaheadMatch(
  items: SelectItemRecord[],
  search: string,
  currentValue: string | undefined,
): string | undefined {
  const enabledItems = findEnabledItems(items);
  if (enabledItems.length === 0) {
    return undefined;
  }

  const normalizedSearch = search.toLowerCase();
  const currentIndex = enabledItems.findIndex((item) => item.value === currentValue);
  const startIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % enabledItems.length;
  const orderedItems = [
    ...enabledItems.slice(startIndex),
    ...enabledItems.slice(0, startIndex),
  ];

  const exactMatch = orderedItems.find((item) =>
    item.textValue.toLowerCase().startsWith(normalizedSearch),
  );
  if (exactMatch) {
    return exactMatch.value;
  }

  if (
    normalizedSearch.length > 1 &&
    normalizedSearch.split('').every((character) => character === normalizedSearch[0])
  ) {
    return findTypeaheadMatch(items, normalizedSearch[0] ?? '', currentValue);
  }

  return undefined;
}

function getTabbableElements(container: ParentNode): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('aria-hidden'));
}

function focusRelativeToTrigger(trigger: HTMLElement, direction: 1 | -1): void {
  const tabbableElements = getTabbableElements(document);
  const triggerIndex = tabbableElements.indexOf(trigger);

  if (triggerIndex === -1) {
    return;
  }

  const nextIndex = triggerIndex + direction;
  const nextElement = tabbableElements[nextIndex];
  nextElement?.focus();
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function SelectRoot({
  children,
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  loading = false,
}: SelectRootProps): JSX.Element {
  const contentId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Map<string, SelectItemRecord>>(new Map());
  const itemOrderRef = useRef(0);
  const typeaheadBufferRef = useRef('');
  const typeaheadTimeoutRef = useRef<number | null>(null);
  const [itemsVersion, setItemsVersion] = useState(0);
  const [highlightedValue, setHighlightedValue] = useState<string | undefined>(undefined);
  const [value, setValue] = useControllableState<string | undefined>({
    value: valueProp,
    defaultValue,
    onChange: onValueChange,
  });
  const [open, setOpen] = useControllableState<boolean>({
    value: openProp,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });

  const items = sortItems(Array.from(itemsRef.current.values()));
  const selectedItem = findItemByValue(items, value);
  const isPlaceholder = !selectedItem;

  const resetTypeahead = useCallback((): void => {
    typeaheadBufferRef.current = '';
    if (typeaheadTimeoutRef.current !== null) {
      window.clearTimeout(typeaheadTimeoutRef.current);
      typeaheadTimeoutRef.current = null;
    }
  }, []);

  const onClose = useCallback(({ restoreFocus = true }: CloseOptions = {}): void => {
    setOpen(false);
    setHighlightedValue(undefined);
    resetTypeahead();

    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, [setOpen]);

  const onTriggerOpen = useCallback((strategy: OpenHighlightStrategy = 'selected'): void => {
    if (disabled) {
      return;
    }

    setHighlightedValue(getInitialHighlight(items, value, strategy));
    setOpen(true);
  }, [disabled, items, setOpen, value]);

  const onToggleOpen = useCallback((): void => {
    if (open) {
      onClose();
      return;
    }

    onTriggerOpen();
  }, [onClose, onTriggerOpen, open]);

  const onSelectValue = useCallback((nextValue: string): void => {
    setValue(nextValue);
    onClose();
  }, [onClose, setValue]);

  const onMoveHighlight = useCallback((direction: 1 | -1): void => {
    setHighlightedValue(getNextHighlight(items, highlightedValue, direction));
  }, [highlightedValue, items]);

  const onHighlightEdge = useCallback((edge: 'start' | 'end'): void => {
    const enabledItems = findEnabledItems(items);
    if (enabledItems.length === 0) {
      setHighlightedValue(undefined);
      return;
    }

    setHighlightedValue(
      edge === 'start'
        ? enabledItems[0]?.value
        : enabledItems[enabledItems.length - 1]?.value,
    );
  }, [items]);

  const onTypeahead = useCallback((character: string): void => {
    const normalizedCharacter = character.toLowerCase();
    if (!normalizedCharacter.trim()) {
      return;
    }

    const nextBuffer = `${typeaheadBufferRef.current}${normalizedCharacter}`;
    typeaheadBufferRef.current = nextBuffer;

    const match = findTypeaheadMatch(items, nextBuffer, highlightedValue);
    if (match) {
      setHighlightedValue(match);
    }

    if (typeaheadTimeoutRef.current !== null) {
      window.clearTimeout(typeaheadTimeoutRef.current);
    }

    typeaheadTimeoutRef.current = window.setTimeout(() => {
      typeaheadBufferRef.current = '';
      typeaheadTimeoutRef.current = null;
    }, TYPEAHEAD_RESET_MS);
  }, [highlightedValue, items]);

  const registerItem = useCallback((item: Omit<SelectItemRecord, 'order'>): void => {
    const existingItem = itemsRef.current.get(item.value);
    const nextItem: SelectItemRecord = {
      ...existingItem,
      ...item,
      order: existingItem?.order ?? itemOrderRef.current++,
    };

    if (
      existingItem &&
      existingItem.disabled === nextItem.disabled &&
      existingItem.id === nextItem.id &&
      existingItem.element === nextItem.element &&
      existingItem.label === nextItem.label &&
      existingItem.textValue === nextItem.textValue
    ) {
      return;
    }

    itemsRef.current.set(item.value, nextItem);
    setItemsVersion((current) => current + 1);
  }, []);

  const updateItem = useCallback((
    itemValue: string,
    next: Partial<Omit<SelectItemRecord, 'value' | 'order'>>,
  ): void => {
    const existingItem = itemsRef.current.get(itemValue);
    if (!existingItem) {
      return;
    }

    const nextItem = {
      ...existingItem,
      ...next,
    };

    if (
      existingItem.disabled === nextItem.disabled &&
      existingItem.id === nextItem.id &&
      existingItem.element === nextItem.element &&
      existingItem.label === nextItem.label &&
      existingItem.textValue === nextItem.textValue
    ) {
      return;
    }

    itemsRef.current.set(itemValue, nextItem);
    setItemsVersion((current) => current + 1);
  }, []);

  const unregisterItem = useCallback((itemValue: string): void => {
    if (!itemsRef.current.delete(itemValue)) {
      return;
    }

    setItemsVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const viewportElement = viewportRef.current;
    viewportElement?.focus();
  }, [open, itemsVersion]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (highlightedValue && findItemByValue(items, highlightedValue)) {
      return;
    }

    setHighlightedValue(getInitialHighlight(items, value, 'selected'));
  }, [highlightedValue, items, open, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleMouseDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        triggerRef.current?.contains(target) ||
        contentRef.current?.contains(target)
      ) {
        return;
      }

      onClose({ restoreFocus: false });
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose, open]);

  useEffect(() => {
    return () => resetTypeahead();
  }, [resetTypeahead]);

  const contextValue: SelectContextValue = {
    contentId,
    value,
    open,
    disabled,
    loading,
    highlightedValue,
    items,
    triggerRef,
    contentRef,
    viewportRef,
    isPlaceholder,
    selectedItem,
    setHighlightedValue,
    onTriggerOpen,
    onToggleOpen,
    onClose,
    onSelectValue,
    onMoveHighlight,
    onHighlightEdge,
    onTypeahead,
    registerItem,
    updateItem,
    unregisterItem,
  };

  return <SelectContext.Provider value={contextValue}>{children}</SelectContext.Provider>;
}

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  function SelectTrigger(
    { className, children, disabled: disabledProp, onClick, onKeyDown, ...rest },
    ref,
  ): JSX.Element {
    const {
      contentId,
      open,
      disabled,
      triggerRef,
      onClose,
      onToggleOpen,
      onTriggerOpen,
      isPlaceholder,
    } = useSelectContext('Select.Trigger');
    const isDisabled = disabled || disabledProp;
    const classes = `select__trigger${className ? ` ${className}` : ''}`;

    return (
      <button
        ref={mergeRefs(ref, triggerRef)}
        type="button"
        className={classes}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={contentId}
        data-state={open ? 'open' : 'closed'}
        data-disabled={isDisabled ? '' : undefined}
        data-placeholder={isPlaceholder ? '' : undefined}
        disabled={isDisabled}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !isDisabled) {
            onToggleOpen();
          }
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || isDisabled) {
            return;
          }

          switch (event.key) {
            case 'ArrowDown':
              event.preventDefault();
              onTriggerOpen('first');
              break;
            case 'ArrowUp':
              event.preventDefault();
              onTriggerOpen('last');
              break;
            case 'Enter':
            case ' ':
              event.preventDefault();
              onTriggerOpen();
              break;
            case 'Escape':
              if (open) {
                event.preventDefault();
                onClose();
              }
              break;
            default:
              break;
          }
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export const SelectValue = forwardRef<HTMLSpanElement, SelectValueProps>(function SelectValue(
  { className, placeholder, ...rest },
  ref,
): JSX.Element {
  const { selectedItem, isPlaceholder } = useSelectContext('Select.Value');
  const classes = `select__value${className ? ` ${className}` : ''}`;

  return (
    <span
      ref={ref}
      className={classes}
      data-placeholder={isPlaceholder ? '' : undefined}
      {...rest}
    >
      {isPlaceholder ? placeholder : selectedItem?.label}
    </span>
  );
});

export const SelectIcon = forwardRef<HTMLSpanElement, SelectIconProps>(function SelectIcon(
  { className, children, ...rest },
  ref,
): JSX.Element {
  const { open } = useSelectContext('Select.Icon');
  const classes = `select__icon${className ? ` ${className}` : ''}`;

  return (
    <span
      ref={ref}
      className={classes}
      aria-hidden="true"
      data-state={open ? 'open' : 'closed'}
      {...rest}
    >
      {children ?? (
        <svg
          className="select__icon-svg"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          focusable="false"
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.2"
          />
        </svg>
      )}
    </span>
  );
});

function useContentPosition(
  open: boolean,
  triggerRef: MutableRefObject<HTMLButtonElement | null>,
  contentRef: MutableRefObject<HTMLDivElement | null>,
  itemCount: number,
): {
  style: CSSProperties;
  side: 'top' | 'bottom';
} {
  const [style, setStyle] = useState<CSSProperties>({});
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = (): void => {
      const triggerElement = triggerRef.current;
      const contentElement = contentRef.current;

      if (!triggerElement || !contentElement) {
        return;
      }

      const triggerRect = triggerElement.getBoundingClientRect();
      const contentHeight =
        contentElement.offsetHeight || contentElement.getBoundingClientRect().height;
      const contentWidth =
        contentElement.offsetWidth || contentElement.getBoundingClientRect().width;
      const availableBelow = Math.max(
        0,
        window.innerHeight - triggerRect.bottom - VIEWPORT_PADDING,
      );
      const availableAbove = Math.max(0, triggerRect.top - VIEWPORT_PADDING);
      const nextSide =
        availableBelow < contentHeight && availableAbove > availableBelow ? 'top' : 'bottom';
      const top =
        nextSide === 'top'
          ? Math.max(VIEWPORT_PADDING, triggerRect.top - contentHeight - CONTENT_GAP)
          : clamp(
              triggerRect.bottom + CONTENT_GAP,
              VIEWPORT_PADDING,
              window.innerHeight - VIEWPORT_PADDING - contentHeight,
            );
      const left = clamp(
        triggerRect.left,
        VIEWPORT_PADDING,
        window.innerWidth - VIEWPORT_PADDING - Math.max(triggerRect.width, contentWidth),
      );

      setSide(nextSide);
      setStyle({
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        minWidth: `${Math.round(triggerRect.width)}px`,
        maxHeight: `${Math.round(nextSide === 'top' ? availableAbove : availableBelow)}px`,
      });
    };

    updatePosition();

    const animationFrameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    let resizeObserver: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(updatePosition);
      if (triggerRef.current) {
        resizeObserver.observe(triggerRef.current);
      }
      if (contentRef.current) {
        resizeObserver.observe(contentRef.current);
      }
    }

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      resizeObserver?.disconnect();
    };
  }, [contentRef, itemCount, open, triggerRef]);

  return { style, side };
}

export const SelectContent = forwardRef<HTMLDivElement, SelectContentProps>(function SelectContent(
  { className, children, ...rest },
  ref,
): JSX.Element {
  const { open, contentRef, triggerRef, loading, items } = useSelectContext('Select.Content');
  const { style, side } = useContentPosition(open, triggerRef, contentRef, items.length);
  const classes = `select__content${className ? ` ${className}` : ''}`;

  return createPortal(
    <div
      ref={mergeRefs(ref, contentRef)}
      className={classes}
      data-state={open ? 'open' : 'closed'}
      data-side={side}
      data-empty={items.length === 0 ? '' : undefined}
      aria-busy={loading || undefined}
      aria-hidden={!open}
      hidden={!open}
      style={open ? style : undefined}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  ) as JSX.Element;
});

export const SelectViewport = forwardRef<HTMLDivElement, SelectViewportProps>(
  function SelectViewport({ className, onKeyDown, ...rest }, ref): JSX.Element {
    const {
      contentId,
      items,
      highlightedValue,
      triggerRef,
      viewportRef,
      onClose,
      onMoveHighlight,
      onHighlightEdge,
      onSelectValue,
      onTypeahead,
    } = useSelectContext('Select.Viewport');
    const classes = `select__viewport${className ? ` ${className}` : ''}`;
    const highlightedItem = findItemByValue(items, highlightedValue);

    return (
      <div
        ref={mergeRefs(ref, viewportRef)}
        id={contentId}
        role="listbox"
        tabIndex={-1}
        className={classes}
        aria-activedescendant={highlightedItem?.id}
        data-empty={items.length === 0 ? '' : undefined}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) {
            return;
          }

          if (
            event.key.length === 1 &&
            event.key !== ' ' &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            onTypeahead(event.key);
            return;
          }

          switch (event.key) {
            case 'ArrowDown':
              event.preventDefault();
              onMoveHighlight(1);
              break;
            case 'ArrowUp':
              event.preventDefault();
              onMoveHighlight(-1);
              break;
            case 'Home':
              event.preventDefault();
              onHighlightEdge('start');
              break;
            case 'End':
              event.preventDefault();
              onHighlightEdge('end');
              break;
            case 'Enter':
            case ' ':
              event.preventDefault();
              if (highlightedItem && !highlightedItem.disabled) {
                onSelectValue(highlightedItem.value);
              }
              break;
            case 'Escape':
              event.preventDefault();
              onClose();
              break;
            case 'Tab':
              onClose({ restoreFocus: false });
              if (triggerRef.current) {
                focusRelativeToTrigger(triggerRef.current, event.shiftKey ? -1 : 1);
              }
              event.preventDefault();
              break;
            default:
              break;
          }
        }}
        {...rest}
      />
    );
  },
);

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(function SelectItem(
  { className, children, value, disabled = false, textValue, onClick, onMouseMove, onMouseDown, ...rest },
  ref,
): JSX.Element {
  const id = useId();
  const itemRef = useRef<HTMLDivElement | null>(null);
  const fallbackTextValue = textValue?.trim() || getItemLabelText(children);
  const {
    value: selectedValue,
    highlightedValue,
    registerItem,
    updateItem,
    unregisterItem,
    setHighlightedValue,
    onSelectValue,
  } = useSelectContext('Select.Item');
  const classes = `select__item${className ? ` ${className}` : ''}`;
  const isSelected = selectedValue === value;
  const isHighlighted = highlightedValue === value;

  useLayoutEffect(() => {
    registerItem({
      value,
      disabled,
      id,
      element: itemRef.current,
      label: fallbackTextValue,
      textValue: fallbackTextValue,
    });

    return () => unregisterItem(value);
  }, [disabled, fallbackTextValue, id, registerItem, unregisterItem, value]);

  useLayoutEffect(() => {
    updateItem(value, {
      element: itemRef.current,
      disabled,
      label: fallbackTextValue,
      textValue: fallbackTextValue,
    });
  }, [disabled, fallbackTextValue, updateItem, value]);

  return (
    <SelectItemContext.Provider value={{ value }}>
      <div
        ref={mergeRefs(ref, itemRef)}
        id={id}
        role="option"
        aria-selected={isSelected}
        aria-disabled={disabled || undefined}
        className={classes}
        data-disabled={disabled ? '' : undefined}
        data-highlighted={isHighlighted ? '' : undefined}
        data-selected={isSelected ? '' : undefined}
        onMouseMove={(event) => {
          onMouseMove?.(event);
          if (!event.defaultPrevented && !disabled) {
            setHighlightedValue(value);
          }
        }}
        onMouseDown={(event) => {
          onMouseDown?.(event);
          if (!event.defaultPrevented) {
            event.preventDefault();
          }
        }}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !disabled) {
            onSelectValue(value);
          }
        }}
        {...rest}
      >
        {children}
      </div>
    </SelectItemContext.Provider>
  );
});

export const SelectItemText = forwardRef<HTMLSpanElement, SelectItemTextProps>(
  function SelectItemText({ className, children, ...rest }, ref): JSX.Element {
    const itemContext = useContext(SelectItemContext);
    const { updateItem } = useSelectContext('Select.ItemText');
    const classes = `select__item-text${className ? ` ${className}` : ''}`;
    const itemLabel = getItemLabelText(children);

    useLayoutEffect(() => {
      if (!itemContext) {
        return;
      }

      updateItem(itemContext.value, {
        label: itemLabel,
      });
    }, [itemContext, itemLabel, updateItem]);

    return (
      <span ref={ref} className={classes} {...rest}>
        {children}
      </span>
    );
  },
);

export const SelectGroup = forwardRef<HTMLDivElement, SelectGroupProps>(function SelectGroup(
  { className, ...rest },
  ref,
): JSX.Element {
  const labelId = useId();
  const classes = `select__group${className ? ` ${className}` : ''}`;

  return (
    <SelectGroupContext.Provider value={{ labelId }}>
      <div ref={ref} role="group" aria-labelledby={labelId} className={classes} {...rest} />
    </SelectGroupContext.Provider>
  );
});

export const SelectLabel = forwardRef<HTMLDivElement, SelectLabelProps>(function SelectLabel(
  { className, ...rest },
  ref,
): JSX.Element {
  const groupContext = useContext(SelectGroupContext);
  const classes = `select__label${className ? ` ${className}` : ''}`;

  return <div ref={ref} id={groupContext?.labelId} className={classes} {...rest} />;
});

export const SelectSeparator = forwardRef<HTMLDivElement, SelectSeparatorProps>(
  function SelectSeparator({ className, ...rest }, ref): JSX.Element {
    const classes = `select__separator${className ? ` ${className}` : ''}`;

    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation="horizontal"
        className={classes}
        {...rest}
      />
    );
  },
);

type SelectComponent = {
  Root: typeof SelectRoot;
  Trigger: typeof SelectTrigger;
  Value: typeof SelectValue;
  Icon: typeof SelectIcon;
  Content: typeof SelectContent;
  Viewport: typeof SelectViewport;
  Item: typeof SelectItem;
  ItemText: typeof SelectItemText;
  Group: typeof SelectGroup;
  Label: typeof SelectLabel;
  Separator: typeof SelectSeparator;
};

export const Select: SelectComponent = {
  Root: SelectRoot,
  Trigger: SelectTrigger,
  Value: SelectValue,
  Icon: SelectIcon,
  Content: SelectContent,
  Viewport: SelectViewport,
  Item: SelectItem,
  ItemText: SelectItemText,
  Group: SelectGroup,
  Label: SelectLabel,
  Separator: SelectSeparator,
};
