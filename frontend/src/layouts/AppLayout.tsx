import {
  AppBar, Avatar, Box, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ArticleIcon from '@mui/icons-material/Article';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import FolderIcon from '@mui/icons-material/Folder';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { useThemeMode } from '../contexts/ThemeModeContext';
import type { PermissionCode } from '../types';

const DRAWER_WIDTH = 232;

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactElement;
  /** Omitted means "everyone signed in". */
  permission?: PermissionCode;
}

/**
 * One manifest drives the sidebar. A new page appears in the right people's
 * navigation by declaring a permission code — no role names in components.
 */
const NAV: NavItem[] = [
  { label: 'My Reports', to: '/reports', icon: <ArticleIcon /> },
  { label: 'Team Dashboard', to: '/dashboard', icon: <DashboardIcon />, permission: 'dashboard.view' },
  { label: 'Review Queue', to: '/review', icon: <FactCheckIcon />, permission: 'report.review' },
  { label: 'Projects', to: '/projects', icon: <FolderIcon />, permission: 'project.manage' },
  { label: 'Users', to: '/admin/users', icon: <AdminPanelSettingsIcon />, permission: 'user.manage_roles' },
];

export function AppLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const { user, logout, can } = useAuth();
  const { mode, toggle } = useThemeMode();
  const navigate = useNavigate();

  const visible = NAV.filter((item) => !item.permission || can(item.permission));

  const handleLogout = async () => {
    setMenuAnchor(null);
    await logout();
    navigate('/login', { replace: true });
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ px: 2.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
          Weekly Reports
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1, py: 1.5, flex: 1 }}>
        {visible.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            onClick={() => isMobile && setDrawerOpen(false)}
            sx={{
              borderRadius: 1.5,
              mb: 0.25,
              '&.active': {
                bgcolor: 'action.selected',
                color: 'primary.main',
                '& .MuiListItemIcon-root': { color: 'primary.main' },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
            <ListItemText
              primary={item.label}
              // MUI v9: *TypographyProps were replaced by slotProps, and the
              // slot takes real TypographyProps — so styling goes through sx.
              slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 500 } } }}
            />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          {user?.role.name}
        </Typography>
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
        }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ flex: 1 }} />

          <Tooltip title={mode === 'light' ? 'Dark mode' : 'Light mode'}>
            <IconButton onClick={toggle} size="small">
              {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>

          <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ ml: 1 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
              {user?.full_name?.[0]?.toUpperCase()}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {user?.full_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
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
        </Toolbar>
      </AppBar>

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
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          px: { xs: 2, sm: 3 },
          py: 3,
          mt: 8,
          minWidth: 0,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
