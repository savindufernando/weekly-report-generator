import { Box, Chip, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { type Column, DataTable, PageHeader, StatusChip, UserAvatar } from '../../components/common';
import { useReviewQueue } from '../../hooks/useReview';
import { STATUS_COLORS } from '../../theme/theme';
import type { QueueItem } from '../../types';
import { formatWeek, relativeTime } from '../../utils/week';

const TABS = [
  { value: 'SUBMITTED', label: 'Awaiting review' },
  { value: 'NEEDS_CORRECTION', label: 'Sent back' },
  { value: 'APPROVED', label: 'Approved' },
] as const;

/** Waiting longer than this is worth flagging to the manager. */
const STALE_HOURS = 48;

export default function ReviewQueuePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('SUBMITTED');
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);

  const { data, isPending, error, refetch } = useReviewQueue(status, limit, offset);

  const columns: Column<QueueItem>[] = [
    {
      key: 'member',
      label: 'Team member',
      primary: true,
      render: (row) => (
        <UserAvatar user={{ ...row.user, avatar_url: null }} size={26} showName />
      ),
    },
    {
      key: 'week',
      label: 'Week',
      render: (row) => formatWeek(row.week_start),
    },
    {
      key: 'project',
      label: 'Project',
      hideOnMobile: true,
      render: (row) => (
        <Chip
          size="small"
          label={row.project.name}
          sx={{
            bgcolor: `${row.project.color}1f`,
            borderLeft: `3px solid ${row.project.color}`,
            borderRadius: 1,
          }}
        />
      ),
    },
    {
      key: 'version',
      label: 'Version',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (
        <Typography variant="body2">
          v{row.current_version_no}
          {row.submission_count > 1 && (
            <Typography component="span" variant="caption" color="text.secondary">
              {' '}
              ({row.submission_count} rounds)
            </Typography>
          )}
        </Typography>
      ),
    },
    {
      key: 'waiting',
      label: 'Waiting',
      align: 'right',
      render: (row) => {
        const stale = (row.waiting_hours ?? 0) >= STALE_HOURS;
        return (
          <Typography
            variant="body2"
            sx={{ color: stale ? 'warning.main' : 'text.secondary', fontWeight: stale ? 600 : 400 }}
          >
            {relativeTime(row.last_submitted_at)}
          </Typography>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusChip status={row.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Review Queue"
        subtitle="Reports awaiting your action, oldest first"
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <Tabs
          value={status}
          onChange={(_, next) => {
            setStatus(next);
            setOffset(0);
          }}
          variant="scrollable"
          scrollButtons="auto"
        >
          {TABS.map((tab) => (
            <Tab key={tab.value} value={tab.value} label={tab.label} />
          ))}
        </Tabs>
      </Box>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        getRowKey={(row) => row.id}
        isLoading={isPending}
        error={error}
        onRetry={refetch}
        onRowClick={(row) =>
          navigate(row.status === 'SUBMITTED' ? `/review/${row.id}` : `/reports/${row.id}`)
        }
        rowAccent={(row) =>
          (row.waiting_hours ?? 0) >= STALE_HOURS ? STATUS_COLORS.NEEDS_CORRECTION : undefined
        }
        emptyTitle={
          status === 'SUBMITTED' ? 'Nothing waiting for review' : 'Nothing here'
        }
        emptyDescription={
          status === 'SUBMITTED'
            ? 'Every submitted report has been actioned. Nice.'
            : undefined
        }
        total={data?.total}
        limit={limit}
        offset={offset}
        onPageChange={setOffset}
        onLimitChange={(next) => {
          setLimit(next);
          setOffset(0);
        }}
      />
    </>
  );
}
