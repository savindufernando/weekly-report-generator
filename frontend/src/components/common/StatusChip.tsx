import { Chip, type ChipProps } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditNoteIcon from '@mui/icons-material/EditNote';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { STATUS_COLORS } from '../../theme/theme';
import type { ReportStatus } from '../../types';

/**
 * Status must never be conveyed by colour alone: every chip carries a text
 * label and an icon. That is both an accessibility requirement and the
 * mitigation for the two status colours that sit below 3:1 contrast on a
 * light surface.
 */
const CONFIG: Record<
  ReportStatus,
  { label: string; icon: React.ReactElement; fg: string }
> = {
  NOT_STARTED: { label: 'Not started', icon: <ErrorOutlineIcon />, fg: '#fff' },
  DRAFT: { label: 'Draft', icon: <EditNoteIcon />, fg: '#fff' },
  SUBMITTED: { label: 'Submitted', icon: <HourglassTopIcon />, fg: '#fff' },
  // Amber is light; dark ink keeps the label readable on it.
  NEEDS_CORRECTION: { label: 'Needs correction', icon: <WarningAmberIcon />, fg: '#1a1a19' },
  APPROVED: { label: 'Approved', icon: <CheckCircleIcon />, fg: '#fff' },
};

interface Props extends Omit<ChipProps, 'label' | 'icon' | 'color'> {
  status: ReportStatus;
}

export function StatusChip({ status, size = 'small', ...rest }: Props) {
  const config = CONFIG[status];
  return (
    <Chip
      {...rest}
      size={size}
      icon={config.icon}
      label={config.label}
      sx={{
        bgcolor: STATUS_COLORS[status],
        color: config.fg,
        fontWeight: 500,
        '& .MuiChip-icon': { color: 'inherit', fontSize: 16 },
        ...rest.sx,
      }}
    />
  );
}
