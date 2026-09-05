import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton,
  Stack, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useState } from 'react';

import { EmptyState, ErrorState, LoadingState, SectionCard, UserAvatar } from '../common';
import { ReportSectionView, fromVersion } from '../reports/ReportSectionView';
import { reportService } from '../../services';
import { useQuery } from '@tanstack/react-query';
import { reportKeys } from '../../hooks/useReports';
import type { VersionSummary } from '../../types';
import { formatDateTime, relativeTime } from '../../utils/week';

/**
 * The version history panel.
 *
 * This is the visual answer to the requirement that a manager "must be able to
 * clearly see each past version of that week's report alongside the version
 * currently under review, and which version a given comment was made against".
 *
 * Each entry shows the review action taken against THAT version — the comment
 * hangs off the version, never off the report as a whole.
 */
export function VersionTimeline({
  reportId,
  versions,
  isLoading,
  error,
}: {
  reportId: number;
  versions: VersionSummary[] | undefined;
  isLoading?: boolean;
  error?: unknown;
}) {
  const [viewing, setViewing] = useState<number | null>(null);

  if (isLoading) return <LoadingState variant="card" rows={2} />;
  if (error) return <ErrorState error={error} compact />;

  if (!versions || versions.length === 0) {
    return (
      <EmptyState
        compact
        title="Not yet submitted"
        description="Versions are created each time the report is submitted for review."
      />
    );
  }

  return (
    <>
      <Stack spacing={0}>
        {versions.map((version, index) => {
          const isLast = index === versions.length - 1;
          const review = version.review;

          return (
            <Box key={version.version_no} sx={{ display: 'flex', gap: 1.5 }}>
              {/* The rail: a dot per version, joined by a line. */}
              <Stack sx={{ alignItems: 'center', width: 20, flexShrink: 0 }}>
                <Box
                  sx={{
                    width: 11,
                    height: 11,
                    borderRadius: '50%',
                    mt: 0.75,
                    bgcolor: version.is_current ? 'primary.main' : 'action.disabled',
                    outline: version.is_current ? '3px solid' : 'none',
                    outlineColor: 'action.hover',
                  }}
                />
                {!isLast && <Box sx={{ width: 2, flex: 1, bgcolor: 'divider', my: 0.5 }} />}
              </Stack>

              <Box sx={{ flex: 1, pb: isLast ? 0 : 2.5, minWidth: 0 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.25 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Version {version.version_no}
                  </Typography>
                  {version.is_current && <Chip size="small" color="primary" label="Current" />}
                  <Button
                    size="small"
                    onClick={() => setViewing(version.version_no)}
                    sx={{ minWidth: 0, py: 0 }}
                  >
                    View
                  </Button>
                </Stack>

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {formatDateTime(version.submitted_at)} · {version.submitted_by.full_name}
                </Typography>

                {/* The review that was made against THIS version. */}
                {review ? (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.25,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                      borderLeft: '3px solid',
                      borderColor:
                        review.action === 'APPROVE' ? 'success.main' : 'warning.main',
                    }}
                  >
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5 }}>
                      {review.action === 'APPROVE' ? (
                        <CheckCircleIcon sx={{ fontSize: 15, color: 'success.main' }} />
                      ) : (
                        <WarningAmberIcon sx={{ fontSize: 15, color: 'warning.main' }} />
                      )}
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {review.action === 'APPROVE' ? 'Approved' : 'Changes requested'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        · {review.reviewer.full_name} · {relativeTime(review.created_at)}
                      </Typography>
                    </Stack>
                    {review.comment && (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {review.comment}
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    Awaiting review
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>

      <VersionDialog
        reportId={reportId}
        versionNo={viewing}
        totalVersions={versions.length}
        onClose={() => setViewing(null)}
      />
    </>
  );
}

/** Renders one frozen snapshot, through the same components as a live report. */
function VersionDialog({
  reportId,
  versionNo,
  totalVersions,
  onClose,
}: {
  reportId: number;
  versionNo: number | null;
  totalVersions: number;
  onClose: () => void;
}) {
  const { data, isPending, error } = useQuery({
    queryKey: [...reportKeys.versions(reportId), versionNo],
    queryFn: () => reportService.version(reportId, versionNo!),
    enabled: versionNo !== null,
  });

  return (
    <Dialog open={versionNo !== null} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Version {versionNo}</span>
          <Typography variant="caption" color="text.secondary">
            of {totalVersions}
            {data && ` · submitted ${formatDateTime(data.submitted_at)}`}
          </Typography>
        </Stack>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ bgcolor: 'background.default' }}>
        {isPending && <LoadingState variant="card" rows={3} />}
        {error && <ErrorState error={error} />}
        {data && (
          <Box sx={{ pt: 1 }}>
            {data.review && (
              <SectionCard title="Review of this version" dense>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <UserAvatar user={data.review.reviewer} size={22} showName />
                  <Chip
                    size="small"
                    color={data.review.action === 'APPROVE' ? 'success' : 'warning'}
                    label={data.review.action === 'APPROVE' ? 'Approved' : 'Changes requested'}
                  />
                </Stack>
                {data.review.comment && (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {data.review.comment}
                  </Typography>
                )}
              </SectionCard>
            )}
            <Box sx={{ mt: data.review ? 2.5 : 0 }}>
              <ReportSectionView data={fromVersion(data.content)} />
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
