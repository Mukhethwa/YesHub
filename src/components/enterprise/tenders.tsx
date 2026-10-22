import { Pill } from "@/components/admin/page-header";
import { Progress } from "@/components/ui/progress";
import type { OpportunityKind, OpportunityStatus } from "../../../convex/schema";

export const KIND_LABELS: Record<OpportunityKind, string> = { tender: "Tender", rfq: "RFQ", grant: "Grant" };

/** Today as yyyy-mm-dd in the viewer's timezone, to compare with closing dates. */
function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Whole days from today until an ISO yyyy-mm-dd date; negative once it has passed. */
export function daysUntil(isoDate: string) {
  return Math.round((Date.parse(isoDate) - Date.parse(todayIso())) / 86_400_000);
}

export type Phase = "open" | "closing" | "closed" | "draft" | "awarded";

/** Where an opportunity is in its life: closing means it closes within a week. */
export function phaseOf(opportunity: { status: OpportunityStatus; closesAt: string }): Phase {
  if (opportunity.status === "draft" || opportunity.status === "awarded") return opportunity.status;
  const days = daysUntil(opportunity.closesAt);
  if (opportunity.status === "closed" || days < 0) return "closed";
  return days <= 7 ? "closing" : "open";
}

export function closingLabel(closesAt: string) {
  const days = daysUntil(closesAt);
  if (days < -1) return `Closed ${-days} days ago`;
  if (days === -1) return "Closed yesterday";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

/** R4 800 000 → "R4.8m", R950 000 → "R950k". */
export function formatRand(value: number | null) {
  if (value === null) return "Not stated";
  if (value >= 1_000_000) return `R${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (value >= 1_000) return `R${Math.round(value / 1_000)}k`;
  return `R${value}`;
}

export function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

const PHASE_PILLS: Record<Phase, { label: string; tone: "neutral" | "success" | "warning" | "info" }> = {
  open: { label: "Open", tone: "success" },
  closing: { label: "Closing soon", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
  draft: { label: "Draft", tone: "neutral" },
  awarded: { label: "Awarded", tone: "info" },
};

export function PhasePill({ phase }: { phase: Phase }) {
  const { label, tone } = PHASE_PILLS[phase];
  return <Pill tone={tone}>{label}</Pill>;
}

/** "4 of 8" with a bar showing the qualifying share of applicants. */
export function QualifiedShare({ qualified, applications }: { qualified: number; applications: number }) {
  if (applications === 0) return <span className="text-muted-foreground">No applicants</span>;
  return (
    <div className="min-w-28">
      <p className="tabular-nums">
        <span className="font-medium">{qualified}</span>
        <span className="text-muted-foreground"> of {applications}</span>
      </p>
      <Progress
        value={percent(qualified, applications)}
        className="mt-1.5"
        aria-label={`${qualified} of ${applications} qualify`}
      />
    </div>
  );
}
