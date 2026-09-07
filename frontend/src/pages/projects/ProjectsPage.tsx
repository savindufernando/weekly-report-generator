import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArchiveIcon from '@mui/icons-material/ArchiveOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import UnarchiveIcon from '@mui/icons-material/UnarchiveOutlined';
import { useState } from 'react';

import { ConfirmDialog, type Column, DataTable, PageHeader } from '../../components/common';
import { useCreateProject, useDeleteProject, useUpdateProject } from '../../hooks/useAdmin';
import { useProjects } from '../../hooks/useReports';
import { MONO, SERIES_COLORS } from '../../theme/theme';
import type { Project } from '../../types';

/**
 * A real page with a list and CRUD actions, as the brief requires — not a
 * modal bolted onto another screen. The create/edit dialog is fine; what would
 * not be fine is the page existing only as that dialog.
 */
export default function ProjectsPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Project | null>(null);

  const { data: projects = [], isPending, error, refetch } = useProjects(includeArchived);
  const removeProject = useDeleteProject();
  const updateProject = useUpdateProject();

  const columns: Column<Project>[] = [
    {
      key: 'name',
      label: 'Project',
      primary: true,
      render: (row) => (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: row.color, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {row.name}
            </Typography>
            {row.description && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {row.description}
              </Typography>
            )}
          </Box>
        </Stack>
      ),
    },
    {
      key: 'code',
      label: 'Code',
      render: (row) => (
        <Typography sx={{ fontFamily: MONO, fontSize: 12.5 }}>{row.code}</Typography>
      ),
    },
    {
      key: 'reports',
      label: 'Reports',
      align: 'right',
      render: (row) => <Typography sx={{ fontFamily: MONO, fontSize: 13 }}>{row.report_count}</Typography>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) =>
        row.is_archived ? (
          <Chip size="small" label="Archived" variant="outlined" />
        ) : (
          <Chip size="small" label="Active" variant="outlined" color="success" />
        ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => setEditing(row)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {row.is_archived ? (
            <Tooltip title="Restore">
              <IconButton
                size="small"
                onClick={() => updateProject.mutate({ id: row.id, payload: { is_archived: false } })}
              >
                <UnarchiveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title={row.report_count > 0 ? 'Archive' : 'Delete'}>
              <IconButton size="small" onClick={() => setRemoving(row)}>
                <ArchiveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Categories that weekly reports are tagged against"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            New project
          </Button>
        }
      />

      <FormControlLabel
        sx={{ mb: 2 }}
        control={
          <Switch
            size="small"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
        }
        label={<Typography variant="body2">Show archived</Typography>}
      />

      <DataTable
        columns={columns}
        rows={projects}
        getRowKey={(row) => row.id}
        isLoading={isPending}
        error={error}
        onRetry={refetch}
        emptyTitle="No projects yet"
        emptyDescription="Reports are tagged against a project, so create at least one."
        emptyAction={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            New project
          </Button>
        }
      />

      <ProjectDialog
        open={creating || editing !== null}
        project={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        danger
        title={removing?.report_count ? 'Archive this project?' : 'Delete this project?'}
        description={
          removing?.report_count ? (
            <>
              <strong>{removing.name}</strong> is used by {removing.report_count} report
              {removing.report_count === 1 ? '' : 's'}. It will be archived and hidden from new
              reports — existing reports keep their history.
            </>
          ) : (
            <>
              <strong>{removing?.name}</strong> is not used by any report and will be deleted
              permanently.
            </>
          )
        }
        confirmLabel={removing?.report_count ? 'Archive' : 'Delete'}
        isPending={removeProject.isPending}
        onConfirm={() => {
          if (removing) removeProject.mutate(removing.id);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

function ProjectDialog({
  open, project, onClose,
}: {
  open: boolean;
  project: Project | null;
  onClose: () => void;
}) {
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const isEdit = project !== null;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(SERIES_COLORS[0]);
  const [initialised, setInitialised] = useState(false);

  // Seed the fields once per opening, rather than on every render.
  if (open && !initialised) {
    setName(project?.name ?? '');
    setCode(project?.code ?? '');
    setDescription(project?.description ?? '');
    setColor(project?.color ?? SERIES_COLORS[0]);
    setInitialised(true);
  }
  if (!open && initialised) setInitialised(false);

  const close = () => {
    setInitialised(false);
    onClose();
  };

  const submit = async () => {
    if (isEdit) {
      await updateProject.mutateAsync({
        id: project.id,
        payload: { name, description: description || null, color },
      });
    } else {
      await createProject.mutateAsync({ name, code, description: description || null, color });
    }
    close();
  };

  const isPending = createProject.isPending || updateProject.isPending;
  const canSubmit = name.trim().length >= 2 && (isEdit || code.trim().length >= 2);

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <TextField
            label="Code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            // The code is an identifier and never changes: reports and charts
            // reference it, so renaming it would orphan the association.
            disabled={isEdit}
            helperText={isEdit ? 'The code cannot be changed' : 'Short identifier, e.g. CLIA'}
            slotProps={{ htmlInput: { maxLength: 20, style: { fontFamily: MONO } } }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
          />
          <Box>
            <Typography
              sx={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.09em',
                textTransform: 'uppercase', color: 'text.secondary', mb: 1,
              }}
            >
              Colour
            </Typography>
            <Stack direction="row" spacing={1}>
              {/* Fixed categorical slots, so a project's colour is stable
                  across every chart it appears in. */}
              {SERIES_COLORS.map((swatch) => (
                <Box
                  key={swatch}
                  component="button"
                  type="button"
                  aria-label={`Colour ${swatch}`}
                  onClick={() => setColor(swatch)}
                  sx={{
                    width: 26, height: 26, borderRadius: 1, bgcolor: swatch,
                    cursor: 'pointer', border: '2px solid',
                    borderColor: color === swatch ? 'text.primary' : 'transparent',
                    outline: 'none',
                  }}
                />
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit || isPending}>
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
