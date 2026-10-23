import {
  AwardIcon,
  BanIcon,
  BanknoteIcon,
  ClipboardListIcon,
  ClockIcon,
  FileTextIcon,
  HandCoinsIcon,
  LifeBuoyIcon,
  type LucideIcon,
  RocketIcon,
} from "lucide-react";

import { Status, type Tone } from "@/components/app/status";
import { cn } from "@/lib/utils";
import type { EsdKind } from "../../../convex/lib/kinds";
import type { OpportunityKind, OpportunityStatus } from "../../../convex/schema";

export const KIND_LABELS: Record<OpportunityKind, string> = {
  tender: "Tender",
  rfq: "RFQ",
  grant: "Grant",
  funding: "Funding",
  accelerator: "Accelerator",
  support: "Business support",
};

/** The ESD menu's sections, one per kind of programme, in the order they're listed. */
export const ESD_SECTIONS: {
  kind: EsdKind;
  slug: string;
  title: string;
  /** The shorter name in the sidebar. */
  navLabel: string;
  /** One of them, for buttons: "New grant". */
  noun: string;
  description: string;
}[] = [
  {
    kind: "grant",
    slug: "grants",
    title: "Grants",
    navLabel: "Grants",
    noun: "grant",
    description: "Money SMEs don’t pay back, for equipment, working capital or growth.",
  },
  {
    kind: "funding",
    slug: "funding",
    title: "Funding",
    navLabel: "Funding",
    noun: "funding offer",
    description: "Loans and finance on better terms than SMEs get elsewhere: working capital, equipment and invoices.",
  },
  {
    kind: "accelerator",
    slug: "accelerators",
    title: "Accelerator initiatives",
    navLabel: "Accelerators",
    noun: "accelerator",
    description: "Structured programmes with workshops, coaching and access to corporate buyers.",
  },
  {
    kind: "support",
    slug: "support",
    title: "Business-support services",
    navLabel: "Business support",
    noun: "support service",
    description: "Practical help: bookkeeping, compliance, tender readiness and mentoring.",
  },
];

/** Today as yyyy-mm-dd in the viewer's timezone, to compare with closing dates. */
function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Whole days from today until an ISO yyyy-mm-dd date; negative once it has passed. */
export function daysUntil(isoDate: string) {
  return Math.round((Date.parse(isoDate) - Date.parse(todayIso())) / 86_400_000);
}

export type Phase = "open" | "closing" | "closed" | "draft" | "awarded" | "cancelled";

/** Where an opportunity is in its life: closing means it closes within a week. */
export function phaseOf(opportunity: { status: OpportunityStatus; closesAt: string }): Phase {
  if (opportunity.status === "draft" || opportunity.status === "awarded" || opportunity.status === "cancelled")
    return opportunity.status;
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

const PHASES: Record<Phase, { label: string; tone: Tone; icon?: LucideIcon }> = {
  open: { label: "Open", tone: "success" },
  closing: { label: "Closing soon", tone: "warning", icon: ClockIcon },
  closed: { label: "Closed", tone: "neutral" },
  draft: { label: "Draft", tone: "neutral" },
  awarded: { label: "Awarded", tone: "info", icon: AwardIcon },
  cancelled: { label: "Cancelled", tone: "danger", icon: BanIcon },
};

/** Opportunities that no longer take applications: past their closing date, awarded or cancelled. */
export const isFinished = (phase: Phase) => phase === "closed" || phase === "awarded" || phase === "cancelled";

export function PhasePill({ phase }: { phase: Phase }) {
  const { label, tone, icon } = PHASES[phase];
  return (
    <Status tone={tone} icon={icon}>
      {label}
    </Status>
  );
}

/** "4 of 8": plain numbers, no bar (DESIGN.md). */
export function QualifiedShare({ qualified, applications }: { qualified: number; applications: number }) {
  if (applications === 0) return <span className="text-muted-foreground">No applicants</span>;
  return (
    <span className="tabular-nums">
      <span className="font-medium">{qualified}</span>
      <span className="text-muted-foreground"> of {applications}</span>
    </span>
  );
}

/** An icon for each kind of opportunity, to tell them apart in lists. */
export const KIND_ICONS: Record<OpportunityKind, LucideIcon> = {
  tender: FileTextIcon,
  rfq: ClipboardListIcon,
  grant: HandCoinsIcon,
  funding: BanknoteIcon,
  accelerator: RocketIcon,
  support: LifeBuoyIcon,
};

/** Each kind takes a colour from the logo, so lists of opportunities read at a glance (DESIGN.md). */
const KIND_TILES: Record<OpportunityKind, string> = {
  tender: "bg-brand-blue text-white",
  rfq: "bg-brand-green text-brand-navy",
  grant: "bg-brand-yellow text-brand-navy",
  funding: "bg-brand-navy text-white",
  accelerator: "bg-brand-red text-white",
  support: "bg-primary text-primary-foreground",
};

/** A small solid tile in the kind's logo colour, with its icon. Identifies each kind of opportunity in lists. */
export function KindTile({ kind, className }: { kind: OpportunityKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span
      role="img"
      aria-label={KIND_LABELS[kind]}
      title={KIND_LABELS[kind]}
      className={cn("grid size-7 shrink-0 place-items-center rounded-md", KIND_TILES[kind], className)}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}
