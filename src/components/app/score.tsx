import { cn } from "@/lib/utils";
import type { Tone } from "./status";

/** The band a 0–100 score falls in. Thresholds match how SME readiness and fit are described. */
export function scoreTone(score: number): Tone {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

/** A score as a plain number out of 100. The words around it carry the meaning (DESIGN.md). */
export function Score({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("tabular-nums", className)}>
      <span className="font-medium">{value}</span>
      <span className="text-muted-foreground">/100</span>
    </span>
  );
}

/**
 * How many checks passed, as one segment per check. For the one metric a page is about (DESIGN.md), not
 * for every ratio.
 */
export function CheckSegments({ passed, total, label }: { passed: number; total: number; label: string }) {
  return (
    <div className="flex gap-1" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < passed ? "bg-primary" : "bg-muted")} />
      ))}
    </div>
  );
}
