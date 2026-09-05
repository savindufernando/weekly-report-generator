import {
  Alert, Box, Button, Card, CardActionArea, Chip, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState, LoadingState, PageHeader } from '../../components/common';
import { useCreateReport, useProjects, useReports } from '../../hooks/useReports';
import { currentWeekStart, formatWeek, recentWeeks, shiftWeeks } from '../../utils/week';

/**
 * Choosing which week to report on.
 *
 * Weeks that already have a report are disabled rather than left clickable and
 * then rejected with a 409 — the unique (user, week) constraint surfaced as UX
 * instead of as an error message.
 */
export default function NewReportPage() {
  const navigate = useNavigate();
  const createReport = useCreateReport();

  const { data: projects = [], isPending: projectsLoading, error: projectsError } = useProjects();
  // Enough history to cover a catch-up, plus next week.
  const weeks = useMemo(() => [shiftWeeks(currentWeekStart(), 1), ...recentWeeks(8).reverse()], []);

  const { data: existing, isPending: reportsLoading } = useReports({
    from: weeks[weeks.length - 1],
    to: weeks[0],
    limit: 100,
  });

  const [selectedWeek, setSelectedWeek] = useState(currentWeekStart());
  const [projectId, setProjectId] = useState<number | ''>('');

  const takenWeeks = useMemo(
    () => new Set((existing?.items ?? []).map((report) => report.week_start)),
    [existing],
  );

  const activeProjects = projects.filter((project) => !project.is_archived);

  if (projectsLoading || reportsLoading) return <LoadingState variant="page" />;
  if (projectsError) return <ErrorState error={projectsError} />;

  const handleCreate = async () => {
    if (!projectId) return;
    const report = await createReport.mutateAsync({
      weekStart: selectedWeek,
      projectId: Number(projectId),
    });
    navigate(`/reports/${report.id}/edit`);
  };

  const canCreate = Boolean(projectId) && !takenWeeks.has(selectedWeek);

  return (
    <Box sx={{ maxWidth: 780 }}>
      <PageHeader
        title="New weekly report"
        breadcrumbs={[{ label: 'My Reports', to: '/reports' }, { label: 'New' }]}
        subtitle="Pick the week you are reporting on"
      />

      {activeProjects.length === 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          There are no active projects yet. Ask a manager to create one before filing a report.
        </Alert>
      )}

      <Stack spacing={3}>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Week
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 1.25,
            }}
          >
            {weeks.map((week) => {
              const taken = takenWeeks.has(week);
              const selected = week === selectedWeek;
              const isCurrent = week === currentWeekStart();

              return (
                <Card
                  key={week}
                  variant="outlined"
                  sx={{
                    borderColor: selected ? 'primary.main' : 'divider',
                    borderWidth: selected ? 2 : 1,
                    opacity: taken ? 0.55 : 1,
                  }}
                >
                  <CardActionArea
                    disabled={taken}
                    onClick={() => setSelectedWeek(week)}
                    sx={{ p: 1.5 }}
                  >
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatWeek(week)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {taken ? 'Already filed' : isCurrent ? 'This week' : ''}
                        </Typography>
                      </Box>
                      {selected && !taken && (
                        <CheckCircleIcon color="primary" fontSize="small" />
                      )}
                      {taken && <Chip size="small" label="Filed" />}
                    </Stack>
                  </CardActionArea>
                </Card>
              );
            })}
          </Box>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Project
          </Typography>
          <TextField
            select
            value={projectId}
            onChange={(event) => setProjectId(Number(event.target.value))}
            label="Primary project for this week"
            sx={{ maxWidth: 360 }}
            disabled={activeProjects.length === 0}
          >
            {activeProjects.map((project) => (
              <MenuItem key={project.id} value={project.id}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: project.color }} />
                  {project.name}
                </Stack>
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Individual tasks can be tagged to a different project later.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button variant="contained" disabled={!canCreate || createReport.isPending} onClick={handleCreate}>
            {createReport.isPending ? 'Creating…' : 'Create draft'}
          </Button>
          <Button onClick={() => navigate('/reports')}>Cancel</Button>
        </Stack>
      </Stack>
    </Box>
  );
}
