import { Box, Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import RateReviewIcon from '@mui/icons-material/RateReview';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Can, ErrorState, LoadingState, PageHeader, StatusChip, UserAvatar,
} from '../../components/common';
import { ReportSectionView, fromReport, ProjectChip } from '../../components/reports/ReportSectionView';
import { ReviewCommentBanner } from '../../components/reports/ReviewCommentBanner';
import { VersionTimeline } from '../../components/review/VersionTimeline';
import { useAuth } from '../../contexts/AuthContext';
import { useReport, useVersions } from '../../hooks/useReports';
import { formatDateTime, formatWeek } from '../../utils/week';

/**
 * Read-only view of a single report.
 *
 * Used by BOTH roles, as the brief requires. The content rendering is
 * identical for everyone; only the action bar differs, driven by permissions.
 */
export default function ReportDetailPage() {
  const { reportId } = useParams();
  const id = Number(reportId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: report, isPending, error, refetch } = useReport(id);
  const versions = useVersions(id);

  if (isPending) return <LoadingState variant="page" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!report) return null;

  const isOwner = user?.id === report.user.id;
  const canReview = report.status === 'SUBMITTED' && !isOwner;

  return (
    <Box>
      <PageHeader
        title={`Week of ${formatWeek(report.week_start)}`}
        breadcrumbs={[
          { label: isOwner ? 'My Reports' : 'Review Queue', to: isOwner ? '/reports' : '/review' },
          { label: 'Report' },
        ]}
        chip={<StatusChip status={report.status} />}
        subtitle={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
            <UserAvatar user={report.user} size={22} showName />
            <ProjectChip name={report.project.name} color={report.project.color} />
          </Stack>
        }
        actions={
          <>
            {isOwner && report.is_editable && (
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={() => navigate(`/reports/${id}/edit`)}
              >
                Edit
              </Button>
            )}
            {canReview && (
              <Can do="report.review">
                <Button
                  variant="contained"
                  startIcon={<RateReviewIcon />}
                  onClick={() => navigate(`/review/${id}`)}
                >
                  Review
                </Button>
              </Can>
            )}
          </>
        }
      />

      {report.latest_review && (
        <ReviewCommentBanner review={report.latest_review} />
      )}

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <ReportSectionView data={fromReport(report)} />
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          {/* Sticky on wide screens so the timeline stays visible while
              scrolling a long report. */}
          <Stack spacing={2.5} sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
                  Details
                </Typography>
                <Stack spacing={1.25}>
                  <DetailRow label="Status" value={<StatusChip status={report.status} />} />
                  <DetailRow label="Version" value={`v${report.current_version_no || 0}`} />
                  <DetailRow
                    label="Submissions"
                    value={String(report.submission_count)}
                  />
                  <Divider />
                  <DetailRow
                    label="First submitted"
                    value={formatDateTime(report.first_submitted_at)}
                  />
                  <DetailRow
                    label="Last submitted"
                    value={formatDateTime(report.last_submitted_at)}
                  />
                  <DetailRow label="Reviewed" value={formatDateTime(report.reviewed_at)} />
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
                  Version history
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  Every submission is kept, with the comment made against it
                </Typography>
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
    </Box>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ fontSize: 14, textAlign: 'right' }}>{value}</Box>
    </Stack>
  );
}
