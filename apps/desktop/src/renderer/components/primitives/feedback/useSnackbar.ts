import { useContext } from 'react';
import { SnackbarContext, type SnackbarContextValue } from './SnackbarProvider';

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error('useSnackbar must be used within a <SnackbarProvider>.');
  }
  return ctx;
}
