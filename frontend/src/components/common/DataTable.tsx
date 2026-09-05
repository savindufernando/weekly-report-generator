import {
  Box, Card, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TableSortLabel, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import type { ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingState } from './states';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  sortable?: boolean;
  /** Hidden in the mobile card layout — for low-value columns. */
  hideOnMobile?: boolean;
  /** Used as the card title on mobile. */
  primary?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Row-level accent, e.g. highlighting reports that need correction. */
  rowAccent?: (row: T) => string | undefined;
  total?: number;
  limit?: number;
  offset?: number;
  onPageChange?: (offset: number) => void;
  onLimitChange?: (limit: number) => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
}

/**
 * One table for every list in the app.
 *
 * Below the `sm` breakpoint it switches to stacked cards: a seven-column task
 * or report table is genuinely unusable at 375px, and horizontal scrolling is
 * a worse answer than reflowing.
 */
export function DataTable<T>({
  columns, rows, getRowKey, isLoading, error, onRetry,
  emptyTitle = 'Nothing here yet', emptyDescription, emptyAction,
  onRowClick, rowAccent,
  total, limit = 20, offset = 0, onPageChange, onLimitChange,
  sort, onSortChange,
}: Props<T>) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isLoading) return <LoadingState variant={isMobile ? 'card' : 'table'} />;
  if (rows.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    onSortChange(sort === `-${key}` ? key : `-${key}`);
  };

  const pagination = onPageChange && total !== undefined && total > 0 && (
    <TablePagination
      component="div"
      count={total}
      page={Math.floor(offset / limit)}
      rowsPerPage={limit}
      onPageChange={(_, page) => onPageChange(page * limit)}
      onRowsPerPageChange={(e) => onLimitChange?.(parseInt(e.target.value, 10))}
      rowsPerPageOptions={[10, 20, 50, 100]}
    />
  );

  if (isMobile) {
    const primary = columns.find((c) => c.primary) ?? columns[0];
    const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);

    return (
      <>
        <Stack spacing={1.25}>
          {rows.map((row) => (
            <Card
              key={getRowKey(row)}
              onClick={() => onRowClick?.(row)}
              sx={{
                p: 1.75,
                cursor: onRowClick ? 'pointer' : 'default',
                borderLeft: rowAccent?.(row) ? `3px solid ${rowAccent(row)}` : undefined,
              }}
            >
              <Box sx={{ fontWeight: 600, mb: 1 }}>{primary.render(row)}</Box>
              <Stack spacing={0.75}>
                {rest.map((column) => (
                  <Stack
                    key={column.key}
                    direction="row"
                    sx={{ justifyContent: 'space-between', gap: 2 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {column.label}
                    </Typography>
                    <Box sx={{ fontSize: 14, textAlign: 'right' }}>{column.render(row)}</Box>
                  </Stack>
                ))}
              </Stack>
            </Card>
          ))}
        </Stack>
        {pagination}
      </>
    );
  }

  return (
    <Card>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.align}
                  sx={{ width: column.width, fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  {column.sortable && onSortChange ? (
                    <TableSortLabel
                      active={sort === column.key || sort === `-${column.key}`}
                      direction={sort === column.key ? 'asc' : 'desc'}
                      onClick={() => handleSort(column.key)}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : (
                    column.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const accent = rowAccent?.(row);
              return (
                <TableRow
                  key={getRowKey(row)}
                  hover={Boolean(onRowClick)}
                  onClick={() => onRowClick?.(row)}
                  sx={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    ...(accent && {
                      borderLeft: `3px solid ${accent}`,
                      '& td:first-of-type': { pl: 1.5 },
                    }),
                  }}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key} align={column.align}>
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {pagination}
    </Card>
  );
}
