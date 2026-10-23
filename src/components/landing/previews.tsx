import {
  CalculatorIcon,
  ClockIcon,
  GavelIcon,
  ListChecksIcon,
  type LucideIcon,
  MapPinIcon,
  PlayIcon,
  ShieldAlertIcon,
} from "lucide-react";

import { ColourAvatar } from "@/components/app/avatar";
import { Status, Tag } from "@/components/app/status";
import { KindTile } from "@/components/enterprise/tenders";
import { Part } from "@/components/scene-parts";
import { cn } from "@/lib/utils";

/*
 * Product previews for the landing page, drawn with the app's own parts and sample data. They're
 * pictures of the product, so they're hidden from assistive tech; the copy beside them says the same.
 * Business names are made up.
 */

const APPLICANTS = [
  {
    name: "Ubuntu Facilities Services",
    place: "eThekwini, KwaZulu-Natal",
    score: 86,
    status: <Status tone="success">Shortlisted</Status>,
  },
  {
    name: "Imbali Cleaning Co-operative",
    place: "Johannesburg, Gauteng",
    score: 79,
    status: <Status tone="success">Shortlisted</Status>,
  },
  {
    name: "Siyakha Hygiene Solutions",
    place: "Msunduzi, KwaZulu-Natal",
    score: 64,
    status: <Status tone="neutral">Meets the requirements</Status>,
  },
  {
    name: "Kasi Clean Crew",
    place: "Tshwane, Gauteng",
    score: 41,
    status: <Status tone="danger">Tax clearance expired</Status>,
  },
];

/** The buyer's view of one tender: applicants ranked, with the shortlist filling up. */
export function ShortlistPreview({ className }: { className?: string }) {
  return (
    <Part id="shortlist">
      <div
        aria-hidden
        className={cn("scene-unclip overflow-hidden rounded-lg border bg-card text-card-foreground", className)}
      >
        <Part id="shortlist-head" className="flex items-start gap-3 border-b bg-card p-4">
          <KindTile kind="tender" className="size-9 [&_svg]:size-4" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Office cleaning and hygiene services, 36 months</p>
            <p className="truncate text-xs text-muted-foreground">Umhlaba Property Group, UPG-FAC-2026-011</p>
          </div>
          <Tag className="hidden sm:inline-flex">Closes 14 Nov</Tag>
        </Part>

        <ul className="divide-y">
          {APPLICANTS.map((a, i) => (
            <li key={a.name}>
              <Part id={`applicant-${i}`} className="flex items-center gap-3 bg-card px-4 py-2.5">
                <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <ColourAvatar name={a.name} className="size-7 text-[11px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.place}</p>
                </div>
                <span className="hidden sm:inline">{a.status}</span>
                <span className="w-14 text-right text-sm font-semibold tabular-nums">
                  {a.score}
                  <span className="text-xs font-normal text-muted-foreground">/100</span>
                </span>
              </Part>
            </li>
          ))}
        </ul>

        <Part id="shortlist-foot" className="flex items-center gap-4 border-t bg-muted/40 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs">
              <span className="font-semibold">2 of 3</span> <span className="text-muted-foreground">places filled</span>
            </p>
            <div className="flex gap-1">
              <span className="h-1.5 flex-1 rounded-sm bg-brand-green" />
              <span className="h-1.5 flex-1 rounded-sm bg-brand-green" />
              <span className="h-1.5 flex-1 rounded-sm bg-muted" />
            </div>
          </div>
          <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            Review shortlist
          </span>
        </Part>
      </div>
    </Part>
  );
}

const DOCUMENTS = [
  { label: "B-BBEE certificate", status: <Status tone="success">Valid to Mar 2027</Status> },
  { label: "Tax compliance status", status: <Status tone="warning">Expires in 9 days</Status> },
  { label: "CSD registration", status: <Status tone="success">MAAA0412785</Status> },
  { label: "Company registration (CIPC)", status: <Status tone="success">Uploaded</Status> },
];

/** The SME's view: what's in order, what needs renewing, and a match that just arrived. */
export function SmePreview({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-3", className)}>
      <Part id="sme-card">
        <div className="scene-unclip overflow-hidden rounded-lg border bg-card text-card-foreground">
          <Part id="sme-head" className="flex items-center gap-3 border-b bg-card p-4">
            <ColourAvatar name="Lethabo Catering" className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Lethabo Catering & Events</p>
              <p className="truncate text-xs text-muted-foreground">Polokwane, Limpopo</p>
            </div>
            <div className="text-right">
              <p className="text-lg leading-none font-semibold tabular-nums">
                88<span className="text-xs font-normal text-muted-foreground">/100</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Readiness</p>
            </div>
          </Part>
          <ul className="divide-y text-sm">
            {DOCUMENTS.map((d, i) => (
              <li key={d.label}>
                <Part id={`doc-${i}`} className="flex items-center justify-between gap-3 bg-card px-4 py-2">
                  <span className="truncate">{d.label}</span>
                  {d.status}
                </Part>
              </li>
            ))}
          </ul>
          <Part id="sme-foot" className="flex items-center justify-between gap-3 border-t bg-card px-4 py-2.5">
            <span className="text-xs text-muted-foreground">1 document needs renewing</span>
            <span className="text-xs font-semibold text-primary">Upload</span>
          </Part>
        </div>
      </Part>

      <Part
        id="sme-match"
        className="flex items-start gap-3 rounded-lg border border-l-4 border-l-brand-green bg-card p-4 text-card-foreground"
      >
        <KindTile kind="rfq" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">New match</p>
          <p className="truncate text-sm font-semibold">Staff canteen catering, 12 months</p>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPinIcon className="size-3.5" />
              Capricorn District
            </span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3.5" />
              Closes in 12 days
            </span>
          </p>
        </div>
      </Part>
    </div>
  );
}

