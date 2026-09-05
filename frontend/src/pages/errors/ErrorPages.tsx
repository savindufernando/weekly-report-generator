import { Box, Button, Stack, Typography } from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import { Link as RouterLink } from 'react-router-dom';

function ErrorShell({
  icon,
  code,
  title,
  description,
}: {
  icon: React.ReactNode;
  code: string;
  title: string;
  description: string;
}) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '70vh', px: 2 }}>
      <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', maxWidth: 420 }}>
        <Box sx={{ fontSize: 56, color: 'text.disabled', display: 'flex' }}>{icon}</Box>
        <Typography variant="overline" color="text.secondary">
          {code}
        </Typography>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
        <Button component={RouterLink} to="/" variant="contained" sx={{ mt: 1 }}>
          Back to the app
        </Button>
      </Stack>
    </Box>
  );
}

export function NotFoundPage() {
  return (
    <ErrorShell
      icon={<SearchOffIcon fontSize="inherit" />}
      code="404"
      title="Page not found"
      description="That page does not exist, or you do not have access to it."
    />
  );
}

export function ForbiddenPage() {
  return (
    <ErrorShell
      icon={<BlockIcon fontSize="inherit" />}
      code="403"
      title="You do not have access"
      description="Your role does not include permission for this page. Ask an admin if you think that is wrong."
    />
  );
}
