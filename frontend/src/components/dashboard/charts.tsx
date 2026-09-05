import { Box, Stack, Typography } from '@mui/material';
import {
  Bar, BarChart, CartesianGrid, Cell, Label, Legend, Line, LineChart, Pie,
  PieChart, Tooltip, XAxis, YAxis,
} from 'recharts';

import { ChartCard, tooltipStyle, useChartColors } from './ChartCard';
import { STATUS_COLORS } from '../../theme/theme';
import type {
  DashboardSummary, ProjectWorkloadRow, StatusByMemberRow, TaskTrendPoint, TimeByTypeRow,
} from '../../types';
import { formatWeekShort } from '../../utils/week';

/*
 * Status stacking order is the colour-vision-validated one and must not be
 * reordered for aesthetics. Putting APPROVED (green) next to NOT_STARTED (red)
 * — the intuitive "good and bad at opposite ends" arrangement — places those
 * two at deltaE 4.1 under deuteranopia, which roughly 8% of men cannot
 * separate. Keeping grey, blue and amber between them raises the worst
 * adjacent pair to deltaE 9.1 in both light and dark mode.
 */
const STATUS_STACK = [
  { key: 'not_started', label: 'Not started', color: STATUS_COLORS.NOT_STARTED },
  { key: 'draft', label: 'Draft', color: STATUS_COLORS.DRAFT },
  { key: 'submitted', label: 'Submitted', color: STATUS_COLORS.SUBMITTED },
  { key: 'needs_correction', label: 'Needs correction', color: STATUS_COLORS.NEEDS_CORRECTION },
  { key: 'approved', label: 'Approved', color: STATUS_COLORS.APPROVED },
] as const;

const AXIS_TICK = { fontSize: 12, fontVariantNumeric: 'tabular-nums' as const };

/* ------------------------------------------------- status by member (stacked) */

