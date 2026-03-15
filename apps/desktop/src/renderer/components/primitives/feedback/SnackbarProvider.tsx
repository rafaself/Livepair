import { createContext, useCallback, useRef, useState, type ReactNode } from 'react';
import { Snackbar, type SnackbarVariant } from './Snackbar';

type SnackbarItem = {
  id: string;
  message: string;
  variant: SnackbarVariant;
  duration?: number;
};

export type SnackbarContextValue = {
  showSnackbar: (message: string, variant?: SnackbarVariant, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
};

export const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export type SnackbarProviderProps = {
  children: ReactNode;
};

export function SnackbarProvider({ children }: SnackbarProviderProps): JSX.Element {
  const [snackbars, setSnackbars] = useState<SnackbarItem[]>([]);
  const counterRef = useRef(0);

  const showSnackbar = useCallback(
    (message: string, variant: SnackbarVariant = 'error', duration?: number) => {
      const id = `snackbar-${(counterRef.current += 1)}`;
      const item = { id, message, variant, ...(duration !== undefined ? { duration } : {}) };
      setSnackbars(prev => [...prev, item]);
    },
    [],
  );

  const showError = useCallback(
    (message: string, duration?: number) => {
      showSnackbar(message, 'error', duration);
    },
    [showSnackbar],
  );

  const dismiss = useCallback((id: string) => {
    setSnackbars(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar, showError }}>
      {children}
      <div className="snackbar-container" aria-label="Notifications">
        {snackbars.map(snackbar => (
          <Snackbar key={snackbar.id} {...snackbar} onDismiss={dismiss} />
        ))}
      </div>
    </SnackbarContext.Provider>
  );
}
