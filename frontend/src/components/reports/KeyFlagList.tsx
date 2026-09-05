import {
  Box, Button, Card, Checkbox, FormControlLabel, IconButton, MenuItem, Radio,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { Controller, useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';

import { BLOCKER_SEVERITIES } from '../../types';
import type { ReportFormValues } from '../../pages/reports/reportForm';

/**
 * Blockers and achievements are the same interaction: a list where exactly one
 * item can be starred as "the key one for this week". One component, two
 * instances — rather than two near-identical files that drift apart.
 *
 * The star behaves as a RADIO, not a checkbox: selecting one clears the rest.
 * That makes the "only one" rule unbreakable in the UI rather than something
 * the user can violate and then be told off for.
 */
export function KeyFlagList({
  control,
  register,
  name,
  itemLabel,
  keyLabel,
  placeholder,
  withSeverity = false,
  withResolved = false,
}: {
  control: Control<ReportFormValues>;
  register: UseFormRegister<ReportFormValues>;
  name: 'blockers' | 'achievements';
  itemLabel: string;
  keyLabel: string;
  placeholder: string;
  withSeverity?: boolean;
  withResolved?: boolean;
}) {
  const { fields, append, remove, update } = useFieldArray({ control, name });

  const setKey = (index: number, current: Record<string, unknown>[]) => {
    // Radio semantics: clear every other item's flag as we set this one.
    current.forEach((item, i) => {
      if (i !== index && item.is_key) update(i, { ...item, is_key: false } as never);
    });
    update(index, { ...current[index], is_key: true } as never);
  };

  return (
    <Stack spacing={1.5}>
      {fields.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Nothing recorded for this week.
        </Typography>
      )}

      {fields.map((field, index) => (
        <Card key={field.id} sx={{ p: 1.75 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
            <Controller
              name={`${name}.${index}.is_key`}
              control={control}
              render={({ field: keyField }) => (
                <Tooltip title={keyLabel}>
                  <Radio
                    checked={Boolean(keyField.value)}
                    onChange={() => {
                      const values = control._formValues[name] as Record<string, unknown>[];
                      setKey(index, values);
                    }}
                    icon={<StarBorderIcon />}
                    checkedIcon={<StarIcon />}
                    sx={{ mt: -0.5, color: 'warning.main', '&.Mui-checked': { color: 'warning.main' } }}
                    // MUI v9: inputProps -> slotProps.input
                    slotProps={{ input: { 'aria-label': keyLabel } }}
                  />
                </Tooltip>
              )}
            />

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <TextField
                {...register(`${name}.${index}.description`)}
                placeholder={placeholder}
                multiline
                minRows={1}
                maxRows={4}
                fullWidth
              />

              {(withSeverity || withResolved) && (
                <Stack direction="row" spacing={2} sx={{ mt: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
                  {withSeverity && (
                    <Controller
                      name={`blockers.${index}.severity`}
                      control={control}
                      render={({ field: f }) => (
                        <TextField {...f} select label="Severity" sx={{ width: 140 }}>
                          {BLOCKER_SEVERITIES.map((s) => (
                            <MenuItem key={s} value={s}>
                              {s.charAt(0) + s.slice(1).toLowerCase()}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                    />
                  )}
                  {withResolved && (
                    <Controller
                      name={`blockers.${index}.is_resolved`}
                      control={control}
                      render={({ field: f }) => (
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={Boolean(f.value)}
                              onChange={(e) => f.onChange(e.target.checked)}
                              size="small"
                            />
                          }
                          label="Resolved"
                          slotProps={{ typography: { variant: 'body2' } }}
                        />
                      )}
                    />
                  )}
                </Stack>
              )}
            </Box>

            <IconButton
              size="small"
              onClick={() => remove(index)}
              aria-label={`Remove ${itemLabel.toLowerCase()}`}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Card>
      ))}

      <Box>
        <Button
          startIcon={<AddIcon />}
          onClick={() =>
            append(
              (name === 'blockers'
                ? { description: '', severity: 'MEDIUM', is_key: false, is_resolved: false }
                : { description: '', is_key: false }) as never,
            )
          }
        >
          Add {itemLabel.toLowerCase()}
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
          Star one as {keyLabel.toLowerCase()}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Read-only rendering, shared by the detail and review pages. */
export function KeyFlagListView({
  items,
  emptyText,
}: {
  items: Array<{ description: string; is_key: boolean; severity?: string; is_resolved?: boolean }>;
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyText}
      </Typography>
    );
  }

  // The key item first — it is the one the reader is looking for.
  const ordered = [...items].sort((a, b) => Number(b.is_key) - Number(a.is_key));

  return (
    <Stack spacing={1}>
      {ordered.map((item, index) => (
        <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ color: item.is_key ? 'warning.main' : 'text.disabled', mt: 0.15 }}>
            {item.is_key ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: item.is_key ? 600 : 400 }}>
              {item.description}
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 0.25 }}>
              {item.severity && (
                <Typography variant="caption" color="text.secondary">
                  {item.severity.charAt(0) + item.severity.slice(1).toLowerCase()} severity
                </Typography>
              )}
              {item.is_resolved && (
                <Typography variant="caption" color="success.main">
                  Resolved
                </Typography>
              )}
            </Stack>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