export function StatusByMemberChart({
  data, isLoading, error,
}: {
  data: StatusByMemberRow[] | undefined;
  isLoading?: boolean;
  error?: unknown;
}) {
  const colors = useChartColors();
  const rows = data ?? [];

  return (
    <ChartCard
      title="Report status by team member"
      subtitle="Across the selected period"
      height={Math.max(280, rows.length * 42)}
      isLoading={isLoading}
      error={error}
      isEmpty={rows.length === 0}
      emptyText="No team members yet"
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={colors.grid} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: colors.muted, ...AXIS_TICK }}
          axisLine={{ stroke: colors.axis }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="full_name"
          width={130}
          tick={{ fill: colors.muted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {STATUS_STACK.map((status, index) => (
          <Bar
            key={status.key}
            dataKey={status.key}
            name={status.label}
            stackId="status"
            fill={status.color}
            // A 2px surface-coloured stroke separates adjacent segments so two
            // statuses never bleed into one another.
            stroke={colors.surface}
            strokeWidth={2}
            radius={index === STATUS_STACK.length - 1 ? [0, 4, 4, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartCard>
  );
}

/* ------------------------------------------------------- task trend (line) */

export function TaskTrendChart({
  data, isLoading, error,
}: {
  data: TaskTrendPoint[] | undefined;
  isLoading?: boolean;
  error?: unknown;
}) {
  const colors = useChartColors();
  const rows = (data ?? []).map((point) => ({
    ...point,
    label: formatWeekShort(point.week_start),
  }));

  return (
    <ChartCard
      title="Tasks completed over time"
      subtitle="Team-wide, by week"
      isLoading={isLoading}
      error={error}
      // Weeks with no data are still plotted as zeros — a gap is information,
      // and dropping the point silently rescales the axis.
      isEmpty={rows.length === 0}
    >
      <LineChart data={rows} margin={{ left: -12, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={colors.grid} />
        <XAxis
          dataKey="label"
          tick={{ fill: colors.muted, ...AXIS_TICK }}
          axisLine={{ stroke: colors.axis }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: colors.muted, ...AXIS_TICK }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle(colors)} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Line
          type="monotone"
          dataKey="completed_tasks"
          name="Completed"
          stroke={STATUS_COLORS.APPROVED}
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 0, fill: STATUS_COLORS.APPROVED }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="total_tasks"
          name="Total"
          stroke={STATUS_COLORS.SUBMITTED}
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={{ r: 3, strokeWidth: 0, fill: STATUS_COLORS.SUBMITTED }}
        />
      </LineChart>
    </ChartCard>
  );
}

/* ------------------------------------------- workload by project (sorted bar) */

export function ProjectWorkloadChart({
  data, isLoading, error,
}: {
  data: ProjectWorkloadRow[] | undefined;
  isLoading?: boolean;
  error?: unknown;
}) {
  const colors = useChartColors();
  // Sorted descending: the question here is "which project is eating the
  // team?", which is a ranking question — so a bar, not a pie.
  const rows = [...(data ?? [])].sort((a, b) => b.task_count - a.task_count);

  return (
    <ChartCard
      title="Workload by project"
      subtitle="Tasks per project"
      isLoading={isLoading}
      error={error}
      isEmpty={rows.length === 0}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 28, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={colors.grid} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: colors.muted, ...AXIS_TICK }}
          axisLine={{ stroke: colors.axis }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={132}
          tick={{ fill: colors.muted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
        <Bar dataKey="task_count" name="Tasks" radius={[0, 4, 4, 0]} barSize={18}>
          {/* Colour follows the project, so filtering never repaints survivors. */}
          {rows.map((row) => (
            <Cell key={row.project_id} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

/* ------------------------------------------------ time by task type (bar) */

const TYPE_LABELS: Record<string, string> = {
  DEVELOPMENT: 'Development',
  TESTING: 'Testing',
  MEETINGS: 'Meetings',
  DOCUMENTATION: 'Documentation',
  REVIEW: 'Code review',
  OTHER: 'Other',
};

export function TimeByTypeChart({
  data, isLoading, error,
}: {
  data: TimeByTypeRow[] | undefined;
  isLoading?: boolean;
  error?: unknown;
}) {
  const colors = useChartColors();
  const rows = [...(data ?? [])]
    .map((row) => ({ label: TYPE_LABELS[row.task_type] ?? row.task_type, hours: Number(row.hours) }))
    .sort((a, b) => b.hours - a.hours);

  return (
    <ChartCard
      title="Time by task type"
      subtitle="Hours across the team"
      isLoading={isLoading}
      error={error}
      isEmpty={rows.length === 0}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 28, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={colors.grid} />
        <XAxis
          type="number"
          tick={{ fill: colors.muted, ...AXIS_TICK }}
          axisLine={{ stroke: colors.axis }}
          tickLine={false}
          unit="h"
        />
        <YAxis
          type="category"
          dataKey="label"
          width={112}
          tick={{ fill: colors.muted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
        {/* A single series needs no legend — the title names it. */}
        <Bar
          dataKey="hours"
          name="Hours"
          fill={STATUS_COLORS.SUBMITTED}
          radius={[0, 4, 4, 0]}
          barSize={18}
        />
      </BarChart>
    </ChartCard>
  );
}

/* ------------------------------------------------- compliance donut */

/**
 * The one legitimate pie here: genuine part-to-whole over five categories,
 * with the compliance rate as a hero number in the hole. Project and task-type
 * distribution are ranking questions and use sorted bars instead.
 */
export function ComplianceDonut({
  summary, isLoading, error,
}: {
  summary: DashboardSummary | undefined;
  isLoading?: boolean;
  error?: unknown;
}) {
  const colors = useChartColors();

  const slices = summary
    ? [
        { name: 'Not started', value: summary.not_started, fill: STATUS_COLORS.NOT_STARTED },
        { name: 'Draft', value: summary.pending, fill: STATUS_COLORS.DRAFT },
        {
          name: 'Awaiting review',
          value: Math.max(summary.submitted - summary.approved - summary.needs_correction, 0),
          fill: STATUS_COLORS.SUBMITTED,
        },
        { name: 'Needs correction', value: summary.needs_correction, fill: STATUS_COLORS.NEEDS_CORRECTION },
        { name: 'Approved', value: summary.approved, fill: STATUS_COLORS.APPROVED },
      ].filter((slice) => slice.value > 0)
    : [];

  const rate = Math.round((summary?.compliance_rate ?? 0) * 100);

  return (
    <ChartCard
      title="Submission status"
      subtitle="This week, across the team"
      isLoading={isLoading}
      error={error}
      isEmpty={slices.length === 0}
      emptyText="No members yet"
    >
      <PieChart>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          innerRadius="60%"
          outerRadius="86%"
          paddingAngle={2}
          stroke={colors.surface}
          strokeWidth={2}
        >
          {slices.map((slice) => (
            <Cell key={slice.name} fill={slice.fill} />
          ))}
          <Label
            position="center"
            content={() => (
              <>
                <text
                  x="50%"
                  y="47%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fill: colors.text, fontSize: 30, fontWeight: 700 }}
                >
                  {rate}%
                </text>
                <text
                  x="50%"
                  y="60%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fill: colors.muted, fontSize: 12 }}
                >
                  compliance
                </text>
              </>
            )}
          />
        </Pie>
        <Tooltip {...tooltipStyle(colors)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ChartCard>
  );
}

/* ------------------------------------------------- workload balance strip */

export function WorkloadBalanceList({
  members, meanHours,
}: {
  members: Array<{ user_id: number; full_name: string; hours_spent: string; flag: string | null }>;
  meanHours: number;
}) {
  const max = Math.max(...members.map((m) => Number(m.hours_spent)), meanHours, 1);

  return (
    <Stack spacing={1.25}>
      {members.map((member) => {
        const hours = Number(member.hours_spent);
        const tone =
          member.flag === 'overloaded'
            ? 'error.main'
            : member.flag === 'underloaded'
              ? 'warning.main'
              : 'primary.main';

        return (
          <Box key={member.user_id}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.4 }}>
              <Typography variant="body2">{member.full_name}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {/* The flag is a word, not just a colour. */}
                {member.flag && (
                  <Typography variant="caption" sx={{ color: tone, fontWeight: 600 }}>
                    {member.flag}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                >
                  {hours.toFixed(1)}h
                </Typography>
              </Stack>
            </Stack>
            <Box sx={{ position: 'relative', height: 6, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Box
                sx={{
                  height: '100%',
                  width: `${(hours / max) * 100}%`,
                  bgcolor: tone,
                  borderRadius: 1,
                }}
              />
              {/* Team mean marker, so an outlier is visible against a reference. */}
              <Box
                sx={{
                  position: 'absolute',
                  top: -2,
                  left: `${(meanHours / max) * 100}%`,
                  width: 2,
                  height: 10,
                  bgcolor: 'text.disabled',
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
