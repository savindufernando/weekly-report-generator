import { Box, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        px: 2,
        py: 4,
      }}
    >
      <Container maxWidth="xs" disableGutters>
        <Stack spacing={2.5}>
          <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <AssignmentTurnedInIcon />
            </Box>
            <Typography variant="h6">Weekly Report Generator</Typography>
            <Typography variant="body2" color="text.secondary">
              Team reporting and review
            </Typography>
          </Stack>

          <Card>
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
              <Outlet />
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
