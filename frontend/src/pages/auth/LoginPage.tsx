import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert, Box, Button, IconButton, InputAdornment, Link, Stack, TextField, Typography,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../services/api';
import { homeFor } from '../../routes/guards';
import { MONO } from '../../theme/theme';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

/** Field labels use the mono uppercase idiom from technical documentation. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component="label"
      sx={{
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: 'text.secondary',
        display: 'block',
        mb: 0.75,
      }}
    >
      {children}
    </Typography>
  );
}

const DEMO_ACCOUNTS = [
  { email: 'admin@gmail.com', role: 'admin' },
  { email: 'manager@gmail.com', role: 'manager' },
  { email: 'savindu@gmail.com', role: 'member' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register, handleSubmit, setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      const user = await login(values.email, values.password);
      const from = (location.state as { from?: Location })?.from?.pathname;
      navigate(from ?? homeFor(user.permissions), { replace: true });
    } catch (error) {
      // Form-level, never field-level: saying *which* half was wrong would
      // turn this into a user-enumeration oracle.
      setFormError(
        error instanceof ApiError && error.status === 401
          ? 'Invalid email or password'
          : ((error as ApiError).detail ?? 'Could not sign in. Please try again.'),
      );
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Typography variant="h5" sx={{ mb: 0.75 }}>
        Sign in
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Use your work account.
      </Typography>

      <Stack spacing={2.5}>
        {formError && (
          <Alert severity="error" sx={{ py: 0.5 }}>
            {formError}
          </Alert>
        )}

        <Box>
          <FieldLabel>Email</FieldLabel>
          <TextField
            {...register('email')}
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
          />
        </Box>

        <Box>
          <FieldLabel>Password</FieldLabel>
          <TextField
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                      size="small"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        <Button type="submit" variant="contained" size="large" disabled={isSubmitting} fullWidth>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <Typography variant="body2" color="text.secondary">
          No account?{' '}
          <Link component={RouterLink} to="/register">
            Create one
          </Link>
        </Typography>
      </Stack>

      {/* Demo accounts: clickable rather than copy-by-hand, and dev-only. */}
      {import.meta.env.DEV && (
        <Box sx={{ mt: 5, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography
            sx={{
              fontFamily: MONO, fontSize: 11, letterSpacing: '0.09em',
              textTransform: 'uppercase', color: 'text.secondary', mb: 1.5,
            }}
          >
            Demo accounts
          </Typography>
          <Stack spacing={0.25}>
            {DEMO_ACCOUNTS.map((account) => (
              <Box
                key={account.email}
                component="button"
                type="button"
                onClick={() => {
                  setValue('email', account.email);
                  setValue('password', 'Password123');
                }}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  px: 1,
                  mx: -1,
                  py: 0.75,
                  borderRadius: 1,
                  textAlign: 'left',
                  '&:hover': { background: 'action.hover' },
                }}
              >
                <Typography sx={{ fontFamily: MONO, fontSize: 12.5, color: 'text.primary' }}>
                  {account.email}
                </Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.secondary' }}>
                  {account.role}
                </Typography>
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Click to fill · password{' '}
            <Box component="code" sx={{ fontFamily: MONO }}>
              Password123
            </Box>
          </Typography>
        </Box>
      )}
    </Box>
  );
}
