import { Box, Chip, Grid, Stack, Tooltip, Typography } from '@mui/material';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  type Column, DataTable, ErrorState, LoadingState, MetricTile, PageHeader,
  SectionCard, StatusChip, UserAvatar,
} from '../../components/common';
import { useReports } from '../../hooks/useReports';
import { useMemberProfile } from '../../hooks/useReview';
import { MONO, STATUS_COLORS } from '../../theme/theme';
import type { ReportListItem, ReportStatus } from '../../types';
import { formatWeek, relativeTime } from '../../utils/week';

export default function MemberProfilePage() {
  const { userId } = useParams();
  const id = Number(userId);
  const navigate = useNavigate();

  const profile = useMemberProfile(id, 16);
  const filters = useMemo(() => ({ user_id: id, limit: 20, offset: 0 }), [id]);
  const reports = useReports(filters);

  if (profile.isPending) return <LoadingState variant="page" />;
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  if (!profile.data) return null;

  const { user, stats, weekly_status: weekly } = profile.data;

  const columns: Column<ReportListItem>[] = [
    {
      key: 'week',
      label: 'Week',
      primary: true,
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
          sx={{ bgcolor: `${row.project.color}1f`, borderLeft: `3px solid ${row.project.color}` }}
        />
      ),
    },
    {
      key: 'tasks',
      label: 'Tasks',
      align: 'right',
      render: (row) => (
        <Typography sx={{ fontFamily: MONO, fontSize: 13 }}>
          {row.completed_task_count}/{row.task_count}
        </Typography>
      ),
    },
    {
      key: 'hours',
      label: 'Hours',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <Typography sx={{ fontFamily: MONO, fontSize: 13 }}>
          {Number(row.total_hours_spent).toFixed(1)}
        </Typography>
      ),
    },
    { key: 'status', label: 'Status', render: (row) => <StatusChip status={row.status} /> },
    {
      key: 'updated',
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
        title={user.full_name}
        breadcrumbs={[{ label: 'Team Dashboard', to: '/dashboard' }, { label: user.full_name }]}
        subtitle={
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 0.5 }}>
            <UserAvatar user={user} size={26} />
            <Typography sx={{ fontFamily: MONO, fontSize: 12.5, color: 'text.secondary' }}>
              {profile.data.email}
            </Typography>
            <Chip size="small" variant="outlined" label={profile.data.role} />
            {profile.data.job_title && (
              <Typography variant="caption" color="text.secondary">
                {profile.data.job_title}
              </Typography>
            )}
          </Stack>
        }
      />

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricTile label="Reports filed" value={stats.total_reports} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricTile
            label="Approval rate"
            value={`${Math.round(stats.approval_rate * 100)}%`}
            secondary={`${stats.approved} approved`}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricTile
            label="Rounds per report"
            value={stats.avg_submissions_per_report.toFixed(1)}
            secondary="1.0 means approved first time"
            goodDirection="down"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricTile label="Needs correction" value={stats.needs_correction} goodDirection="down" />
        </Grid>
      </Grid>

      {/* Submission consistency at a glance: one square per week, coloured by
          status. Missing weeks read as gaps, which is the point. */}
      <Box sx={{ mb: 2.5 }}>
        <SectionCard
          title="Submission history"
          subtitle={`Last ${weekly.length} weeks, oldest first`}
        >
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
            {weekly.map((week) => (
              <Tooltip
                key={week.week_start}
                title={`${formatWeek(week.week_start)} — ${week.status.replace('_', ' ').toLowerCase()}`}
              >
                <Box
                  sx={{
                    width: 26,
                    height: 26,
                    borderRadius: '3px',
                    bgcolor: STATUS_COLORS[week.status as ReportStatus],
                    // Not-started weeks are hollow rather than filled, so a gap
                    // reads as absence rather than as another category.
                    opacity: week.status === 'NOT_STARTED' ? 0.28 : 1,
                  }}
                />
              </Tooltip>
            ))}
          </Stack>
        </SectionCard>
      </Box>

      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
        Reports
      </Typography>
      <DataTable
        columns={columns}
        rows={reports.data?.items ?? []}
        getRowKey={(row) => row.id}
        isLoading={reports.isPending}
        error={reports.error}
        onRetry={reports.refetch}
        onRowClick={(row) => navigate(`/reports/${row.id}`)}
        rowAccent={(row) =>
          row.status === 'NEEDS_CORRECTION' ? STATUS_COLORS.NEEDS_CORRECTION : undefined
        }
        emptyTitle="No reports yet"
      />
    </>
  );
}
