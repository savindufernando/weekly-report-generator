import { Chip, Link, Stack, Typography } from '@mui/material';
import LaunchIcon from '@mui/icons-material/Launch';

import { SectionCard } from '../common';
import { HoursBreakdownView } from './HoursBreakdown';
import { KeyFlagListView } from './KeyFlagList';
import { TaskTableView, type ReadonlyTask } from './TaskTable';
import type { ReportDetail, VersionContent } from '../../types';

/**
 * Read-only rendering of a report's content.
 *
 * Used by three places: the member's detail page, the manager's review page,
 * and the past-version dialog. One implementation means a manager reviewing a
 * report sees exactly what the member wrote — and it is why a frozen snapshot
 * and a live report can be displayed by the same code.
 */

interface ViewModel {
  project: { name: string; color?: string };
  notes: string | null;
  links: Array<{ label: string; url: string }>;
  tasks: ReadonlyTask[];
  next_week_tasks: Array<{ description: string; priority: string }>;
  blockers: Array<{ description: string; severity?: string; is_key: boolean; is_resolved?: boolean }>;
  achievements: Array<{ description: string; is_key: boolean }>;
  hours_by_type: Record<string, number | string>;
}

/** Live report -> view model. */
export function fromReport(report: ReportDetail): ViewModel {
  return {
    project: { name: report.project.name, color: report.project.color },
    notes: report.notes,
    links: report.links ?? [],
    tasks: report.tasks,
    next_week_tasks: report.next_week_tasks,
    blockers: report.blockers,
    achievements: report.achievements,
    hours_by_type: report.hours_by_type,
  };
}

/** Frozen snapshot -> the same view model, so both render identically. */
export function fromVersion(content: VersionContent): ViewModel {
  return {
    project: { name: content.project.name },
    notes: content.notes,
    links: content.links ?? [],
    tasks: content.tasks,
    next_week_tasks: content.next_week_tasks,
    blockers: content.blockers,
    achievements: content.achievements,
    hours_by_type: content.hours_by_type,
  };
}

export function ReportSectionView({ data }: { data: ViewModel }) {
  return (
    <Stack spacing={2.5}>
      <SectionCard title="Tasks completed">
        <TaskTableView tasks={data.tasks} />
      </SectionCard>

      <SectionCard title="Planned for next week">
        {data.next_week_tasks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing planned.
          </Typography>
        ) : (
          <Stack spacing={0.75}>
            {data.next_week_tasks.map((task, index) => (
              <Stack key={index} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                  sx={{ minWidth: 74 }}
                />
                <Typography variant="body2">{task.description}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Blockers & challenges">
        <KeyFlagListView items={data.blockers} emptyText="No blockers reported this week." />
      </SectionCard>

      <SectionCard title="Achievements & highlights">
        <KeyFlagListView items={data.achievements} emptyText="No achievements recorded." />
      </SectionCard>

      <SectionCard title="Hours by task type">
        <HoursBreakdownView hours={data.hours_by_type} />
      </SectionCard>

      {(data.notes || data.links.length > 0) && (
        <SectionCard title="Notes & links">
          <Stack spacing={2}>
            {data.notes && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {data.notes}
              </Typography>
            )}
            {data.links.length > 0 && (
              <Stack spacing={0.5}>
                {data.links.map((link, index) => (
                  <Link
                    key={index}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, width: 'fit-content' }}
                  >
                    {link.label}
                    <LaunchIcon sx={{ fontSize: 14 }} />
                  </Link>
                ))}
              </Stack>
            )}
          </Stack>
        </SectionCard>
      )}
    </Stack>
  );
}

export function ProjectChip({ name, color }: { name: string; color?: string }) {
  return (
    <Chip
      size="small"
      label={name}
      sx={{
        bgcolor: color ? `${color}1f` : undefined,
        borderLeft: color ? `3px solid ${color}` : undefined,
        borderRadius: 1,
      }}
    />
  );
}

export type { ViewModel };
