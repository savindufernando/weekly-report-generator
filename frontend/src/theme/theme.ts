import { createTheme, type PaletteMode, type Theme } from '@mui/material/styles';

/**
 * Report status colours.
 *
 * These are a reserved STATUS palette, never reused as chart series colours.
 * The order below is also the stacking order in the status-by-member chart and
 * it is not cosmetic: placing APPROVED (green) next to NOT_STARTED (red) puts
 * those two at deltaE 4.1 under deuteranopia, which ~8% of men cannot separate.
 * Keeping draft/submitted/needs-correction between them raises the worst
 * adjacent pair to deltaE 9.1, above the >=8 threshold, in both themes.
 *
 * Colour never carries meaning alone — StatusChip always renders a text label.
 */
export const STATUS_COLORS = {
  NOT_STARTED: '#d03b3b',
  DRAFT: '#898781',
  SUBMITTED: '#2a78d6',
  NEEDS_CORRECTION: '#fab219',
  APPROVED: '#0ca30c',
} as const;

/** Stacking / display order — see note above. */
export const STATUS_ORDER = [
  'NOT_STARTED',
  'DRAFT',
  'SUBMITTED',
  'NEEDS_CORRECTION',
  'APPROVED',
] as const;

/**
 * Categorical palette for project/series identity — a different job from
 * status, so a different set. Assigned in fixed slot order and never cycled:
 * a ninth project folds into "Other" rather than reusing slot 1, so colour
 * follows the entity and filtering never repaints the survivors.
 */
export const SERIES_COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
] as const;

export const buildTheme = (mode: PaletteMode): Theme =>
  createTheme({
    palette: {
      mode,
      primary: { main: mode === 'light' ? '#1d5e5c' : '#4fb3ad' },
      secondary: { main: '#4a3aa7' },
      success: { main: STATUS_COLORS.APPROVED },
      warning: { main: STATUS_COLORS.NEEDS_CORRECTION },
      info: { main: STATUS_COLORS.SUBMITTED },
      error: { main: STATUS_COLORS.NOT_STARTED },
      background: {
        default: mode === 'light' ? '#f4f5f2' : '#101315',
        paper: mode === 'light' ? '#ffffff' : '#171b1e',
      },
      divider: mode === 'light' ? '#dcded8' : '#262b2e',
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
      h4: { fontWeight: 700, letterSpacing: '-0.01em' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600 },
      subtitle1: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 500 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            border: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiTableCell: {
        styleOverrides: {
          // Digits in columns must line up.
          root: { fontVariantNumeric: 'tabular-nums' },
        },
      },
    },
  });
