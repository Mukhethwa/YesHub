import Link from "next/link";

import { cn } from "@/lib/utils";

export type BarRow = {
  key: string;
  label: string;
  href?: string;
  /** Segments, drawn left to right; their values add up to the row's total. */
  segments: { value: number; className: string; label: string }[];
};

/**
 * Horizontal stacked bars for comparing a few things, e.g. qualifying and other applicants per opportunity.
 * Plain HTML so it reads well at any width; colours come from the logo palette (DESIGN.md).
 */
export function BarChart({
  rows,
  legend,
  empty = "Nothing to show yet.",
}: {
  rows: BarRow[];
  legend: { label: string; className: string }[];
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.segments.reduce((sum, s) => sum + s.value, 0)));

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {rows.map((row) => {
          const total = row.segments.reduce((sum, s) => sum + s.value, 0);
          const label = row.href ? (
            <Link href={row.href} className="truncate hover:underline">
              {row.label}
            </Link>
          ) : (
            <span className="truncate">{row.label}</span>
          );
          return (
            <li key={row.key} className="grid gap-1.5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center sm:gap-4">
              <span className="flex min-w-0 text-sm">{label}</span>
              <span className="flex items-center gap-3">
                <span
                  className="flex h-3 flex-1 overflow-hidden rounded-sm bg-muted"
                  role="img"
                  aria-label={`${row.label}: ${row.segments.map((s) => `${s.value} ${s.label}`).join(", ")}`}
                >
                  {row.segments.map((s) =>
                    s.value > 0 ? (
                      <span
                        key={s.label}
                        className={cn("h-full", s.className)}
                        style={{ width: `${(s.value / max) * 100}%` }}
                      />
                    ) : null,
                  )}
                </span>
                <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums">{total}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-[2px]", l.className)} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
