import { cn } from "@/lib/utils";

export type ColumnSeries = { label: string; className: string; values: number[] };

/**
 * Vertical bars over time (one column per day), with up to a few stacked series in logo colours. Plain HTML
 * so it scales to any width; each column has an accessible label.
 */
export function ColumnChart({
  labels,
  series,
  height = 140,
}: {
  /** One label per column, e.g. "21 Oct". */
  labels: string[];
  series: ColumnSeries[];
  height?: number;
}) {
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const step = Math.max(1, Math.ceil(labels.length / 6));

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {labels.map((label, i) => (
          <div
            key={label}
            role="img"
            aria-label={`${label}: ${series.map((s) => `${s.values[i] ?? 0} ${s.label}`).join(", ")}`}
            title={`${label}: ${series.map((s) => `${s.values[i] ?? 0} ${s.label.toLowerCase()}`).join(", ")}`}
            className="flex h-full flex-1 flex-col-reverse overflow-hidden rounded-t-sm"
          >
            {series.map((s) =>
              s.values[i] ? (
                <span
                  key={s.label}
                  className={cn("w-full", s.className)}
                  style={{ height: `${((s.values[i] ?? 0) / max) * 100}%` }}
                />
              ) : null,
            )}
            {totals[i] === 0 && <span className="h-px w-full bg-border" />}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        {labels.map((label, i) =>
          i % step === 0 || i === labels.length - 1 ? <span key={label}>{label}</span> : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-[2px]", s.className)} />
            {s.label}
            <span className="font-medium text-foreground tabular-nums">{s.values.reduce((a, b) => a + b, 0)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
