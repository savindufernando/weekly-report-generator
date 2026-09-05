import {
  Box, Button, Chip, Grid, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  type Column, DataTable, MetricTile, PageHeader, StatusChip,
} from '../../components/common';
import { useReports } from '../../hooks/useReports';
import { STATUS_COLORS } from '../../theme/theme';
import type { ReportListItem, ReportStatus } from '../../types';
import { formatWeek, relativeTime } from '../../utils/week';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'NEEDS_CORRECTION', label: 'Needs correction' },
  { value: 'APPROVED', label: 'Approved' },
];

export default function MyReportsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState('-week_start');

  const filters = useMemo(
    () => ({ status: status || undefined, limit, offset, sort }),
    [status, limit, offset, sort],
  );

  const { data, isPending, error, refetch } = useReports(filters);
  const rows = data?.items ?? [];

  // Counts across the loaded page — the dashboard owns team-wide numbers.
  const counts = useMemo(() => {
    const tally = { APPROVED: 0, NEEDS_CORRECTION: 0, SUBMITTED: 0, DRAFT: 0 };
    rows.forEach((row) => {
      tally[row.status as keyof typeof tally] += 1;
    });
    return tally;
  }, [rows]);

  const columns: Column<ReportListItem>[] = [
    {
      key: 'week_start',
      label: 'Week',
      sortable: true,
      primary: true,
      render: (row) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {formatWeek(row.week_start)}
        </Typography>
      ),
    },
    {
      key: 'project',
      label: 'Project',
      render: (row) => (
        <Chip
          size="small"
          label={row.project.name}
          sx={{
            bgcolor: `${row.project.color}1f`,
            color: 'text.primary',
            borderLeft: `3px solid ${row.project.color}`,
            borderRadius: 1,
          }}
        />
      ),
    },
    {
      key: 'tasks',
      label: 'Tasks',
      align: 'right',
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
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <StatusChip status={row.status} />,
    },
    {
      key: 'updated_at',
      label: 'Updated',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <Typography variant="caption" color="text.secondary">
          {relativeTime(row.updated_at)}
        </Typography>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="My Reports"
        subtitle="Your weekly reports, most recent first"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/reports/new')}>
            New report
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricTile label="Approved" value={counts.APPROVED} isLoading={isPending} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricTile
            label="Needs correction"
            value={counts.NEEDS_CORRECTION}
            isLoading={isPending}
            secondary={counts.NEEDS_CORRECTION > 0 ? 'Action needed' : undefined}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricTile label="Awaiting review" value={counts.SUBMITTED} isLoading={isPending} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricTile label="Drafts" value={counts.DRAFT} isLoading={isPending} />
        </Grid>
      </Grid>

      <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0); // a new filter means a new result set — go to page 1
          }}
          sx={{ minWidth: 190, maxWidth: 220 }}
        >
          {STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
      </Stack>

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        isLoading={isPending}
        error={error}
        onRetry={refetch}
        onRowClick={(row) => navigate(`/reports/${row.id}`)}
        // Reports sent back for correction are the ones demanding attention.
        rowAccent={(row) =>
          row.status === 'NEEDS_CORRECTION' ? STATUS_COLORS.NEEDS_CORRECTION : undefined
        }
        emptyTitle="No reports yet"
        emptyDescription="Create your first weekly report to get started."
        emptyAction={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/reports/new')}>
            New report
          </Button>
        }
        total={data?.total}
        limit={limit}
        offset={offset}
        onPageChange={setOffset}
        onLimitChange={(next) => {
          setLimit(next);
          setOffset(0);
        }}
        sort={sort}
        onSortChange={setSort}
      />
    </>
  );
}

export type { ReportStatus };
