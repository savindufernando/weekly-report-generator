import { Alert, Box, Grid, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useWatch, type Control, type UseFormRegister } from 'react-hook-form';

import { TASK_TYPE_ORDER, type ReportFormValues } from '../../pages/reports/reportForm';
import type { TaskType } from '../../types';

const LABELS: Record<TaskType, string> = {
  DEVELOPMENT: 'Development',
  TESTING: 'Testing',
  MEETINGS: 'Meetings',
  DOCUMENTATION: 'Documentation',
  REVIEW: 'Code review',
  OTHER: 'Other',
};

const sum = (values: Record<string, string> | undefined) =>
  Object.values(values ?? {}).reduce((total, v) => total + (Number(v) || 0), 0);

export function HoursBreakdownEditor({
  control,
  register,
}: {
  control: Control<ReportFormValues>;
  register: UseFormRegister<ReportFormValues>;
}) {
  const hours = useWatch({ control, name: 'hours_by_type' });
  const tasks = useWatch({ control, name: 'tasks' });

  const total = sum(hours as Record<string, string>);
  const taskHours = (tasks ?? []).reduce(
    (acc, task) => acc + (Number(task?.hours_spent) || 0),
    0,
  );
  // A soft cross-check, not a validation rule: the two totals measure slightly
  // different things, so a gap is worth mentioning but never worth blocking on.
  const mismatch = total > 0 && taskHours > 0 && Math.abs(total - taskHours) > 2;

  return (
    <Box>
      <Grid container spacing={1.5}>
        {TASK_TYPE_ORDER.map((type) => (
          <Grid key={type} size={{ xs: 6, sm: 4, md: 2 }}>
            <TextField
              {...register(`hours_by_type.${type}`)}
              label={LABELS[type]}
              placeholder="0"
              slotProps={{
                htmlInput: { inputMode: 'decimal' },
                input: { endAdornment: <InputAdornment position="end">h</InputAdornment> },
              }}
            />
          </Grid>
        ))}
      </Grid>

      <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2">
          Total:{' '}
          <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {total.toFixed(1)}h
          </Box>
        </Typography>
        {taskHours > 0 && (
          <Typography variant="caption" color="text.secondary">
            Task rows add up to {taskHours.toFixed(1)}h
          </Typography>
        )}
      </Stack>

      {total > 168 && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          A week only has 168 hours.
        </Alert>
      )}
      {mismatch && total <= 168 && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          This breakdown differs from your task hours by{' '}
          {Math.abs(total - taskHours).toFixed(1)}h. That is fine if some work was not
          task-tracked — just worth a glance.
        </Alert>
      )}
    </Box>
  );
}

export function HoursBreakdownView({ hours }: { hours: Record<string, number | string> }) {
  const entries = TASK_TYPE_ORDER.map((type) => [type, Number(hours[type] ?? 0)] as const).filter(
    ([, value]) => value > 0,
  );

  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No hours breakdown recorded.
      </Typography>
    );
  }

  const total = entries.reduce((acc, [, value]) => acc + value, 0);

  return (
    <Stack spacing={1}>
      {entries.map(([type, value]) => (
        <Box key={type}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.4 }}>
            <Typography variant="body2">{LABELS[type as TaskType]}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {value.toFixed(1)}h
            </Typography>
          </Stack>
          {/* A plain proportion bar — no chart library needed for six rows. */}
          <Box sx={{ height: 5, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
            <Box
              sx={{
                height: '100%',
                width: `${(value / total) * 100}%`,
                bgcolor: 'primary.main',
                borderRadius: 1,
              }}
            />
          </Box>
        </Box>
      ))}
      <Stack direction="row" sx={{ justifyContent: 'space-between', pt: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Total
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {total.toFixed(1)}h
        </Typography>
      </Stack>
    </Stack>
  );
}
