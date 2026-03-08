import {
  forwardRef,
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
    isInvalid ? 'text-input--invalid' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

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
    if (validateOn === 'input') {
      runValidation(event.currentTarget.value);
    }

    onChange?.(event);
  };

  return (
    <div className="text-input__root">
      <input
        {...rest}
        ref={ref}
        id={inputId}
        type={type}
        className={classes}
        aria-invalid={isInvalid ? 'true' : ariaInvalid}
        aria-describedby={describedBy}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
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
