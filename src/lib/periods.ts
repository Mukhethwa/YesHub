/*
 * Date ranges for charts and analytics, and the buckets (days, weeks or months) a range is drawn in.
 * Everything takes `now` from the browser (useNow) so nothing reads the clock while rendering.
 */

export type Range = "7d" | "30d" | "90d" | "12m";

export const RANGES: { id: Range; label: string; previous: string }[] = [
  { id: "7d", label: "7 days", previous: "previous 7 days" },
  { id: "30d", label: "30 days", previous: "previous 30 days" },
  { id: "90d", label: "90 days", previous: "previous 90 days" },
  { id: "12m", label: "12 months", previous: "previous 12 months" },
];

const DAY = 86_400_000;

export type Period = {
  start: number;
  end: number;
  /** One label per bucket, oldest first. */
  labels: string[];
  /** The bucket a timestamp falls in, or -1 outside the period. */
  bucket: (t: number) => number;
  /** The same length of time immediately before, for comparisons. */
  previous: { start: number; end: number };
};

const dayLabel = (t: number) => new Date(t).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

export function periodOf(range: Range, now: number): Period {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const end = today.getTime() + DAY;

  if (range === "12m") {
    const first = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    const start = first.getTime();
    const labels = Array.from({ length: 12 }, (_, i) =>
      new Date(first.getFullYear(), first.getMonth() + i, 1).toLocaleDateString("en-ZA", { month: "short" }),
    );
    const bucket = (t: number) => {
      if (t < start || t >= end) return -1;
      const d = new Date(t);
      return (d.getFullYear() - first.getFullYear()) * 12 + d.getMonth() - first.getMonth();
    };
    return { start, end, labels, bucket, previous: { start: start - (end - start), end: start } };
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  // 90 days reads better as 13 weeks
  const size = range === "90d" ? 7 : 1;
  const count = Math.ceil(days / size);
  const start = end - count * size * DAY;
  const labels = Array.from({ length: count }, (_, i) => dayLabel(start + i * size * DAY));
  const bucket = (t: number) => (t < start || t >= end ? -1 : Math.floor((t - start) / (size * DAY)));
  return { start, end, labels, bucket, previous: { start: start - (end - start), end: start } };
}

/** How many timestamps fall in each bucket. */
export function countByBucket(timestamps: number[], period: Period) {
  const counts = period.labels.map(() => 0);
  for (const t of timestamps) {
    const i = period.bucket(t);
    if (i >= 0) counts[i]++;
  }
  return counts;
}

export const within = (t: number, range: { start: number; end: number }) => t >= range.start && t < range.end;

/** Percentage change from `before` to `after`, or null when there's nothing to compare with. */
export function change(after: number, before: number) {
  if (before === 0) return after === 0 ? 0 : null;
  return Math.round(((after - before) / before) * 100);
}
