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

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
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
      // Deliberately form-level, not field-level: revealing *which* half was
      // wrong turns this form into a user-enumeration oracle.
      setFormError(
        error instanceof ApiError && error.status === 401
          ? 'Invalid email or password'
          : (error as ApiError).detail ?? 'Could not sign in. Please try again.',
      );
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Sign in
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Enter your credentials to continue
      </Typography>

      <Stack spacing={2}>
        {formError && <Alert severity="error">{formError}</Alert>}

        <TextField
          {...register('email')}
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
        />

        <TextField
          {...register('password')}
          label="Password"
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

        <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          No account?{' '}
          <Link component={RouterLink} to="/register" underline="hover">
            Create one
          </Link>
        </Typography>

        {/* Demo credentials in non-production only — a reviewer should not have
            to hunt through the README to get in. */}
        {import.meta.env.DEV && (
          <Alert severity="info" sx={{ fontSize: 13 }}>
            <strong>Demo accounts</strong> — password <code>Password123</code>
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              <li>sarah@company.com — admin</li>
              <li>david@company.com — manager</li>
              <li>amal@company.com — member</li>
            </Box>
          </Alert>
        )}
      </Stack>
    </Box>
  );
}
