import { Box, Stack, Typography } from '@mui/material';
import { Outlet } from 'react-router-dom';

import { MONO, STATUS_COLORS } from '../theme/theme';

/**
 * Split layout: the left panel carries the product's actual subject matter —
 * the four workflow states, named — rather than a decorative logo badge. It
 * tells a first-time viewer what this tool does before they sign in.
 *
 * Below `md` the panel is dropped entirely rather than stacked; on a phone it
 * would just be a wall of text above the form.
 */

const WORKFLOW = [
  { code: 'DRAFT', label: 'Being written', color: STATUS_COLORS.DRAFT },
  { code: 'SUBMITTED', label: 'Awaiting review', color: STATUS_COLORS.SUBMITTED },
  { code: 'NEEDS_CORRECTION', label: 'Sent back with comments', color: STATUS_COLORS.NEEDS_CORRECTION },
  { code: 'APPROVED', label: 'Signed off', color: STATUS_COLORS.APPROVED },
];

export function AuthLayout() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(340px, 44%) 1fr' },
        bgcolor: 'background.default',
      }}
    >
      {/* ---------------------------------------------------- context panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          bgcolor: (t) => (t.palette.mode === 'dark' ? '#0d1013' : '#14181c'),
          color: '#e8ebee',
          px: 6,
          py: 5,
          borderRight: '1px solid',
          borderColor: (t) => (t.palette.mode === 'dark' ? '#1f242a' : 'transparent'),
        }}
      >
        <Typography
          sx={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.14em', color: '#8e959e' }}
        >
          WEEKLY&nbsp;REPORTS
        </Typography>

        <Box sx={{ maxWidth: 380 }}>
          <Typography
            sx={{
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: '-0.024em',
              lineHeight: 1.2,
              mb: 1.5,
              textWrap: 'balance',
            }}
          >
            Every week, on the record.
          </Typography>
          <Typography sx={{ fontSize: 15, lineHeight: 1.6, color: '#8e959e', mb: 5 }}>
            Team members file a structured report. Managers review it, send it back with
            comments, and approve it. Every version is kept.
          </Typography>

          {/* The four states, as the product's actual vocabulary. */}
          <Stack spacing={0}>
            {WORKFLOW.map((state, index) => (
              <Box
                key={state.code}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '10px 1fr',
                  gap: 2,
                  alignItems: 'start',
                  pb: index === WORKFLOW.length - 1 ? 0 : 2.5,
                  position: 'relative',
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                  <Box
                    sx={{
                      width: 9, height: 9, borderRadius: '50%',
                      bgcolor: state.color, flexShrink: 0, mt: '5px',
                    }}
                  />
                  {index < WORKFLOW.length - 1 && (
                    <Box sx={{ width: 1, flex: 1, bgcolor: '#252b31', mt: 0.75 }} />
                  )}
                </Box>
                <Box sx={{ pb: 0.5 }}>
                  <Typography
                    sx={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.04em', color: '#e8ebee' }}
                  >
                    {state.code}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: '#6b737d' }}>{state.label}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>

        <Typography sx={{ fontFamily: MONO, fontSize: 11, color: '#4d545c' }}>
          FastAPI · React · MySQL
        </Typography>
      </Box>

      {/* ------------------------------------------------------------- form */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: { xs: 'center', md: 'flex-start' },
          px: { xs: 3, sm: 6, md: 8, lg: 10 },
          py: 6,
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
