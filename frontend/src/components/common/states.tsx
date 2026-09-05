import {
  Alert, AlertTitle, Box, Button, CircularProgress, Skeleton, Stack, Typography,
} from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { ReactNode } from 'react';

import { ApiError } from '../../services/api';

/**
 * Loading, empty and error states.
 *
 * Every async view uses all three. A blank white screen while data loads is the
 * single most common way a demo looks broken.
 */

export function LoadingState({
  variant = 'table',
  rows = 5,
}: {
  variant?: 'table' | 'card' | 'chart' | 'page';
  rows?: number;
}) {
  if (variant === 'page') {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (variant === 'chart') {
    return <Skeleton variant="rounded" height={260} />;
  }
  if (variant === 'card') {
    return (
      <Stack spacing={1.5}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={88} />
        ))}
      </Stack>
    );
  }
  // Skeletons shaped like the final table, so nothing shifts when data lands.
  return (
    <Stack spacing={0.75}>
      <Skeleton variant="rounded" height={40} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={52} />
      ))}
    </Stack>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        py: compact ? 4 : 8,
        px: 2,
        color: 'text.secondary',
      }}
    >
      <Box sx={{ fontSize: compact ? 32 : 44, lineHeight: 1, mb: 1.5, opacity: 0.5 }}>
        {icon ?? <InboxIcon fontSize="inherit" />}
      </Box>
      <Typography variant={compact ? 'body2' : 'subtitle1'} sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 380 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2.5 }}>{action}</Box>}
    </Box>
  );
}

export function ErrorState({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const detail = apiError?.detail ?? 'Something went wrong. Please try again.';

  return (
    <Alert
      severity="error"
      sx={{ my: compact ? 1 : 2 }}
      action={
        onRetry && (
          <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={onRetry}>
            Retry
          </Button>
        )
      }
    >
      {!compact && <AlertTitle>Could not load this</AlertTitle>}
      {detail}
      {/* The request id makes a support conversation about one specific
          failure possible, instead of "it broke sometime this morning". */}
      {apiError?.requestId && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
          Reference: {apiError.requestId}
        </Typography>
      )}
    </Alert>
  );
}
