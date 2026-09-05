import { Box, Breadcrumbs, Link, Stack, Typography } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  chip,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  chip?: ReactNode;
}) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs
          separator={<NavigateNextIcon fontSize="small" />}
          sx={{ mb: 1, fontSize: 13 }}
        >
          {breadcrumbs.map((crumb) =>
            crumb.to ? (
              <Link
                key={crumb.label}
                component={RouterLink}
                to={crumb.to}
                underline="hover"
                color="inherit"
              >
                {crumb.label}
              </Link>
            ) : (
              <Typography key={crumb.label} variant="body2" color="text.primary">
                {crumb.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'flex-start' }, justifyContent: 'space-between' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h5" component="h1">
              {title}
            </Typography>
            {chip}
          </Stack>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
