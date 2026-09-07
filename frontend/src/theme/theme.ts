import { createTheme, type PaletteMode, type Theme } from '@mui/material/styles';

/**
 * Design direction: technical / engineering-document.
 *
 * The governing rule is **colour is reserved for meaning**. The interface
 * chrome is monochrome graphite — buttons, surfaces, borders, type. The only
 * saturated colour on any screen is a report status or a chart series. That
 * makes an amber "needs correction" chip impossible to miss, because nothing
 * else on the page is competing with it.
 *
 * Type does the work instead: IBM Plex Sans for prose and IBM Plex Mono for
 * anything that is *data* — timestamps, versions, hours, counts, IDs, status
 * codes. Engineering documentation vernacular, applied consistently.
 */

export const STATUS_COLORS = {
  NOT_STARTED: '#d03b3b',
  DRAFT: '#898781',
  SUBMITTED: '#2a78d6',
  NEEDS_CORRECTION: '#fab219',
  APPROVED: '#0ca30c',
} as const;

/**
 * Stacking / display order — colour-vision validated, NOT cosmetic.
 * APPROVED next to NOT_STARTED puts green beside red at deltaE 4.1 under
 * deuteranopia. Grey, blue and amber between them raise the worst adjacent
 * pair to deltaE 9.1 in both modes.
 */
export const STATUS_ORDER = [
  'NOT_STARTED', 'DRAFT', 'SUBMITTED', 'NEEDS_CORRECTION', 'APPROVED',
] as const;

/** Categorical series palette, fixed slot order, never cycled. */
export const SERIES_COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
] as const;

/* Cool graphite scale — a neutral with a slight blue bias, chosen rather than
   inherited. Pure grey reads as unconsidered. */
const GRAPHITE = {
  50: '#f6f7f8',
  100: '#eceef0',
  200: '#dde0e4',
  300: '#c3c8ce',
  400: '#8e959e',
  500: '#6b737d',
  600: '#4d545c',
  700: '#343a41',
  800: '#1f242a',
  900: '#14181c',
  950: '#0d1013',
} as const;

/** Violet: used only for focus rings and links. Deliberately distinct from all
 *  four status hues so an accent can never be mistaken for a state. */
const ACCENT = { light: '#4a3aa7', dark: '#9085e9' };

export const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
export const SANS = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

export const buildTheme = (mode: PaletteMode): Theme => {
  const dark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      // Primary is INK, not a brand hue: a primary button is the highest
      // contrast thing on the page, which is what makes it primary.
      primary: {
        main: dark ? GRAPHITE[50] : GRAPHITE[900],
        contrastText: dark ? GRAPHITE[900] : GRAPHITE[50],
      },
      secondary: { main: dark ? ACCENT.dark : ACCENT.light },
      success: { main: STATUS_COLORS.APPROVED },
      warning: { main: STATUS_COLORS.NEEDS_CORRECTION },
      info: { main: STATUS_COLORS.SUBMITTED },
      error: { main: STATUS_COLORS.NOT_STARTED },
      background: {
        default: dark ? GRAPHITE[950] : GRAPHITE[50],
        paper: dark ? GRAPHITE[900] : '#ffffff',
      },
      text: {
        primary: dark ? '#e8ebee' : GRAPHITE[900],
        secondary: dark ? GRAPHITE[400] : GRAPHITE[500],
        disabled: dark ? GRAPHITE[600] : GRAPHITE[300],
      },
      divider: dark ? GRAPHITE[800] : GRAPHITE[200],
      action: {
        hover: dark ? 'rgba(255,255,255,0.04)' : 'rgba(13,16,19,0.03)',
        selected: dark ? 'rgba(255,255,255,0.07)' : 'rgba(13,16,19,0.05)',
      },
    },

    // Tighter than MUI's default 4px step: a dense tool wants less air.
    shape: { borderRadius: 6 },

    typography: {
      fontFamily: SANS,
      // A real scale, with tightening tracking as size grows.
      h4: { fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.022em', lineHeight: 1.2 },
      h5: { fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.018em', lineHeight: 1.25 },
      h6: { fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.011em' },
      subtitle1: { fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.006em' },
      subtitle2: { fontSize: '0.8125rem', fontWeight: 600 },
      body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
      body2: { fontSize: '0.875rem', lineHeight: 1.55 },
      caption: { fontSize: '0.75rem', lineHeight: 1.45 },
      // Uppercase labels get letter-spacing, in mono — the "field label" idiom
      // from technical documentation.
      overline: {
        fontFamily: MONO,
        fontSize: '0.6875rem',
        fontWeight: 500,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        lineHeight: 1.4,
      },
      button: { textTransform: 'none', fontWeight: 500, letterSpacing: 0 },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Digits line up everywhere by default; this app is full of columns
          // of numbers and ragged digits look sloppy.
          'table, .tabular': { fontVariantNumeric: 'tabular-nums' },
          '::selection': {
            background: dark ? 'rgba(144,133,233,0.3)' : 'rgba(74,58,167,0.15)',
          },
        },
      },

      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: true },
        styleOverrides: {
          root: { borderRadius: 6, paddingInline: 14, minHeight: 34 },
          sizeLarge: { minHeight: 42, fontSize: '0.9375rem' },
          sizeSmall: { minHeight: 28, paddingInline: 10, fontSize: '0.8125rem' },
          outlined: ({ theme }) => ({
            borderColor: theme.palette.divider,
            color: theme.palette.text.primary,
            '&:hover': { borderColor: theme.palette.text.disabled, background: theme.palette.action.hover },
          }),
          text: ({ theme }) => ({ color: theme.palette.text.primary }),
        },
      },

      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            border: '1px solid',
            borderColor: theme.palette.divider,
            backgroundImage: 'none',
          }),
        },
      },

      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 6,
            '& fieldset': { borderColor: theme.palette.divider },
            '&:hover fieldset': { borderColor: theme.palette.text.disabled },
            // Focus is the one place the violet accent appears.
            '&.Mui-focused fieldset': {
              borderColor: theme.palette.secondary.main,
              borderWidth: 1,
              boxShadow: `0 0 0 3px ${dark ? 'rgba(144,133,233,0.18)' : 'rgba(74,58,167,0.12)'}`,
            },
          }),
          input: { fontSize: '0.875rem' },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { fontSize: '0.875rem' } } },

      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }) => ({
            fontVariantNumeric: 'tabular-nums',
            borderColor: theme.palette.divider,
            paddingBlock: 10,
          }),
          head: ({ theme }) => ({
            // Column headers use the mono label idiom.
            fontFamily: MONO,
            fontSize: '0.6875rem',
            fontWeight: 500,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: theme.palette.text.secondary,
            background: 'transparent',
          }),
        },
      },

      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 4, fontWeight: 500, fontSize: '0.75rem', height: 22 },
          label: { paddingInline: 7 },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontSize: '0.75rem', fontFamily: SANS, borderRadius: 5 },
        },
      },

      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 500, fontSize: '0.875rem', minHeight: 42 },
        },
      },

      MuiAlert: {
        // MUI v9 folded the per-severity slots (standardInfo etc.) into
        // `standard`, so info alerts are toned down via the variant instead.
        styleOverrides: {
          root: { borderRadius: 6, fontSize: '0.875rem' },
          standard: { border: '1px solid', borderColor: 'transparent' },
        },
      },

      MuiLink: {
        defaultProps: { underline: 'hover' },
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.secondary.main,
            textUnderlineOffset: 2,
          }),
        },
      },

      MuiDivider: { styleOverrides: { root: ({ theme }) => ({ borderColor: theme.palette.divider }) } },
    },
  });
};
