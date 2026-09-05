import { Alert, AlertTitle, Box, Button, Stack, Typography } from '@mui/material';

import type { ReviewBrief } from '../../types';
import { relativeTime } from '../../utils/week';

/**
 * The manager's feedback, shown prominently on the member's own report page.
 *
 * The brief requires the member to "see the manager's comment clearly on their
 * report page" — so this sits above the form, not tucked into a history panel,
 * and it names the version the comment was written against.
 */
export function ReviewCommentBanner({
  review,
  onViewVersion,
}: {
  review: ReviewBrief;
  onViewVersion?: (versionNo: number) => void;
}) {
  const isRejection = review.action === 'REQUEST_CHANGES';

  return (
    <Alert
      severity={isRejection ? 'warning' : 'success'}
      sx={{ mb: 3 }}
      action={
        onViewVersion && (
          <Button
            color="inherit"
            size="small"
            onClick={() => onViewVersion(review.against_version)}
          >
            View v{review.against_version}
          </Button>
        )
      }
    >
      <AlertTitle sx={{ mb: 0.5 }}>
        {isRejection ? 'Changes requested' : 'Approved'}
      </AlertTitle>

      <Stack direction="row" spacing={1} sx={{ mb: review.comment ? 1 : 0, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          {review.reviewer.full_name} · {relativeTime(review.created_at)} · against version{' '}
          {review.against_version}
        </Typography>
      </Stack>

      {review.comment && (
        <Box
          sx={{
            borderLeft: '3px solid',
            borderColor: 'divider',
            pl: 1.5,
            py: 0.25,
            whiteSpace: 'pre-wrap',
          }}
        >
          <Typography variant="body2">{review.comment}</Typography>
        </Box>
      )}
    </Alert>
  );
}
