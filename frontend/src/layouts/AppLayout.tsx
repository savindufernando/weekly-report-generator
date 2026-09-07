import {
  AppBar, Avatar, Box, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ArticleIcon from '@mui/icons-material/ArticleOutlined';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import DashboardIcon from '@mui/icons-material/DashboardOutlined';
import FactCheckIcon from '@mui/icons-material/FactCheckOutlined';
import FolderIcon from '@mui/icons-material/FolderOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { useThemeMode } from '../contexts/ThemeModeContext';
import { MONO } from '../theme/theme';
import type { PermissionCode } from '../types';

const DRAWER_WIDTH = 224;

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactElement;
  /** Omitted means "everyone signed in". */
  permission?: PermissionCode;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * One manifest drives the sidebar. A page appears in the right people's
 * navigation by declaring a permission code — no role names in components.
 *
 * Grouping also encodes something true: the first section is your own work,
 * the second is work you do on behalf of the team.
 */
const NAV: NavSection[] = [
  {
    label: 'Personal',
    items: [{ label: 'My Reports', to: '/reports', icon: <ArticleIcon /> }],
  },
  {
    label: 'Team',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: <DashboardIcon />, permission: 'dashboard.view' },
      { label: 'Review Queue', to: '/review', icon: <FactCheckIcon />, permission: 'report.review' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Projects', to: '/projects', icon: <FolderIcon />, permission: 'project.manage' },
      { label: 'Users', to: '/admin/users', icon: <AdminPanelSettingsIcon />, permission: 'user.manage_roles' },
    ],
  },
];

export function AppLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const { user, logout, can } = useAuth();
  const { mode, toggle } = useThemeMode();
  const navigate = useNavigate();

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((section) => section.items.length > 0);

  const handleLogout = async () => {
    setMenuAnchor(null);
    await logout();
    navigate('/login', { replace: true });
  };

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 2.5, height: 57, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Typography
          sx={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.02em' }}
        >
          weekly&#8203;-reports
        </Typography>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5 }}>
        {sections.map((section) => (
          <Box key={section.label} sx={{ mb: 1.5 }}>
            {/* Section labels use the mono field-label idiom. */}
            <Typography variant="overline" sx={{ px: 2.5, color: 'text.disabled', display: 'block', mb: 0.5 }}>
              {section.label}
            </Typography>
            <List disablePadding sx={{ px: 1 }}>
              {section.items.map((item) => (
                <ListItemButton
                  key={item.to}
                  component={NavLink}
                  to={item.to}
                  onClick={() => isMobile && setDrawerOpen(false)}
                  sx={{
                    borderRadius: 1.5,
                    minHeight: 34,
                    px: 1.5,
                    mb: 0.125,
                    color: 'text.secondary',
                    '& .MuiListItemIcon-root': { minWidth: 30, color: 'inherit' },
                    '& svg': { fontSize: 18 },
                    '&:hover': { color: 'text.primary' },
                    '&.active': {
                      bgcolor: 'action.selected',
                      color: 'text.primary',
                      fontWeight: 600,
                    },
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    slotProps={{ primary: { sx: { fontSize: 13.5, fontWeight: 'inherit' } } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
        ))}
      </Box>

      <Divider />
      <Box sx={{ p: 1.5, flexShrink: 0 }}>
        <Box
          component="button"
          type="button"
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.25, width: '100%',
            border: 0, background: 'transparent', cursor: 'pointer',
            p: 1, borderRadius: 1.5, textAlign: 'left',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: 'text.primary', color: 'background.paper' }}>
            {user?.full_name?.[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 500, lineHeight: 1.3 }}>
              {user?.full_name}
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.secondary' }}>
              {user?.role.code}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        elevation={0}
        color="inherit"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Toolbar sx={{ minHeight: '57px !important' }}>
          {isMobile && (
            <IconButton edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title={mode === 'light' ? 'Dark mode' : 'Light mode'}>
            <IconButton onClick={toggle} size="small">
              {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { minWidth: 208 } } }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {user?.full_name}
          </Typography>
          <Typography sx={{ fontFamily: MONO, fontSize: 11.5, color: 'text.secondary' }}>
            {user?.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            navigate('/settings');
          }}
        >
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}
          open={isMobile ? drawerOpen : true}
          onClose={() => setDrawerOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              borderRight: '1px solid',
              borderColor: 'divider',
              backgroundImage: 'none',
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          px: { xs: 2, sm: 3, lg: 4 },
          py: 3.5,
          mt: '57px',
          minWidth: 0,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
