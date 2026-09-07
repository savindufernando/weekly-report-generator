import {
  Alert, Box, Button, Chip, FormControlLabel, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';

import { PageHeader, SectionCard } from '../../components/common';
import { useAuth } from '../../contexts/AuthContext';
import { useSnackbar } from '../../contexts/SnackbarContext';
import { useThemeMode } from '../../contexts/ThemeModeContext';
import { useUpdateProfile } from '../../hooks/useAdmin';
import { authService } from '../../services';
import { ApiError } from '../../services/api';
import { MONO } from '../../theme/theme';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const { mode, toggle } = useThemeMode();
  const { notify } = useSnackbar();
  const updateProfile = useUpdateProfile();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [jobTitle, setJobTitle] = useState(user?.job_title ?? '');

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  if (!user) return null;

  const saveProfile = async () => {
    await updateProfile.mutateAsync({
      id: user.id,
      payload: { full_name: fullName.trim(), job_title: jobTitle.trim() || null },
    });
    await refresh();
  };

  const changePassword = async () => {
    setPasswordError(null);
    if (next !== confirm) {
      setPasswordError('The new passwords do not match');
      return;
    }
    setChanging(true);
    try {
      await authService.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      // The server revokes every other refresh token on a password change, so
      // say so — the user may be signed in elsewhere and should know.
      notify('Password changed. Other sessions have been signed out.', 'success');
    } catch (error) {
      setPasswordError((error as ApiError).detail ?? 'Could not change the password');
    } finally {
      setChanging(false);
    }
  };

  const profileDirty =
    fullName.trim() !== user.full_name || (jobTitle.trim() || null) !== (user.job_title ?? null);

  return (
    <Box sx={{ maxWidth: 640 }}>
      <PageHeader title="Settings" subtitle="Your account" />

      <Stack spacing={2.5}>
        <SectionCard title="Profile">
          <Stack spacing={2}>
            <Box>
              <Typography
                sx={{
                  fontFamily: MONO, fontSize: 11, letterSpacing: '0.09em',
                  textTransform: 'uppercase', color: 'text.secondary', mb: 0.75,
                }}
              >
                Email
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontFamily: MONO, fontSize: 13.5 }}>{user.email}</Typography>
                <Chip size="small" variant="outlined" label={user.role.name} />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Your email and role are managed by an admin.
              </Typography>
            </Box>

            <TextField
              label="Full name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
            <TextField
              label="Job title"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              placeholder="e.g. Backend Engineer"
            />

            <Box>
              <Button
                variant="contained"
                onClick={saveProfile}
                disabled={!profileDirty || updateProfile.isPending}
              >
                Save profile
              </Button>
            </Box>
          </Stack>
        </SectionCard>

        <SectionCard title="Password" subtitle="Changing it signs out your other sessions">
          <Stack spacing={2}>
            {passwordError && <Alert severity="error">{passwordError}</Alert>}
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              helperText="At least 8 characters, with a letter and a number"
            />
            <TextField
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            <Box>
              <Button
                variant="contained"
                onClick={changePassword}
                disabled={!current || next.length < 8 || !confirm || changing}
              >
                {changing ? 'Changing…' : 'Change password'}
              </Button>
            </Box>
          </Stack>
        </SectionCard>

        <SectionCard title="Appearance">
          <FormControlLabel
            control={<Switch checked={mode === 'dark'} onChange={toggle} />}
            label={<Typography variant="body2">Dark mode</Typography>}
          />
        </SectionCard>
      </Stack>
    </Box>
  );
}
