import { Box, Card, CardContent, Skeleton, Stack, Typography, useTheme } from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import type { ReactElement, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

import { EmptyState, ErrorState } from '../common';

/**
 * One shell for every chart: title, loading skeleton, empty state, error state
 * and the responsive container. Four charts are then four small components
 * rather than four copies of the same scaffolding.
 */
export function ChartCard({
  title,
  subtitle,
  action,
  height = 300,
  isLoading,
  isEmpty,
  emptyText = 'No data for this period',
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  height?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  error?: unknown;
  children: ReactElement;
}) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ pb: '16px !important' }}>
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

        <Box sx={{ height }}>
          {error ? (
            <ErrorState error={error} compact />
          ) : isLoading ? (
            <Skeleton variant="rounded" height={height - 8} />
          ) : isEmpty ? (
            // An axis with no marks reads as a bug; say so explicitly instead.
            <EmptyState compact icon={<BarChartIcon fontSize="inherit" />} title={emptyText} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

/** Chart chrome that follows the theme rather than being hardcoded per chart. */
export function useChartColors() {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  return {
    grid: dark ? '#2c2c2a' : '#e1e0d9',
    axis: dark ? '#383835' : '#c3c2b7',
    muted: '#898781',
    surface: theme.palette.background.paper,
    text: theme.palette.text.primary,
  };
}

/** Shared tooltip styling, so all four charts read as one system. */
export function tooltipStyle(colors: ReturnType<typeof useChartColors>) {
  return {
    contentStyle: {
      background: colors.surface,
      border: `1px solid ${colors.grid}`,
      borderRadius: 8,
      fontSize: 13,
      boxShadow: '0 4px 16px -8px rgba(0,0,0,.35)',
    },
    labelStyle: { color: colors.text, fontWeight: 600, marginBottom: 4 },
  };
}
