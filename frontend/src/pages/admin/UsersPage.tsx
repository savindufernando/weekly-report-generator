import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopyOutlined';
import PersonOffIcon from '@mui/icons-material/PersonOffOutlined';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ConfirmDialog, type Column, DataTable, PageHeader, UserAvatar,
} from '../../components/common';
import { useSnackbar } from '../../contexts/SnackbarContext';
import {
  useAssignRole, useCreateUser, useDeactivateUser, useUsers,
} from '../../hooks/useAdmin';
import { useAuth } from '../../contexts/AuthContext';
import { MONO } from '../../theme/theme';
import type { CreatedUser, RoleCode, User } from '../../types';
import { formatDate } from '../../utils/week';

const ROLES: { value: RoleCode; label: string }[] = [
  { value: 'MEMBER', label: 'Team Member' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ADMIN', label: 'Admin' },
];

export default function UsersPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [adding, setAdding] = useState(false);

  const params = useMemo(
    () => ({ q: search || undefined, role: roleFilter || undefined, limit, offset }),
    [search, roleFilter, limit, offset],
  );

  const { data, isPending, error, refetch } = useUsers(params);
  const assignRole = useAssignRole();
  const deactivateUser = useDeactivateUser();

  const columns: Column<User>[] = [
    {
      key: 'name',
      label: 'User',
      primary: true,
      render: (row) => (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
          <UserAvatar user={{ id: row.id, full_name: row.full_name, avatar_url: row.avatar_url }} size={28} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {row.full_name}
              {row.id === currentUser?.id && (
                <Typography component="span" variant="caption" color="text.secondary">
                  {' '}
                  (you)
                </Typography>
              )}
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: 11.5, color: 'text.secondary' }}>
              {row.email}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      key: 'job_title',
      label: 'Title',
      hideOnMobile: true,
      render: (row) => row.job_title ?? '—',
    },
    {
      key: 'role',
      label: 'Role',
      render: (row) => {
        // An admin changing their own role could lock everyone out of user
        // management, so the control is disabled for yourself. The API
        // refuses it independently.
        const isSelf = row.id === currentUser?.id;
        return (
          <Tooltip title={isSelf ? 'You cannot change your own role' : ''}>
            <span>
              <TextField
                select
                size="small"
                value={row.role.code}
                disabled={isSelf || !row.is_active || assignRole.isPending}
                onChange={(event) =>
                  assignRole.mutate({ id: row.id, role: event.target.value })
                }
                onClick={(event) => event.stopPropagation()}
                sx={{ width: 148 }}
              >
                {ROLES.map((role) => (
                  <MenuItem key={role.value} value={role.value}>
                    {role.label}
                  </MenuItem>
                ))}
              </TextField>
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) =>
        row.is_active ? (
          <Chip size="small" variant="outlined" color="success" label="Active" />
        ) : (
          <Chip size="small" variant="outlined" label="Deactivated" />
        ),
    },
    {
      key: 'joined',
      label: 'Joined',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary' }}>
          {formatDate(row.created_at)}
        </Typography>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      hideOnMobile: true,
      render: (row) =>
        row.is_active && row.id !== currentUser?.id ? (
          <Tooltip title="Deactivate">
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                setDeactivating(row);
              }}
            >
              <PersonOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Team members, roles and access"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            Add user
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search name or email"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          sx={{ maxWidth: 280 }}
        />
        <TextField
          select
          size="small"
          label="Role"
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value);
            setOffset(0);
          }}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="">All roles</MenuItem>
          {ROLES.map((role) => (
            <MenuItem key={role.value} value={role.value}>
              {role.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        getRowKey={(row) => row.id}
        isLoading={isPending}
        error={error}
        onRetry={refetch}
        onRowClick={(row) => navigate(`/team/${row.id}`)}
        emptyTitle="No users match"
        total={data?.total}
        limit={limit}
        offset={offset}
        onPageChange={setOffset}
        onLimitChange={(next) => {
          setLimit(next);
          setOffset(0);
        }}
      />

      <AddUserDialog open={adding} onClose={() => setAdding(false)} />

      <ConfirmDialog
        open={deactivating !== null}
        danger
        title="Deactivate this user?"
        description={
          <>
            <strong>{deactivating?.full_name}</strong> will lose access immediately. Their
            reports and review history are kept — accounts are deactivated rather than deleted
            so the record stays intact.
          </>
        }
        confirmLabel="Deactivate"
        isPending={deactivateUser.isPending}
        onConfirm={() => {
          if (deactivating) deactivateUser.mutate(deactivating.id);
          setDeactivating(null);
        }}
        onCancel={() => setDeactivating(null)}
      />
    </>
  );
}

/**
 * Two-phase dialog: the form, then the generated credential.
 *
 * The second phase exists because a generated password is returned exactly once
 * and is never recoverable — only the hash is stored. Closing straight back to
 * the table after creating would strand the admin with an account nobody can
 * sign in to.
 */
function AddUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createUser = useCreateUser();
  const { notify } = useSnackbar();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState<RoleCode>('MEMBER');
  const [created, setCreated] = useState<CreatedUser | null>(null);

  const reset = () => {
    setEmail('');
    setFullName('');
    setJobTitle('');
    setRole('MEMBER');
    setCreated(null);
    onClose();
  };

  const submit = async () => {
    // No password field: the server generates one, which keeps admins from
    // inventing a weak shared password and reusing it across the team.
    const user = await createUser.mutateAsync({
      email: email.trim(),
      full_name: fullName.trim(),
      role_code: role,
      job_title: jobTitle.trim() || null,
    });
    setCreated(user);
  };

  const copy = async () => {
    if (!created?.temporary_password) return;
    try {
      await navigator.clipboard.writeText(created.temporary_password);
      notify('Password copied', 'success');
    } catch {
      // Clipboard access is denied over plain HTTP on some browsers; the
      // password is on screen either way, so this is not a failure worth a
      // scary message.
      notify('Copy failed — select the password and copy it manually', 'info');
    }
  };

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailLooksValid && fullName.trim().length >= 2;

  return (
    <Dialog open={open} onClose={createUser.isPending ? undefined : reset} maxWidth="xs" fullWidth>
      <DialogTitle>{created ? 'Account created' : 'Add user'}</DialogTitle>

      {created ? (
        <>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2">
                <strong>{created.full_name}</strong> can now sign in as{' '}
                {created.role.name.toLowerCase()}.
              </Typography>

              {created.temporary_password && (
                <>
                  <Alert severity="warning" sx={{ fontSize: 13 }}>
                    This password is shown once and cannot be retrieved later. Send it to
                    them now — they should change it after signing in.
                  </Alert>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <TextField
                      label="Temporary password"
                      value={created.temporary_password}
                      slotProps={{
                        htmlInput: { readOnly: true, style: { fontFamily: MONO } },
                      }}
                      fullWidth
                    />
                    <Tooltip title="Copy">
                      <IconButton onClick={copy}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </>
              )}

              <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary' }}>
                {created.email}
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="contained" onClick={reset}>
              Done
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <TextField
                label="Full name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoFocus
              />
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={email.length > 0 && !emailLooksValid}
                helperText={
                  email.length > 0 && !emailLooksValid ? 'Enter a valid email address' : ' '
                }
              />
              <TextField
                label="Job title"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                helperText="Optional"
              />
              <TextField
                select
                label="Role"
                value={role}
                onChange={(event) => setRole(event.target.value as RoleCode)}
                helperText="Can be changed later from the table"
              >
                {ROLES.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={reset} disabled={createUser.isPending}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={submit}
              disabled={!canSubmit || createUser.isPending}
            >
              Create
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
