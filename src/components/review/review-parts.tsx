"use client";

import type { FunctionReturnType } from "convex/server";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Pill } from "@/components/admin/page-header";
import { formatDateTime } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { api } from "../../../convex/_generated/api";
import type { ApplicationDecision, CriterionAssessment, TrailKind } from "../../../convex/schema";

/*
 * Pieces of Jev's review shared by the buyer's applicant view, the SME's application page and the admin
 * area: how each criterion was scored, what Jev read from the documents, and the paper trail.
 */

type Review = { status: "reviewing" | "reviewed" | "failed"; error?: string } | null | undefined;

/** Where Jev's review of an application is up to. */
export function ReviewStatus({ review, engine }: { review: Review; engine: "rules" | "jev" }) {
  if (review?.status === "reviewing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3" />
        Reviewing documents
      </span>
    );
  }
  if (review?.status === "failed") return <Pill tone="warning">Review failed</Pill>;
  if (engine === "jev") return <Pill tone="info">Reviewed</Pill>;
  return <Pill>Rules check only</Pill>;
}

export function DecisionPill({
  decision,
}: {
  decision: Pick<ApplicationDecision, "outcome" | "overriddenBy"> | null | undefined;
}) {
  if (!decision) return null;
  return decision.outcome === "approved" ? (
    <Pill tone="success">{decision.overriddenBy ? "Approved (changed)" : "Approved"}</Pill>
  ) : (
    <Pill tone="danger">{decision.overriddenBy ? "Not approved (changed)" : "Not approved"}</Pill>
  );
}

const KIND_LABELS: Record<CriterionAssessment["kind"], string> = {
  gate: "Requirement",
  functionality: "Functionality",
  price: "Price",
  bbbee: "B-BBEE",
  assessed: "Assessed",
};

function criterionResult(c: CriterionAssessment) {
  if (c.kind === "price") return { text: "Calculated from quotes", tone: "text-muted-foreground" };
  if (c.kind === "bbbee") {
    if (c.met === false) return { text: "Level not supported", tone: "text-destructive" };
    return { text: "Calculated from level", tone: "text-muted-foreground" };
  }
  if (c.kind === "gate")
    return c.met ? { text: "Met", tone: "text-success" } : { text: "Not met", tone: "text-destructive" };
  const minimum = c.kind === "functionality" ? (c.points ?? 0) : 0;
  const passed = (c.score ?? 0) >= minimum;
  return {
    text: `${c.score ?? 0}/100${minimum ? ` (min ${minimum})` : ""}`,
    tone: minimum && !passed ? "text-destructive" : "text-foreground",
  };
}

/** Each of the buyer's criteria with Jev's result, reasoning and evidence. */
export function CriteriaList({ criteria }: { criteria: CriterionAssessment[] }) {
  if (criteria.length === 0)
    return <p className="text-sm text-muted-foreground">The buyer didn’t list evaluation criteria.</p>;
  return (
    <ul className="space-y-3">
      {criteria.map((c) => {
        const result = criterionResult(c);
        return (
          <li key={c.criterion} className="text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium">
                {c.criterion}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{KIND_LABELS[c.kind]}</span>
              </span>
              <span className={cn("shrink-0 text-xs font-medium tabular-nums", result.tone)}>{result.text}</span>
            </div>
            <p className="mt-0.5 text-muted-foreground">{c.reasoning}</p>
            {c.evidence.length > 0 && (
              <ul className="mt-1 space-y-0.5 border-l-2 pl-3 text-xs text-muted-foreground">
                {c.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type Reading = NonNullable<FunctionReturnType<typeof api.review.applicationReview>>["documents"][number];

/** What Jev read from each document, with the issues it found. Expands to show fields and the text. */
export function DocumentReadings({ documents }: { documents: Reading[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (documents.length === 0) return <p className="text-sm text-muted-foreground">No documents read yet.</p>;

  return (
    <ul className="divide-y rounded-lg border">
      {documents.map((d) => {
        const expanded = open === d.key;
        return (
          <li key={d.key} className="p-3 text-sm">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : d.key)}
            >
              <span className="min-w-0">
                <span className="font-medium">{d.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {d.source === "application" ? "Sent with the application" : "From the profile"}, {d.name}
                </span>
                <span className="mt-0.5 block text-muted-foreground">{d.summary}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {d.status === "unreadable" ? (
                  <Pill tone="warning">Unreadable</Pill>
                ) : d.issues.length > 0 ? (
                  <Pill tone="danger">
                    {d.issues.length} issue{d.issues.length === 1 ? "" : "s"}
                  </Pill>
                ) : (
                  <Pill tone="success">No issues</Pill>
                )}
                <ChevronDownIcon
                  className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
                />
              </span>
            </button>
            {expanded && (
              <div className="mt-3 space-y-3">
                {d.issues.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-destructive">
                    {d.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
                {d.fields.length > 0 && (
                  <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                    {d.fields.map((f) => (
                      <div key={f.name} className="contents">
                        <dt className="text-muted-foreground">{f.name}</dt>
                        <dd>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="text-xs text-muted-foreground">
                  Read as: {d.documentType}
                  {d.matchesLabel ? "" : ` (uploaded as ${d.label})`}
                </p>
                {d.excerpt && d.excerpt !== "(image)" && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Text that was read</summary>
                    <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-muted p-3 font-sans whitespace-pre-wrap">
                      {d.excerpt}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type TrailRow = {
  id: string;
  at: number;
  kind: TrailKind;
  actor: string;
  summary: string;
  details: string[];
  model: string | null;
  costUsd: number | null;
  generationId: string | null;
};

const TRAIL_LABELS: Record<TrailKind, string> = {
  submitted: "Application",
  extraction: "Document read",
  assessment: "Scored",
  decision_started: "Decision requested",
  points: "Points",
  decision: "Decision",
  guardrail: "Guardrail",
  override: "Changed by a person",
  error: "Error",
};

/** Trail entries written before the review was renamed say "Jev"; show them the way new ones read. */
const actorName = (actor: string) => (actor === "Jev" ? "Automated review" : actor);

/**
 * The paper trail as a timeline. `technical` adds which model answered and what it cost, for YES Hub staff;
 * buyers and SMEs don't need the implementation details.
 */
export function TrailList({ entries, technical = false }: { entries: TrailRow[]; technical?: boolean }) {
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="border-l-2 pl-3 text-sm">
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span className="tabular-nums">{formatDateTime(e.at)}</span>
            <span className="font-medium text-foreground/80">{TRAIL_LABELS[e.kind]}</span>
            <span>{actorName(e.actor)}</span>
            {technical && e.model && <code>{e.model}</code>}
            {technical && e.costUsd !== null && <span className="tabular-nums">${e.costUsd.toFixed(4)}</span>}
          </p>
          <p
            className={cn(
              e.kind === "guardrail" || e.kind === "error" ? "text-destructive" : "",
              e.kind === "override" && "font-medium",
            )}
          >
            {e.summary}
          </p>
          {e.details.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {e.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A button that opens the full trail in a dialog. */
export function TrailDialog({
  entries,
  title,
  description,
  label = "Paper trail",
}: {
  entries: TrailRow[] | null | undefined;
  title: string;
  description: string;
  label?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!entries?.length}>
          {label}
          {entries?.length ? ` (${entries.length})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">{entries && <TrailList entries={entries} />}</div>
      </DialogContent>
    </Dialog>
  );
}
