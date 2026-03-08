import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type FocusEvent,
  type InputHTMLAttributes,
} from 'react';
import './TextInput.css';

export type TextInputRule = (value: string) => true | string | boolean;
export type TextInputHideDetails = boolean | 'auto';
export type TextInputValidateOn = 'input' | 'blur';

export type TextInputProps = {
  size?: 'sm' | 'md';
  label?: string;
  invalid?: boolean;
  error?: string;
  hint?: string;
  persistentHint?: boolean;
  hideDetails?: TextInputHideDetails;
  rules?: TextInputRule[];
  validateOn?: TextInputValidateOn;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>;

type ValidationResult = {
  invalid: boolean;
  message: string | null;
};

const DEFAULT_VALIDATION_RESULT: ValidationResult = {
  invalid: false,
  message: null,
};

const hasInputValue = (
  value: InputHTMLAttributes<HTMLInputElement>['value'] | InputHTMLAttributes<HTMLInputElement>['defaultValue'],
): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return String(value).length > 0;
};

const evaluateRules = (
  rules: readonly TextInputRule[] | undefined,
  value: string,
): ValidationResult => {
  if (!rules || rules.length === 0) {
    return DEFAULT_VALIDATION_RESULT;
  }

  for (const rule of rules) {
    const result = rule(value);

    if (result === true) {
      continue;
    }

    if (typeof result === 'string') {
      return { invalid: true, message: result };
    }

    return { invalid: true, message: null };
  }

  return DEFAULT_VALIDATION_RESULT;
};

const toAriaInvalid = (
  value: InputHTMLAttributes<HTMLInputElement>['aria-invalid'],
): boolean => {
  return value !== undefined && value !== false && value !== 'false';
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    size = 'md',
    label,
    invalid = false,
    error,
    hint,
    persistentHint = false,
    hideDetails = 'auto',
    rules,
    validateOn = 'blur',
    className,
    type = 'text',
    id,
    value,
    defaultValue,
    disabled = false,
    placeholder,
    onChange,
    onFocus,
    onBlur,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...rest
  },
  ref,
): JSX.Element {
  const generatedId = useId();
  const inputId = id ?? `text-input-${generatedId}`;
  const detailsId = `${inputId}-details`;
  const [isFocused, setIsFocused] = useState(false);
  const [isFilled, setIsFilled] = useState(hasInputValue(value ?? defaultValue));
  const [validationResult, setValidationResult] = useState<ValidationResult>(
    DEFAULT_VALIDATION_RESULT,
  );
  const hasExternalError = typeof error === 'string' && error.length > 0;
  const isInvalid =
    invalid || hasExternalError || validationResult.invalid || toAriaInvalid(ariaInvalid);
  const shouldShowHint =
    Boolean(hint) && (persistentHint || isFocused || hideDetails === false) && !hasExternalError;
  const detailsVisible =
    hideDetails === false ||
    (hideDetails !== true && (hasExternalError || validationResult.invalid || shouldShowHint));
  const detailsMessage = hasExternalError
    ? error
    : validationResult.invalid
      ? validationResult.message ?? ''
      : shouldShowHint
        ? hint ?? ''
        : '';
  const describedBy = [ariaDescribedBy, detailsVisible ? detailsId : undefined]
    .filter(Boolean)
    .join(' ') || undefined;
  const classes = [
    'text-input',
    `text-input--${size}`,
    label ? 'text-input--labeled' : '',
    isInvalid ? 'text-input--invalid' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const isFloating = Boolean(label) && (isFocused || isFilled);
  const resolvedPlaceholder = label && !isFloating ? '' : placeholder;

  useEffect(() => {
    if (value === undefined) {
      return;
    }

    setIsFilled(hasInputValue(value));
  }, [value]);

  const runValidation = (nextValue: string): void => {
    if (hasExternalError) {
      return;
    }

    setValidationResult(evaluateRules(rules, nextValue));
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>): void => {
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    setIsFocused(false);

    if (validateOn === 'blur') {
      runValidation(event.currentTarget.value);
    }

    onBlur?.(event);
  };

  const handleChange: NonNullable<TextInputProps['onChange']> = (event) => {
    setIsFilled(hasInputValue(event.currentTarget.value));

    if (validateOn === 'input') {
      runValidation(event.currentTarget.value);
    }

    onChange?.(event);
  };

  return (
    <div className="text-input__root">
      <div
        className={`text-input__control text-input__control--${size}`}
        data-disabled={disabled ? 'true' : 'false'}
        data-filled={isFilled ? 'true' : 'false'}
        data-focused={isFocused ? 'true' : 'false'}
        data-floating={isFloating ? 'true' : 'false'}
        data-invalid={isInvalid ? 'true' : 'false'}
      >
        {label ? (
          <label className="text-input__label" htmlFor={inputId}>
            {label}
          </label>
        ) : null}
        <input
          {...rest}
          ref={ref}
          id={inputId}
          type={type}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          placeholder={resolvedPlaceholder}
          className={classes}
          aria-invalid={isInvalid ? 'true' : ariaInvalid}
          aria-describedby={describedBy}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>
      {detailsVisible ? (
        <div
          id={detailsId}
          className={`text-input__details${isInvalid ? ' text-input__details--invalid' : ''}`}
          aria-live={isInvalid ? 'assertive' : 'polite'}
        >
          {detailsMessage || '\u00A0'}
        </div>
      ) : null}
    </div>
  );
});
