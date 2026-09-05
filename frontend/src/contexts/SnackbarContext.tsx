import { Alert, Snackbar } from '@mui/material';
import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react';

type Severity = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  message: string;
  severity: Severity;
  key: number;
}

interface SnackbarValue {
  notify: (message: string, severity?: Severity) => void;
}

const SnackbarContext = createContext<SnackbarValue | undefined>(undefined);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((message: string, severity: Severity = 'info') => {
    // A changing key restarts the auto-hide timer, so a second toast is not
    // dismissed early by the first one's countdown.
    setToast({ message, severity, key: Date.now() });
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        key={toast?.key}
        open={Boolean(toast)}
        autoHideDuration={toast?.severity === 'error' ? 8000 : 4000}
        onClose={(_, reason) => {
          // Errors stay put on an accidental click-away — they usually carry
          // something the user needs to read.
          if (reason === 'clickaway' && toast?.severity === 'error') return;
          setToast(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast?.severity ?? 'info'}
          variant="filled"
          onClose={() => setToast(null)}
          sx={{ width: '100%' }}
        >
          {toast?.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used inside SnackbarProvider');
  return ctx;
}
