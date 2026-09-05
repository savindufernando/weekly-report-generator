import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, LinearProgress, Link, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useAuth } from '../../contexts/AuthContext';
import { useSnackbar } from '../../contexts/SnackbarContext';
import { authService } from '../../services';
import { ApiError } from '../../services/api';
import { homeFor } from '../../routes/guards';

// Mirrors the backend rules exactly. Client validation is for fast feedback;
// the server enforces the same constraints independently.
const schema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter your full name').max(150),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .max(128)
      .regex(/[A-Za-z]/, 'Must contain a letter')
      .regex(/\d/, 'Must contain a number'),
    confirm: z.string().min(1, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

type FormValues = z.infer<typeof schema>;

function strengthOf(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (password.length >= 12) score += 25;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 25;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 25;
  const label = score <= 25 ? 'Weak' : score <= 50 ? 'Fair' : score <= 75 ? 'Good' : 'Strong';
  return { score, label };
}

export default function RegisterPage() {
  const { login } = useAuth();
  const { notify } = useSnackbar();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', password: '', confirm: '' },
  });

  const password = watch('password');
  const strength = strengthOf(password ?? '');

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await authService.register(values.email, values.password, values.full_name);
      // Sign straight in — asking someone to retype credentials they just
      // chose is friction with no security benefit.
      const user = await login(values.email, values.password);
      notify('Welcome aboard', 'success');
      navigate(homeFor(user.permissions), { replace: true });
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 409) {
        setError('email', { message: 'An account with this email already exists' });
        return;
      }
      // Map server field errors onto the right inputs where we can.
      const fieldErrors = apiError.fieldErrors ?? [];
      if (fieldErrors.length) {
        fieldErrors.forEach((fieldError) => {
          setError(fieldError.field as keyof FormValues, { message: fieldError.message });
        });
        return;
      }
      setFormError(apiError.detail ?? 'Could not create your account.');
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Create an account
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        New accounts join as a team member
      </Typography>

      <Stack spacing={2}>
        {formError && <Alert severity="error">{formError}</Alert>}

        <TextField
          {...register('full_name')}
          label="Full name"
          autoComplete="name"
          autoFocus
          error={Boolean(errors.full_name)}
          helperText={errors.full_name?.message}
        />

        <TextField
          {...register('email')}
          label="Email"
          type="email"
          autoComplete="email"
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
        />

        <Box>
          <TextField
            {...register('password')}
            label="Password"
            type="password"
            autoComplete="new-password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message ?? 'At least 8 characters, with a letter and a number'}
          />
          {password && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
              <LinearProgress
                variant="determinate"
                value={strength.score}
                sx={{ flex: 1, height: 4, borderRadius: 2 }}
                color={strength.score <= 25 ? 'error' : strength.score <= 50 ? 'warning' : 'success'}
              />
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 44 }}>
                {strength.label}
              </Typography>
            </Stack>
          )}
        </Box>

        <TextField
          {...register('confirm')}
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={Boolean(errors.confirm)}
          helperText={errors.confirm?.message}
        />

        <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>

        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          Already have an account?{' '}
          <Link component={RouterLink} to="/login" underline="hover">
            Sign in
          </Link>
        </Typography>
      </Stack>
    </Box>
  );
}
