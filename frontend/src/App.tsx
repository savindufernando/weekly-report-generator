import {
  Alert, Box, Button, Chip, Container, Paper, Stack, Typography,
} from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useQuery } from '@tanstack/react-query';

import { api, ApiError } from './services/api';
import { useThemeMode } from './contexts/ThemeModeContext';
import { STATUS_COLORS, STATUS_ORDER } from './theme/theme';

interface Health {
  status: string;
  database: string;
  environment: string;
  version: string;
}

/** http://host/api/v1 -> http://host/health */
const HEALTH_URL = new URL('/health', import.meta.env.VITE_API_BASE_URL).toString();

/**
 * Phase 1 scaffold check. Replaced by the router in the next step — it exists to
 * prove the frontend, the API and the database are actually wired together.
 */
export default function App() {
  const { mode, toggle } = useThemeMode();

  const health = useQuery({
    queryKey: ['health'],
    // /health sits outside /api/v1, so address it absolutely rather than
    // relying on the browser to normalise "../.." out of the base URL.
    queryFn: async () => (await api.get<Health>(HEALTH_URL)).data,
  });

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Stack spacing={3}>
        {/* MUI v9 removed top-level system props — layout goes through sx. */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h5">Weekly Report Generator</Typography>
            <Typography variant="body2" color="text.secondary">
              Phase 1 — scaffold
            </Typography>
          </Box>
          <Button
            onClick={toggle}
            startIcon={mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            size="small"
            variant="outlined"
          >
            {mode === 'light' ? 'Dark' : 'Light'}
          </Button>
        </Box>

        <Paper sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" gutterBottom>
            Backend connectivity
          </Typography>

          {health.isPending && (
            <Typography variant="body2" color="text.secondary">
              Checking…
            </Typography>
          )}

          {health.isError && (
            <Alert severity="error">
              {(health.error as ApiError).detail}
              <Box component="div" sx={{ mt: 1 }}>
                <Button size="small" onClick={() => health.refetch()}>
                  Retry
                </Button>
              </Box>
            </Alert>
          )}

          {health.data && (
            <Stack spacing={1}>
              <Alert severity={health.data.database === 'up' ? 'success' : 'warning'}>
                API {health.data.status} · database {health.data.database}
              </Alert>
              <Typography variant="caption" color="text.secondary">
                environment {health.data.environment} · version {health.data.version}
              </Typography>
            </Stack>
          )}
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" gutterBottom>
            Status palette
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Display order is the colour-vision-validated stacking order.
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {STATUS_ORDER.map((s) => (
              <Chip
                key={s}
                label={s.replace('_', ' ').toLowerCase()}
                size="small"
                sx={{
                  bgcolor: STATUS_COLORS[s],
                  color: s === 'NEEDS_CORRECTION' ? '#1a1a19' : '#fff',
                  fontWeight: 500,
                }}
              />
            ))}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
