import {
  Alert, Box, Button, Card, CardContent, Divider, FormControlLabel, Grid, Radio,
  RadioGroup, Stack, TextField, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ConfirmDialog, ErrorState, LoadingState, PageHeader, StatusChip, UserAvatar,
} from '../../components/common';
import { ProjectChip, ReportSectionView, fromReport } from '../../components/reports/ReportSectionView';
import { VersionTimeline } from '../../components/review/VersionTimeline';
import { useAuth } from '../../contexts/AuthContext';
import { useReport, useVersions } from '../../hooks/useReports';
import { useReviewReport } from '../../hooks/useReview';
import type { ReviewAction } from '../../types';
import { formatWeek } from '../../utils/week';

/**
 * The manager's review screen — the most heavily weighted page in the brief.
 *
 * Note what is NOT here: any editable control over the report's content. The
 * left column renders the same read-only components the member sees. That is
 * the visible expression of the server-side rule that a manager's only write
 * path is status and a comment.
 */
export default function ReviewReportPage() {
  const { reportId } = useParams();
  const id = Number(reportId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: report, isPending, error, refetch } = useReport(id);
  const versions = useVersions(id);
  const submitReview = useReviewReport(id);

  const [action, setAction] = useState<ReviewAction>('APPROVE');
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (isPending) return <LoadingState variant="page" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!report) return null;

  const isOwnReport = user?.id === report.user.id;
  const isReviewable = report.status === 'SUBMITTED';
  const commentMissing = action === 'REQUEST_CHANGES' && comment.trim().length === 0;

  const handleSubmit = async () => {
    setConfirming(false);
    try {
      await submitReview.mutateAsync({
        action,
        comment: comment.trim() || null,
      });
      navigate('/review');
    } catch {
      /* the hook reports the failure */
    }
  };

  return (
    <Box>
      <PageHeader
        title={`${report.user.full_name} · week of ${formatWeek(report.week_start)}`}
        breadcrumbs={[{ label: 'Review Queue', to: '/review' }, { label: 'Review' }]}
        chip={<StatusChip status={report.status} />}
        subtitle={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
            <UserAvatar user={report.user} size={22} showName />
            <ProjectChip name={report.project.name} color={report.project.color} />
            <Typography variant="caption" color="text.secondary">
              version {report.current_version_no} · {report.submission_count} submission
              {report.submission_count === 1 ? '' : 's'}
            </Typography>
          </Stack>
        }
      />

      <Grid container spacing={2.5}>
        {/* LEFT — the report, entirely read-only. */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <ReportSectionView data={fromReport(report)} />
        </Grid>

        {/* RIGHT — the only place a manager can write. */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5} sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
                  Review
                </Typography>

                {isOwnReport && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    You cannot review your own report.
                  </Alert>
                )}

                {!isReviewable && !isOwnReport && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    This report is {report.status.replace('_', ' ').toLowerCase()} and is not
                    awaiting review.
                  </Alert>
                )}

                <Box sx={{ opacity: isReviewable && !isOwnReport ? 1 : 0.5 }}>
                  <RadioGroup
                    value={action}
                    onChange={(event) => setAction(event.target.value as ReviewAction)}
                  >
                    <FormControlLabel
                      value="APPROVE"
                      disabled={!isReviewable || isOwnReport}
                      control={<Radio size="small" />}
                      label={
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                          <CheckCircleIcon sx={{ fontSize: 17, color: 'success.main' }} />
                          <span>Approve</span>
                        </Stack>
                      }
                    />
                    <FormControlLabel
                      value="REQUEST_CHANGES"
                      disabled={!isReviewable || isOwnReport}
                      control={<Radio size="small" />}
                      label={
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                          <WarningAmberIcon sx={{ fontSize: 17, color: 'warning.main' }} />
                          <span>Request changes</span>
                        </Stack>
                      }
                    />
                  </RadioGroup>

                  <TextField
                    label={action === 'REQUEST_CHANGES' ? 'What needs correcting?' : 'Comment (optional)'}
                    multiline
                    minRows={4}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    onBlur={() => setTouched(true)}
                    disabled={!isReviewable || isOwnReport}
                    error={touched && commentMissing}
                    helperText={
                      touched && commentMissing
                        ? 'Explain what needs to change so the author knows what to do'
                        : action === 'REQUEST_CHANGES'
                          ? 'Required — this is what the author will see'
                          : ' '
                    }
                    sx={{ mt: 1.5 }}
                  />

                  <Button
                    fullWidth
                    variant="contained"
                    color={action === 'APPROVE' ? 'success' : 'warning'}
                    disabled={!isReviewable || isOwnReport || commentMissing || submitReview.isPending}
                    onClick={() => setConfirming(true)}
                    sx={{ mt: 1.5 }}
                  >
                    {action === 'APPROVE' ? 'Approve report' : 'Send back for correction'}
                  </Button>
                </Box>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
                  Version history
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  Each past version, and the comment made against it
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <VersionTimeline
                  reportId={id}
                  versions={versions.data}
                  isLoading={versions.isPending}
                  error={versions.error}
                />
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <ConfirmDialog
        open={confirming}
        title={action === 'APPROVE' ? 'Approve this report?' : 'Send back for correction?'}
        description={
          action === 'APPROVE'
            ? `${report.user.full_name}'s report will be marked approved and can no longer be edited.`
            : `${report.user.full_name} will be able to edit and resubmit. Your comment will be shown on their report page.`
        }
        confirmLabel={action === 'APPROVE' ? 'Approve' : 'Send back'}
        isPending={submitReview.isPending}
        onConfirm={handleSubmit}
        onCancel={() => setConfirming(false)}
      />
    </Box>
  );
}
