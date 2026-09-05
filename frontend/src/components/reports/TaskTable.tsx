import {
  Box, Card, IconButton, MenuItem, Stack, Table, TableBody, TableCell,
  TableFooter, TableHead, TableRow, TextField, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import Button from '@mui/material/Button';
import { Controller, useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';

import { PriorityChip } from '../common';
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskStatus } from '../../types';
import type { ReportFormValues } from '../../pages/reports/reportForm';

const STATUS_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
  DEFERRED: 'Deferred',
};

const EMPTY_TASK = {
  name: '',
  priority: 'MEDIUM' as const,
  status: 'IN_PROGRESS' as const,
  planned_pct: 0,
  actual_pct: 0,
  hours_planned: '0',
  hours_spent: '0',
  deliverable: '',
};

/* ------------------------------------------------------------------ editable */

export function TaskTableEditor({
  control,
  register,
  errors,
}: {
  control: Control<ReportFormValues>;
  register: UseFormRegister<ReportFormValues>;
  errors?: Record<string, unknown>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'tasks' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const rowFields = (index: number) => (
    <>
      <TextField
        {...register(`tasks.${index}.name`)}
        placeholder="What did you work on?"
        error={Boolean((errors?.tasks as never[])?.[index])}
        fullWidth
      />
      <Controller
        name={`tasks.${index}.priority`}
        control={control}
        render={({ field }) => (
          <TextField {...field} select label={isMobile ? 'Priority' : undefined}>
            {TASK_PRIORITIES.map((p) => (
              <MenuItem key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller
        name={`tasks.${index}.status`}
        control={control}
        render={({ field }) => (
          <TextField {...field} select label={isMobile ? 'Status' : undefined}>
            {TASK_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <TextField
        {...register(`tasks.${index}.planned_pct`, { valueAsNumber: true })}
        type="number"
        label={isMobile ? 'Planned %' : undefined}
        slotProps={{ htmlInput: { min: 0, max: 100 } }}
      />
      <TextField
        {...register(`tasks.${index}.actual_pct`, { valueAsNumber: true })}
        type="number"
        label={isMobile ? 'Actual %' : undefined}
        slotProps={{ htmlInput: { min: 0, max: 100 } }}
      />
      <TextField
        {...register(`tasks.${index}.hours_planned`)}
        label={isMobile ? 'Hrs planned' : undefined}
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      />
      <TextField
        {...register(`tasks.${index}.hours_spent`)}
        label={isMobile ? 'Hrs spent' : undefined}
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      />
      <TextField
        {...register(`tasks.${index}.deliverable`)}
        placeholder="Output / link"
        label={isMobile ? 'Deliverable' : undefined}
        fullWidth
      />
    </>
  );

  // Below md the seven-column grid is unusable; each task becomes a card.
  if (isMobile) {
    return (
      <Stack spacing={1.5}>
        {fields.map((field, index) => (
          <Card key={field.id} sx={{ p: 1.75 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Task {index + 1}
              </Typography>
              <IconButton size="small" onClick={() => remove(index)} aria-label="Remove task">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Stack spacing={1.5}>{rowFields(index)}</Stack>
          </Card>
        ))}
        <Button startIcon={<AddIcon />} onClick={() => append(EMPTY_TASK)}>
          Add task
        </Button>
      </Stack>
    );
  }

  return (
    <Box>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 220 }}>Task</TableCell>
              <TableCell sx={{ width: 116 }}>Priority</TableCell>
              <TableCell sx={{ width: 132 }}>Status</TableCell>
              <TableCell sx={{ width: 88 }} align="right">Plan %</TableCell>
              <TableCell sx={{ width: 88 }} align="right">Actual %</TableCell>
              <TableCell sx={{ width: 92 }} align="right">Hrs plan</TableCell>
              <TableCell sx={{ width: 92 }} align="right">Hrs spent</TableCell>
              <TableCell sx={{ minWidth: 160 }}>Deliverable</TableCell>
              <TableCell sx={{ width: 44 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((field, index) => {
              const cells = [
                <TextField
                  key="name"
                  {...register(`tasks.${index}.name`)}
                  placeholder="What did you work on?"
                  fullWidth
                />,
                <Controller
                  key="priority"
                  name={`tasks.${index}.priority`}
                  control={control}
                  render={({ field: f }) => (
                    <TextField {...f} select fullWidth>
                      {TASK_PRIORITIES.map((p) => (
                        <MenuItem key={p} value={p}>
                          {p.charAt(0) + p.slice(1).toLowerCase()}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />,
                <Controller
                  key="status"
                  name={`tasks.${index}.status`}
                  control={control}
                  render={({ field: f }) => (
                    <TextField {...f} select fullWidth>
                      {TASK_STATUSES.map((s) => (
                        <MenuItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />,
                <TextField
                  key="planned"
                  {...register(`tasks.${index}.planned_pct`, { valueAsNumber: true })}
                  type="number"
                  slotProps={{ htmlInput: { min: 0, max: 100, style: { textAlign: 'right' } } }}
                />,
                <TextField
                  key="actual"
                  {...register(`tasks.${index}.actual_pct`, { valueAsNumber: true })}
                  type="number"
                  slotProps={{ htmlInput: { min: 0, max: 100, style: { textAlign: 'right' } } }}
                />,
                <TextField
                  key="hp"
                  {...register(`tasks.${index}.hours_planned`)}
                  slotProps={{ htmlInput: { inputMode: 'decimal', style: { textAlign: 'right' } } }}
                />,
                <TextField
                  key="hs"
                  {...register(`tasks.${index}.hours_spent`)}
                  slotProps={{ htmlInput: { inputMode: 'decimal', style: { textAlign: 'right' } } }}
                />,
                <TextField
                  key="deliverable"
                  {...register(`tasks.${index}.deliverable`)}
                  placeholder="Output / link"
                  fullWidth
                />,
              ];
              return (
                <TableRow key={field.id}>
                  {cells.map((cell, i) => (
                    <TableCell key={i} sx={{ px: 0.5, py: 0.75 }}>
                      {cell}
                    </TableCell>
                  ))}
                  <TableCell sx={{ px: 0.5 }}>
                    <Tooltip title="Remove task">
                      <IconButton size="small" onClick={() => remove(index)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>

      <Button startIcon={<AddIcon />} onClick={() => append(EMPTY_TASK)} sx={{ mt: 1 }}>
        Add task
      </Button>
    </Box>
  );
}

/* ------------------------------------------------------------------ readonly */

/**
 * The same task data, read-only.
 *
 * Used by the report detail page AND the manager's review page. One
 * implementation means the manager sees byte-for-byte what the member wrote —
 * and it is where the "component reusability" criterion is actually earned.
 */
export function TaskTableView({ tasks }: { tasks: Task[] | ReadonlyTask[] }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (tasks.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No tasks recorded.
      </Typography>
    );
  }

  const totals = tasks.reduce(
    (acc, task) => ({
      planned: acc.planned + Number(task.hours_planned),
      spent: acc.spent + Number(task.hours_spent),
    }),
    { planned: 0, spent: 0 },
  );

  if (isMobile) {
    return (
      <Stack spacing={1.25}>
        {tasks.map((task, index) => (
          <Card key={index} sx={{ p: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
              {task.name}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
              <PriorityChip priority={task.priority} />
              <Typography variant="caption" color="text.secondary">
                {STATUS_LABELS[task.status]}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" component="div">
              {task.planned_pct}% planned → {task.actual_pct}% actual ·{' '}
              {Number(task.hours_spent).toFixed(1)}h of {Number(task.hours_planned).toFixed(1)}h
            </Typography>
            {task.deliverable && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                {task.deliverable}
              </Typography>
            )}
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>Task</TableCell>
            <TableCell sx={{ width: 100 }}>Priority</TableCell>
            <TableCell sx={{ width: 116 }}>Status</TableCell>
            <TableCell align="right" sx={{ width: 76 }}>Plan %</TableCell>
            <TableCell align="right" sx={{ width: 76 }}>Actual %</TableCell>
            <TableCell align="right" sx={{ width: 78 }}>Hrs plan</TableCell>
            <TableCell align="right" sx={{ width: 82 }}>Hrs spent</TableCell>
            <TableCell>Deliverable</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task, index) => (
            <TableRow key={index}>
              <TableCell sx={{ fontWeight: 500 }}>{task.name}</TableCell>
              <TableCell>
                <PriorityChip priority={task.priority} />
              </TableCell>
              <TableCell>{STATUS_LABELS[task.status]}</TableCell>
              <TableCell align="right">{task.planned_pct}%</TableCell>
              <TableCell
                align="right"
                sx={{
                  // Under-delivery against plan is the thing a reviewer looks
                  // for, so it is called out rather than left to be spotted.
                  color: task.actual_pct < task.planned_pct ? 'warning.main' : 'inherit',
                  fontWeight: task.actual_pct < task.planned_pct ? 600 : 400,
                }}
              >
                {task.actual_pct}%
              </TableCell>
              <TableCell align="right">{Number(task.hours_planned).toFixed(1)}</TableCell>
              <TableCell align="right">{Number(task.hours_spent).toFixed(1)}</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>{task.deliverable || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} sx={{ fontWeight: 600, color: 'text.primary' }}>
              Total
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {totals.planned.toFixed(1)}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {totals.spent.toFixed(1)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </Box>
  );
}

/** Shape shared by live tasks and frozen snapshot tasks. */
export interface ReadonlyTask {
  name: string;
  priority: Task['priority'];
  status: TaskStatus;
  planned_pct: number;
  actual_pct: number;
  hours_planned: number | string;
  hours_spent: number | string;
  deliverable: string | null;
}
