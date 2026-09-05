import { z } from 'zod';

import type { ReportContentInput, ReportDetail, TaskType } from '../../types';

/**
 * The report form schema.
 *
 * Mirrors the backend's Pydantic rules deliberately, field for field. Client
 * validation exists for fast feedback; the server enforces the same
 * constraints independently and is the only one that counts.
 */

const decimalString = z
  .string()
  .trim()
  .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'Must be 0 or more')
  .refine((v) => v === '' || Number(v) <= 168, 'Cannot exceed 168 hours');

export const taskSchema = z.object({
  name: z.string().trim().min(1, 'Task name is required').max(255),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'DEFERRED']),
  planned_pct: z.number().int().min(0, '0–100').max(100, '0–100'),
  actual_pct: z.number().int().min(0, '0–100').max(100, '0–100'),
  hours_planned: decimalString,
  hours_spent: decimalString,
  deliverable: z.string().max(500).nullish(),
});

export const reportFormSchema = z.object({
  project_id: z.number().int().positive('Choose a project'),
  notes: z.string().max(5000).nullish(),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Label is required').max(120),
        url: z.string().trim().min(1, 'URL is required').max(500),
      }),
    )
    .max(20),
  tasks: z.array(taskSchema).max(50),
  next_week_tasks: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Describe the task').max(500),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      }),
    )
    .max(50),
  blockers: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Describe the blocker').max(2000),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        is_key: z.boolean(),
        is_resolved: z.boolean(),
      }),
    )
    .max(30)
    // The brief says flag *one* as the key issue. The database enforces this
    // too, with a unique index on a generated column; this check just produces
    // a readable message before the request is sent.
    .refine((list) => list.filter((b) => b.is_key).length <= 1, {
      message: 'Only one blocker can be the key issue',
    }),
  achievements: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Describe the achievement').max(2000),
        is_key: z.boolean(),
      }),
    )
    .max(30)
    .refine((list) => list.filter((a) => a.is_key).length <= 1, {
      message: 'Only one achievement can be the key one',
    }),
  hours_by_type: z.record(z.string(), decimalString),
});

export type ReportFormValues = z.infer<typeof reportFormSchema>;

export const TASK_TYPE_ORDER: TaskType[] = [
  'DEVELOPMENT',
  'TESTING',
  'MEETINGS',
  'DOCUMENTATION',
  'REVIEW',
  'OTHER',
];

/** Server shape -> form shape. */
export function toFormValues(report: ReportDetail): ReportFormValues {
  return {
    project_id: report.project.id,
    notes: report.notes ?? '',
    links: report.links ?? [],
    tasks: report.tasks.map((task) => ({
      name: task.name,
      priority: task.priority,
      status: task.status,
      planned_pct: task.planned_pct,
      actual_pct: task.actual_pct,
      hours_planned: task.hours_planned,
      hours_spent: task.hours_spent,
      deliverable: task.deliverable ?? '',
    })),
    next_week_tasks: report.next_week_tasks.map((t) => ({
      description: t.description,
      priority: t.priority,
    })),
    blockers: report.blockers.map((b) => ({
      description: b.description,
      severity: b.severity,
      is_key: b.is_key,
      is_resolved: b.is_resolved,
    })),
    achievements: report.achievements.map((a) => ({
      description: a.description,
      is_key: a.is_key,
    })),
    hours_by_type: Object.fromEntries(
      TASK_TYPE_ORDER.map((type) => [type, report.hours_by_type[type] ?? '']),
    ),
  };
}

/** Form shape -> request body. */
export function toRequestBody(values: ReportFormValues): ReportContentInput {
  const hours: Partial<Record<TaskType, string>> = {};
  for (const [type, value] of Object.entries(values.hours_by_type)) {
    // Blank and zero entries are simply omitted — the API stores one row per
    // task type, and a zero row would skew nothing but clutter everything.
    if (value && Number(value) > 0) hours[type as TaskType] = value;
  }

  return {
    project_id: values.project_id,
    notes: values.notes?.trim() || null,
    links: values.links,
    tasks: values.tasks.map((task) => ({
      ...task,
      hours_planned: task.hours_planned || '0',
      hours_spent: task.hours_spent || '0',
      deliverable: task.deliverable?.trim() || null,
    })),
    next_week_tasks: values.next_week_tasks,
    blockers: values.blockers,
    achievements: values.achievements,
    hours_by_type: hours,
  };
}
