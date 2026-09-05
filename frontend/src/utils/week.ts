import { addDays, format, parseISO, startOfWeek } from 'date-fns';

/**
 * Client-side week helpers — for DISPLAY only.
 *
 * The server owns week identity: it normalises every submitted date to the ISO
 * Monday. These functions exist so the UI can show and pick weeks, not so the
 * client can decide which week a report belongs to.
 */

/** ISO Monday of the week containing `value`, as YYYY-MM-DD. */
export function mondayOf(value: Date | string): string {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export function currentWeekStart(): string {
  return mondayOf(new Date());
}

export function shiftWeeks(weekStart: string, weeks: number): string {
  return format(addDays(parseISO(weekStart), weeks * 7), 'yyyy-MM-dd');
}

/** "2 – 8 Mar 2026", collapsing the repeated month or year. */
export function formatWeek(weekStart: string): string {
  const start = parseISO(weekStart);
  const end = addDays(start, 6);

  if (format(start, 'MMM yyyy') === format(end, 'MMM yyyy')) {
    return `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`;
  }
  if (format(start, 'yyyy') === format(end, 'yyyy')) {
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
  }
  return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
}

export function formatWeekShort(weekStart: string): string {
  return format(parseISO(weekStart), 'd MMM');
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return format(parseISO(value), 'd MMM yyyy, HH:mm');
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return format(parseISO(value), 'd MMM yyyy');
}

/** "2 hours ago" / "3 days ago" — for feeds and queue ageing. */
export function relativeTime(value: string | null): string {
  if (!value) return '—';
  const then = parseISO(value).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return format(parseISO(value), 'd MMM yyyy');
}

/** The last `count` week-start dates, oldest first. */
export function recentWeeks(count: number, ending = currentWeekStart()): string[] {
  return Array.from({ length: count }, (_, i) => shiftWeeks(ending, i - (count - 1)));
}
