import { Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';

import { type Column, DataTable, StatusChip, UserAvatar } from '../common';
import type { Page, ReportListItem, ReportStatus, User } from '../../types';
import { formatWeek, relativeTime } from '../../utils/week';

/**
 * Browse every team member's reports across a date range.
 *
 * The dashboard above it answers "how is this week going"; this answers "show
 * me a particular person, project or period". The brief asks for filtering by
 * team member, project, date range and status, and the week-scoped roster view
 * cannot express the last three — a member's whole history is not a week.
 *
 * Presentational by design: it receives rows and reports changes upward, so
 * the page owns the queries and the URL state. That keeps it renderable in
 * isolation and keeps fetching in one layer.
 */

export interface TeamReportFilters {
  userId?: number;
  projectId?: number;
  status: string;
  from: string;
  to: string;
  limit: number;
  offset: number;
}

const STATUSES: { value: ReportStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'NEEDS_CORRECTION', label: 'Needs correction' },
  { value: 'APPROVED', label: 'Approved' },
];

export function TeamReportsPanel({
  data,
  isLoading,
  error,
  onRetry,
  members,
  filters,
  onChange,
  onOpen,
}: {
  data?: Page<ReportListItem>;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  members: User[];
  filters: TeamReportFilters;
  onChange: (patch: Partial<TeamReportFilters>) => void;
  onOpen: (report: ReportListItem) => void;
}) {
  const columns: Column<ReportListItem>[] = [
    {
      key: 'member',
      label: 'Team member',
      primary: true,
      render: (row) => <UserAvatar user={row.user} size={26} showName />,
    },
    {
      key: 'week',
      label: 'Week',
      render: (row) => formatWeek(row.week_start),
    },
    {
      key: 'project',
      label: 'Project',
      hideOnMobile: true,
      render: (row) => (
        <Chip
          size="small"
          label={row.project.name}
          sx={{
            bgcolor: `${row.project.color}1f`,
            borderLeft: `3px solid ${row.project.color}`,
            borderRadius: 1,
          }}
        />
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusChip status={row.status} />,
    },
    {
      key: 'tasks',
      label: 'Tasks',
      align: 'center',
      hideOnMobile: true,
      render: (row) => `${row.completed_task_count}/${row.task_count}`,
    },
    {
      key: 'hours',
      label: 'Hours',
      align: 'right',
      hideOnMobile: true,
      render: (row) => Number(row.total_hours_spent).toFixed(1),
    },
    {
      key: 'updated',
      label: 'Updated',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <Typography variant="caption" color="text.secondary">
          {relativeTime(row.last_submitted_at ?? row.updated_at)}
        </Typography>
      ),
    },
    {
      key: 'action',
      label: '',
      align: 'right',
      render: (row) => (
        <Button
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(row);
          }}
        >
          {row.status === 'SUBMITTED' ? 'Review' : 'View'}
        </Button>
      ),
    },
  ];

  // Any change to a filter resets to the first page: staying on page 3 of a
  // result set that no longer has three pages shows an empty table.
  const patch = (next: Partial<TeamReportFilters>) => onChange({ ...next, offset: 0 });

  const hasFilters =
    filters.userId !== undefined || Boolean(filters.status) || filters.projectId !== undefined;

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ mb: 1.5, alignItems: { md: 'center' } }}
      >
        <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
          All reports
        </Typography>

        <TextField
          select
          size="small"
          label="Team member"
          value={filters.userId ?? ''}
          onChange={(event) =>
            patch({ userId: event.target.value ? Number(event.target.value) : undefined })
          }
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">All members</MenuItem>
          {members.map((member) => (
            <MenuItem key={member.id} value={member.id}>
              {member.full_name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Status"
          value={filters.status}
          onChange={(event) => patch({ status: event.target.value })}
          sx={{ minWidth: 170 }}
        >
          {STATUSES.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        {/* Dates rather than weeks: the server filters on week_start, and any
            day inside a week selects that week's reports. */}
        <TextField
          size="small"
          type="date"
          label="From"
          value={filters.from}
          onChange={(event) => patch({ from: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 160 }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={filters.to}
          onChange={(event) => patch({ to: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 160 }}
        />

        {hasFilters && (
          <Button
            size="small"
            onClick={() => patch({ userId: undefined, projectId: undefined, status: '' })}
          >
            Clear
          </Button>
        )}
      </Stack>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        onRowClick={onOpen}
        emptyTitle="No reports match these filters"
        emptyDescription="Widen the date range, or clear the member and status filters."
        total={data?.total}
        limit={filters.limit}
        offset={filters.offset}
        onPageChange={(offset) => onChange({ offset })}
        onLimitChange={(limit) => onChange({ limit, offset: 0 })}
      />
    </Box>
  );
}
