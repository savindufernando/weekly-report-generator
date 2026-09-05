import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert, Box, Button, Chip, Divider, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SendIcon from '@mui/icons-material/Send';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ConfirmDialog, ErrorState, LoadingState, PageHeader, SectionCard, StatusChip,
} from '../../components/common';
import { HoursBreakdownEditor } from '../../components/reports/HoursBreakdown';
import { KeyFlagList } from '../../components/reports/KeyFlagList';
import { ReviewCommentBanner } from '../../components/reports/ReviewCommentBanner';
import { TaskTableEditor } from '../../components/reports/TaskTable';
import { useSnackbar } from '../../contexts/SnackbarContext';
import {
  useProjects, useReport, useSubmitReport, useUpdateReport,
} from '../../hooks/useReports';
import { TASK_PRIORITIES } from '../../types';
import { formatWeek, relativeTime } from '../../utils/week';
import { reportFormSchema, toFormValues, toRequestBody, type ReportFormValues } from './reportForm';

const AUTOSAVE_DELAY_MS = 3000;

export default function ReportEditorPage() {
  const { reportId } = useParams();
  const id = Number(reportId);
  const navigate = useNavigate();
  const { notify } = useSnackbar();

  const { data: report, isPending, error, refetch } = useReport(id);
  const { data: projects = [] } = useProjects();
  const updateReport = useUpdateReport(id);
  const submitReport = useSubmitReport(id);

  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    // Values arrive asynchronously; reset() below populates them.
    defaultValues: {
      project_id: 0, notes: '', links: [], tasks: [],
      next_week_tasks: [], blockers: [], achievements: [], hours_by_type: {},
    },
  });
  const { control, register, handleSubmit, reset, formState, watch, getValues } = form;
  const { isDirty, errors } = formState;

  const nextWeek = useFieldArray({ control, name: 'next_week_tasks' });
  const links = useFieldArray({ control, name: 'links' });

  const isEditable = report?.is_editable ?? false;

  // Populate the form once the report arrives.
  useEffect(() => {
    if (report) reset(toFormValues(report));
  }, [report, reset]);

  const save = useCallback(
    async (silent = true) => {
      if (!report?.is_editable) return;
      try {
        await updateReport.mutateAsync(toRequestBody(getValues()));
        setSavedAt(new Date().toISOString());
        reset(getValues(), { keepValues: true });  // clears isDirty, keeps input
        if (!silent) notify('Draft saved', 'success');
      } catch {
        if (!silent) notify('Could not save the draft', 'error');
      }
    },
    [report, updateReport, getValues, reset, notify],
  );

  // Debounced autosave. Losing a week of typed-up work to a stray navigation
  // is the worst possible failure for this page.
  useEffect(() => {
    if (!isEditable) return;
    const subscription = watch(() => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => void save(true), AUTOSAVE_DELAY_MS);
    });
    return () => {
      subscription.unsubscribe();
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [watch, save, isEditable]);

  // Native browser guard for tab close / reload, which React Router cannot see.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  if (isPending) return <LoadingState variant="page" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!report) return null;

  const onSubmitForReview = async () => {
    setConfirmSubmit(false);
    // Flush any pending edits before submitting, or the snapshot would freeze
    // the last autosaved state rather than what is on screen.
    if (isDirty) await save(true);
    try {
      await submitReport.mutateAsync();
      navigate(`/reports/${id}`);
    } catch {
      /* the hook surfaces the error */
    }
  };

  const taskCount = watch('tasks')?.length ?? 0;

  return (
    <Box component="form" onSubmit={handleSubmit(() => setConfirmSubmit(true))} noValidate>
      <PageHeader
        title={`Week of ${formatWeek(report.week_start)}`}
        breadcrumbs={[{ label: 'My Reports', to: '/reports' }, { label: 'Edit' }]}
        chip={<StatusChip status={report.status} />}
        subtitle={
          savedAt
            ? `Saved ${relativeTime(savedAt)}`
            : isEditable
              ? 'Changes save automatically'
              : undefined
        }
        actions={
          isEditable && (
            <>
              <Button onClick={() => void save(false)} disabled={updateReport.isPending}>
                Save draft
              </Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={<SendIcon />}
                disabled={submitReport.isPending}
              >
                Submit for review
              </Button>
            </>
          )
        }
      />

      {/* The brief requires the member to see the manager's comment clearly on
          their report page — so it sits above the form, not below it. */}
      {report.latest_review && report.status === 'NEEDS_CORRECTION' && (
        <ReviewCommentBanner review={report.latest_review} />
      )}

      {!isEditable && (
        <Alert severity="info" sx={{ mb: 3 }}>
          This report is {report.status.replace('_', ' ').toLowerCase()} and can no longer be
          edited.{' '}
          <Button size="small" onClick={() => navigate(`/reports/${id}`)}>
            View it
          </Button>
        </Alert>
      )}

      <Stack spacing={2.5} sx={{ opacity: isEditable ? 1 : 0.6, pointerEvents: isEditable ? 'auto' : 'none' }}>
        {/* 1 — week and project */}
        <SectionCard title="Week & project" subtitle="The week is fixed once the report is created">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Week"
              value={formatWeek(report.week_start)}
              disabled
              sx={{ maxWidth: 260 }}
            />
            <Controller
              name="project_id"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Project"
                  error={Boolean(errors.project_id)}
                  helperText={errors.project_id?.message}
                  sx={{ maxWidth: 300 }}
                >
                  {projects.map((project) => (
                    <MenuItem key={project.id} value={project.id}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Box
                          sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: project.color }}
                        />
                        {project.name}
                      </Stack>
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Stack>
        </SectionCard>

        {/* 2 — tasks completed */}
        <SectionCard
          title="Tasks completed"
          subtitle="What you worked on this week"
          action={<Chip size="small" label={`${taskCount} task${taskCount === 1 ? '' : 's'}`} />}
        >
          <TaskTableEditor control={control} register={register} errors={errors} />
          {taskCount === 0 && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              At least one task is needed before you can submit.
            </Alert>
          )}
        </SectionCard>

        {/* 3 — next week */}
        <SectionCard title="Planned for next week">
          <Stack spacing={1.25}>
            {nextWeek.fields.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Nothing planned yet.
              </Typography>
            )}
            {nextWeek.fields.map((field, index) => (
              <Stack key={field.id} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  {...register(`next_week_tasks.${index}.description`)}
                  placeholder="What is planned?"
                  fullWidth
                />
                <Controller
                  name={`next_week_tasks.${index}.priority`}
                  control={control}
                  render={({ field: f }) => (
                    <TextField {...f} select sx={{ width: 140, flexShrink: 0 }}>
                      {TASK_PRIORITIES.map((p) => (
                        <MenuItem key={p} value={p}>
                          {p.charAt(0) + p.slice(1).toLowerCase()}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
                <IconButton size="small" onClick={() => nextWeek.remove(index)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Box>
              <Button
                startIcon={<AddIcon />}
                onClick={() => nextWeek.append({ description: '', priority: 'MEDIUM' })}
              >
                Add planned task
              </Button>
            </Box>
          </Stack>
        </SectionCard>

        {/* 4 — blockers */}
        <SectionCard
          title="Blockers & challenges"
          subtitle="Star the one that mattered most this week"
        >
          <KeyFlagList
            control={control}
            register={register}
            name="blockers"
            itemLabel="Blocker"
            keyLabel="Key issue of the week"
            placeholder="What slowed you down, and who is it blocked on?"
            withSeverity
            withResolved
          />
          {errors.blockers?.root && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {errors.blockers.root.message}
            </Alert>
          )}
        </SectionCard>

        {/* 5 — achievements */}
        <SectionCard title="Achievements & highlights" subtitle="Star your key achievement">
          <KeyFlagList
            control={control}
            register={register}
            name="achievements"
            itemLabel="Achievement"
            keyLabel="Key achievement of the week"
            placeholder="What went well?"
          />
          {errors.achievements?.root && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {errors.achievements.root.message}
            </Alert>
          )}
        </SectionCard>

        {/* 6 — hours */}
        <SectionCard title="Hours by task type" subtitle="Optional, but it feeds the team charts">
          <HoursBreakdownEditor control={control} register={register} />
        </SectionCard>

        {/* 7 — notes and links */}
        <SectionCard title="Notes & links" subtitle="Optional context for your manager">
          <Stack spacing={2}>
            <TextField
              {...register('notes')}
              label="Notes"
              multiline
              minRows={3}
              placeholder="Anything else worth knowing about this week"
            />
            <Divider />
            {links.fields.map((field, index) => (
              <Stack key={field.id} direction="row" spacing={1.5}>
                <TextField
                  {...register(`links.${index}.label`)}
                  placeholder="Label, e.g. PR #482"
                  sx={{ width: 220, flexShrink: 0 }}
                />
                <TextField {...register(`links.${index}.url`)} placeholder="https://…" fullWidth />
                <IconButton size="small" onClick={() => links.remove(index)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Box>
              <Button
                startIcon={<AddIcon />}
                onClick={() => links.append({ label: '', url: '' })}
              >
                Add link
              </Button>
            </Box>
          </Stack>
        </SectionCard>
      </Stack>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit for review?"
        description={
          <>
            Your manager will be able to review this report. You will not be able to edit it
            again unless they send it back for correction.
            {report.submission_count > 0 && (
              <Box sx={{ mt: 1.5 }}>
                This will create version {report.current_version_no + 1}. Earlier versions stay
                visible to your manager.
              </Box>
            )}
          </>
        }
        confirmLabel="Submit"
        isPending={submitReport.isPending}
        onConfirm={onSubmitForReview}
        onCancel={() => setConfirmSubmit(false)}
      />
    </Box>
  );
}