const TRAIL: { icon: LucideIcon; tone: string; label: string; text: string; detail?: string }[] = [
  {
    icon: PlayIcon,
    tone: "bg-brand-navy text-white",
    label: "Shortlisting started by Thandi Mokoena",
    text: "Shortlist up to 3 of 4 applicants.",
  },
  {
    icon: CalculatorIcon,
    tone: "bg-muted text-foreground",
    label: "Points",
    text: "Ubuntu Facilities Services: 86 of 100",
    detail: "Price 66.2 of 80 (80/20 formula), B-BBEE Level 1, 20 of 20",
  },
  {
    icon: ShieldAlertIcon,
    tone: "bg-brand-yellow/30 text-warning",
    label: "Rule applied",
    text: "Kasi Clean Crew isn’t eligible: the tax clearance expired on 2 Oct 2026.",
  },
  {
    icon: ListChecksIcon,
    tone: "bg-brand-green/25 text-success",
    label: "Shortlisting",
    text: "2 shortlisted, 1 place left open. Every applicant has a reason.",
  },
  {
    icon: GavelIcon,
    tone: "bg-primary/15 text-primary",
    label: "Buyer action by Thandi Mokoena",
    text: "Awarded to Ubuntu Facilities Services",
    detail: "Reason: highest points and a site supervisor in each region.",
  },
];

/** The decision record: every step, who took it, and why. */
export function RecordPreview({ className }: { className?: string }) {
  return (
    <Part id="record">
      <div aria-hidden className={cn("rounded-lg border bg-card p-5 text-card-foreground", className)}>
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
          {TRAIL.map((e, i) => (
            <li key={e.label + e.text}>
              <Part id={`trail-${i}`} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-md bg-card">
                <span
                  className={cn("relative z-10 grid size-8 place-items-center rounded-full ring-4 ring-card", e.tone)}
                >
                  <e.icon className="size-4" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-xs font-semibold">{e.label}</p>
                  <p className="mt-0.5 text-sm">{e.text}</p>
                  {e.detail && <p className="mt-0.5 text-xs text-muted-foreground">{e.detail}</p>}
                </div>
              </Part>
            </li>
          ))}
        </ol>
      </div>
    </Part>
  );
}

const SCORING = [
  { label: "Price", points: 80, detail: "80/20 formula", className: "bg-brand-blue" },
  { label: "B-BBEE", points: 20, detail: "Level 1 earns 20", className: "bg-brand-green" },
];

/** The buyer posting an opportunity: where the work is, how it's scored and what applicants must hold. */
export function OpportunityPreview({ className }: { className?: string }) {
  return (
    <Part id="opp">
      <div
        aria-hidden
        className={cn("scene-unclip overflow-hidden rounded-lg border bg-card text-card-foreground", className)}
      >
        <Part id="opp-head" className="flex items-start gap-3 border-b bg-card p-4">
          <KindTile kind="tender" className="size-9 [&_svg]:size-4" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Security services for four distribution centres</p>
            <p className="truncate text-xs text-muted-foreground">Gauteng and Western Cape, closes 28 Nov 2026</p>
          </div>
          <Status tone="success" className="hidden sm:inline-flex">
            Published
          </Status>
        </Part>

        <Part id="opp-scoring" className="space-y-3 border-b bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">How it’s scored</p>
          <div className="flex h-7 overflow-hidden rounded-md text-[11px] font-semibold">
            {SCORING.map((s) => (
              <span
                key={s.label}
                className={cn(
                  "flex items-center overflow-hidden px-2 whitespace-nowrap",
                  s.className,
                  s.label === "Price" ? "text-white" : "text-brand-navy",
                )}
                style={{ width: `${s.points}%` }}
              >
                {s.label} {s.points}
              </span>
            ))}
          </div>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span>PSIRA registration</span>
              <span className="text-xs text-muted-foreground">Must have</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Functionality</span>
              <span className="text-xs text-muted-foreground">60 of 100 to proceed</span>
            </li>
            {SCORING.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3">
                <span>{s.label}</span>
                <span className="text-xs text-muted-foreground">
                  {s.points} points, {s.detail}
                </span>
              </li>
            ))}
          </ul>
        </Part>

        <Part id="opp-docs" className="space-y-2 border-b bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Applicants must hold</p>
          <div className="flex flex-wrap gap-1.5">
            {["Tax compliance status", "B-BBEE certificate", "CSD registration", "Public liability cover"].map((d) => (
              <Tag key={d}>{d}</Tag>
            ))}
          </div>
        </Part>

        <Part id="opp-foot" className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-3">
          <p className="text-xs">
            <span className="font-semibold">14 SMEs</span> <span className="text-muted-foreground">matched,</span>{" "}
            <span className="font-semibold">9</span> <span className="text-muted-foreground">applied</span>
          </p>
          <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            See applicants
          </span>
        </Part>
      </div>
    </Part>
  );
}
