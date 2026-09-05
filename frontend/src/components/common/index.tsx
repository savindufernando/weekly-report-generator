import {
  Avatar, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, Stack, Tooltip, Typography,
} from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import type { ReactNode } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { SERIES_COLORS } from '../../theme/theme';
import type { PermissionCode, TaskPriority, UserBrief } from '../../types';

export { DataTable, type Column } from './DataTable';
export { PageHeader, type Crumb } from './PageHeader';
export { StatusChip } from './StatusChip';
export { EmptyState, ErrorState, LoadingState } from './states';

/**
 * Conditional rendering by capability — a UX affordance, never security.
 * Every action it hides is also refused by the server.
 */
export function Can({ do: permission, children }: { do: PermissionCode; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : null;
}

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  const tone: Record<TaskPriority, 'default' | 'info' | 'warning' | 'error'> = {
    LOW: 'default',
    MEDIUM: 'info',
    HIGH: 'warning',
    CRITICAL: 'error',
  };
  return (
    <Chip
      size="small"
      variant="outlined"
      color={tone[priority]}
      label={priority.charAt(0) + priority.slice(1).toLowerCase()}
    />
  );
}

export function UserAvatar({
  user,
  size = 32,
  showName = false,
}: {
  user: UserBrief;
  size?: number;
  showName?: boolean;
}) {
  const initials = user.full_name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  // Colour derived from the id so a person keeps the same avatar colour
  // everywhere, rather than shifting with list position.
  const color = SERIES_COLORS[user.id % SERIES_COLORS.length];

  const avatar = (
    <Avatar
      src={user.avatar_url ?? undefined}
      sx={{ width: size, height: size, bgcolor: color, fontSize: size * 0.4 }}
    >
      {initials}
    </Avatar>
  );

  if (!showName) return <Tooltip title={user.full_name}>{avatar}</Tooltip>;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
      {avatar}
      <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
        {user.full_name}
      </Typography>
    </Stack>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  dense = false,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  dense?: boolean;
}) {
  return (
    <Card>
      <CardContent sx={{ p: dense ? 2 : 2.5, '&:last-child': { pb: dense ? 2 : 2.5 } }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}
        >
          <Box>
            <Typography variant="subtitle1">{title}</Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

export function MetricTile({
  label,
  value,
  secondary,
  delta,
  goodDirection = 'up',
  icon,
  isLoading = false,
}: {
  label: string;
  value: ReactNode;
  secondary?: string;
  delta?: number;
  /** Which way is good for THIS metric — blockers falling is good. */
  goodDirection?: 'up' | 'down';
  icon?: ReactNode;
  isLoading?: boolean;
}) {
  const showDelta = delta !== undefined && delta !== 0;
  const rising = (delta ?? 0) > 0;
  const isGood = goodDirection === 'up' ? rising : !rising;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          {icon && <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>}
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
            }}
          >
            {label}
          </Typography>
        </Stack>

        <Typography variant="h4" sx={{ lineHeight: 1.1 }}>
          {isLoading ? '—' : value}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75, minHeight: 20 }}>
          {showDelta && !isLoading && (
            <Stack
              direction="row"
              spacing={0.25}
              sx={{
                alignItems: 'center',
                color: isGood ? 'success.main' : 'error.main',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {/* An arrow AND a sign — the direction is never colour-only. */}
              {rising ? (
                <ArrowUpwardIcon sx={{ fontSize: 14 }} />
              ) : (
                <ArrowDownwardIcon sx={{ fontSize: 14 }} />
              )}
              <span>
                {rising ? '+' : ''}
                {delta}
              </span>
            </Stack>
          )}
          {secondary && (
            <Typography variant="caption" color="text.secondary">
              {secondary}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  isPending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{description}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={isPending}>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={danger ? 'error' : 'primary'}
          onClick={onConfirm}
          disabled={isPending}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
