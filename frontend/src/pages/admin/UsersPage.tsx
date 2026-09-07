import {
  Box, Chip, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import PersonOffIcon from '@mui/icons-material/PersonOffOutlined';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ConfirmDialog, type Column, DataTable, PageHeader, UserAvatar,
} from '../../components/common';
import { useAssignRole, useDeactivateUser, useUsers } from '../../hooks/useAdmin';
import { useAuth } from '../../contexts/AuthContext';
import { MONO } from '../../theme/theme';
import type { RoleCode, User } from '../../types';
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
      <PageHeader title="Users" subtitle="Team members, roles and access" />

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
