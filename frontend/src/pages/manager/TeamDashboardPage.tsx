import {
  Box, Button, Chip, Grid, IconButton, MenuItem, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DescriptionIcon from '@mui/icons-material/Description';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

import {
  type Column, DataTable, MetricTile, PageHeader, SectionCard, StatusChip, UserAvatar,
} from '../../components/common';
import {
  ComplianceDonut, ProjectWorkloadChart, StatusByMemberChart, TaskTrendChart,
  TimeByTypeChart, WorkloadBalanceList,
} from '../../components/dashboard/charts';
import {
  TeamReportsPanel, type TeamReportFilters,
} from '../../components/dashboard/TeamReportsPanel';
import { useUsers } from '../../hooks/useAdmin';
import { useProjects, useReports } from '../../hooks/useReports';
import {
  useActivityFeed, useDashboardSummary, useStatusByMember, useTaskTrend,
  useTeamStatus, useTimeByType, useWorkloadBalance, useWorkloadByProject,
} from '../../hooks/useReview';
import { STATUS_COLORS } from '../../theme/theme';
import type { TeamStatusRow } from '../../types';
import { currentWeekStart, formatWeek, relativeTime, shiftWeeks } from '../../utils/week';

export default function TeamDashboardPage() {
  const navigate = useNavigate();
  // Filters live in the URL, so a filtered dashboard is shareable and survives
  // a reload — which matters when a manager wants to send someone a link.
  const [params, setParams] = useSearchParams();
  const week = params.get('week') ?? currentWeekStart();
  const projectId = params.get('project') ? Number(params.get('project')) : undefined;

  const setWeek = (next: string) => {
    const updated = new URLSearchParams(params);
    updated.set('week', next);
    setParams(updated, { replace: true });
  };
  const setProject = (next: string) => {
    const updated = new URLSearchParams(params);
    if (next) updated.set('project', next);
    else updated.delete('project');
    setParams(updated, { replace: true });
  };

  /*
   * The "All reports" panel keeps its own filters, also in the URL. Defaults
   * span the eight weeks ending with the selected one, so the panel opens with
   * the same period the charts above it describe.
   */
  const reportFilters: TeamReportFilters = {
    userId: params.get('member') ? Number(params.get('member')) : undefined,
    projectId,
    status: params.get('status') ?? '',
    from: params.get('rangeFrom') ?? shiftWeeks(week, -7),
    to: params.get('rangeTo') ?? week,
    limit: Number(params.get('limit') ?? 20),
    offset: Number(params.get('offset') ?? 0),
  };

  const setReportFilters = (patch: Partial<TeamReportFilters>) => {
    const updated = new URLSearchParams(params);
    const write = (key: string, value: string | number | undefined) => {
      if (value === undefined || value === '' ) updated.delete(key);
      else updated.set(key, String(value));
    };
    if ('userId' in patch) write('member', patch.userId);
    // The project filter is shared with the header selector, so it writes the
    // same key — clearing it here clears it there too, which is what a single
    // visible "Project: All" control should mean.
    if ('projectId' in patch) write('project', patch.projectId);
    if ('status' in patch) write('status', patch.status);
    if ('from' in patch) write('rangeFrom', patch.from);
    if ('to' in patch) write('rangeTo', patch.to);
    if ('limit' in patch) write('limit', patch.limit);
    // offset 0 is the default, so it is removed rather than written as "0".
    if ('offset' in patch) write('offset', patch.offset || undefined);
    setParams(updated, { replace: true });
  };

  const from = shiftWeeks(week, -7);
  const summary = useDashboardSummary(week, projectId);
  const teamStatus = useTeamStatus(week, projectId);
  const statusByMember = useStatusByMember(from, week);
  const taskTrend = useTaskTrend(8, week);
  const workload = useWorkloadByProject(from, week);
  const timeByType = useTimeByType(from, week);
  const activity = useActivityFeed(12);
  const balance = useWorkloadBalance(week);
  const { data: projects = [] } = useProjects();
  // Managers hold user.view_all, which this endpoint requires.
  const { data: users } = useUsers({ is_active: true, limit: 100 });
  const teamReports = useReports({
    user_id: reportFilters.userId,
    project_id: reportFilters.projectId,
    status: reportFilters.status || undefined,
    from: reportFilters.from,
    to: reportFilters.to,
    limit: reportFilters.limit,
    offset: reportFilters.offset,
    sort: '-week_start',
  });

  const data = summary.data;
  const isThisWeek = week === currentWeekStart();

  const columns: Column<TeamStatusRow>[] = [
    {
      key: 'member',
      label: 'Team member',
      primary: true,
      render: (row) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <UserAvatar user={row.user} size={26} showName />
          {row.is_late && (
            <Tooltip title="First submitted after the deadline">
              <Chip size="small" color="warning" variant="outlined" label="Late" />
            </Tooltip>
          )}
        </Stack>
      ),
    },
    {
      key: 'project',
      label: 'Project',
      hideOnMobile: true,
      render: (row) =>
        row.project_name ? (
          <Chip
            size="small"
            label={row.project_name}
            sx={{
              bgcolor: `${row.project_color}1f`,
              borderLeft: `3px solid ${row.project_color}`,
              borderRadius: 1,
            }}
          />
        ) : (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        ),
    },
    {
      key: 'version',
      label: 'Version',
      align: 'center',
      hideOnMobile: true,
      render: (row) =>
        row.current_version_no > 0 ? `v${row.current_version_no}` : '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusChip status={row.status} />,
    },
    {
      key: 'action',
      label: '',
      align: 'right',
      render: (row) =>
        row.report_id ? (
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              navigate(
                row.status === 'SUBMITTED' ? `/review/${row.report_id}` : `/reports/${row.report_id}`,
              );
            }}
          >
            {row.status === 'SUBMITTED' ? 'Review' : 'View'}
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Team Dashboard"
        subtitle={`Week of ${formatWeek(week)}${isThisWeek ? ' (current)' : ''}`}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <IconButton size="small" onClick={() => setWeek(shiftWeeks(week, -1))} aria-label="Previous week">
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setWeek(shiftWeeks(week, 1))}
              disabled={isThisWeek}
              aria-label="Next week"
            >
              <ChevronRightIcon />
            </IconButton>
            <TextField
              select
              size="small"
              label="Project"
              value={projectId ?? ''}
              onChange={(event) => setProject(event.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All projects</MenuItem>
              {projects.map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        }
      />

      {/* The four metrics the brief names. */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 6, lg: 3 }}>
          <MetricTile
            label="Submitted"
            value={`${data?.submitted ?? 0} / ${data?.total_members ?? 0}`}
            delta={data?.deltas?.submitted}
            goodDirection="up"
            secondary="vs last week"
            icon={<DescriptionIcon fontSize="small" />}
            isLoading={summary.isPending}
          />
        </Grid>
        <Grid size={{ xs: 6, lg: 3 }}>
          <MetricTile
            label="Compliance"
            value={`${Math.round((data?.compliance_rate ?? 0) * 100)}%`}
            delta={
              data?.deltas?.compliance_rate !== undefined
                ? Math.round(data.deltas.compliance_rate * 100)
                : undefined
            }
            goodDirection="up"
            secondary={data?.not_started ? `${data.not_started} not started` : undefined}
            icon={<TaskAltIcon fontSize="small" />}
            isLoading={summary.isPending}
          />
        </Grid>
        <Grid size={{ xs: 6, lg: 3 }}>
          <MetricTile
            label="Needs correction"
            value={data?.needs_correction ?? 0}
            // Fewer is better here — the tile must not paint a fall as bad.
            goodDirection="down"
            secondary={data?.late ? `${data.late} late` : undefined}
            icon={<WarningAmberIcon fontSize="small" />}
            isLoading={summary.isPending}
          />
        </Grid>
        <Grid size={{ xs: 6, lg: 3 }}>
          <MetricTile
            label="Open blockers"
            value={data?.open_blockers ?? 0}
            goodDirection="down"
            secondary={data?.key_blockers ? `${data.key_blockers} flagged key` : undefined}
            icon={<ReportProblemIcon fontSize="small" />}
            isLoading={summary.isPending}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, md: 5 }}>
          <ComplianceDonut summary={data} isLoading={summary.isPending} error={summary.error} />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <TaskTrendChart
            data={taskTrend.data}
            isLoading={taskTrend.isPending}
            error={taskTrend.error}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ProjectWorkloadChart
            data={workload.data}
            isLoading={workload.isPending}
            error={workload.error}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TimeByTypeChart
            data={timeByType.data}
            isLoading={timeByType.isPending}
            error={timeByType.error}
          />
        </Grid>
        <Grid size={12}>
          <StatusByMemberChart
            data={statusByMember.data}
            isLoading={statusByMember.isPending}
            error={statusByMember.error}
          />
        </Grid>
      </Grid>

      {/* The roster-driven table: members with no report appear here as
          "Not started" rather than being silently absent. */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
          Team status this week
        </Typography>
        <DataTable
          columns={columns}
          rows={teamStatus.data ?? []}
          getRowKey={(row) => row.user.id}
          isLoading={teamStatus.isPending}
          error={teamStatus.error}
          onRetry={teamStatus.refetch}
          onRowClick={(row) => navigate(`/team/${row.user.id}`)}
          rowAccent={(row) =>
            row.status === 'NOT_STARTED'
              ? STATUS_COLORS.NOT_STARTED
              : row.status === 'NEEDS_CORRECTION'
                ? STATUS_COLORS.NEEDS_CORRECTION
                : undefined
          }
          emptyTitle="No active team members"
        />
      </Box>

      {/* Filter across members, projects, statuses and an arbitrary date
          range — the week-scoped table above cannot express any of those. */}
      <Box sx={{ mb: 2.5 }}>
        <TeamReportsPanel
          data={teamReports.data}
          isLoading={teamReports.isPending}
          error={teamReports.error}
          onRetry={teamReports.refetch}
          members={users?.items ?? []}
          filters={reportFilters}
          onChange={setReportFilters}
          onOpen={(report) =>
            navigate(
              report.status === 'SUBMITTED' ? `/review/${report.id}` : `/reports/${report.id}`,
            )
          }
        />
      </Box>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          <SectionCard title="Workload balance" subtitle={`Team average ${balance.data?.mean_hours ?? 0}h`}>
            {balance.data && balance.data.members.length > 0 ? (
              <WorkloadBalanceList
                members={balance.data.members}
                meanHours={balance.data.mean_hours}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                No hours recorded this week.
              </Typography>
            )}
          </SectionCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <SectionCard title="Recent activity" subtitle="Submissions and review actions">
            {activity.data && activity.data.items.length > 0 ? (
              <Stack spacing={1.5}>
                {activity.data.items.map((item) => (
                  <Stack key={item.id} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
                    {item.actor && <UserAvatar user={item.actor} size={26} />}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2">{item.summary}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {relativeTime(item.created_at)}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No activity yet.
              </Typography>
            )}
          </SectionCard>
        </Grid>
      </Grid>
    </>
  );
}

