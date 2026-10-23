"use client";

import { useMutation, useQuery } from "convex/react";
import { DownloadIcon } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Status } from "@/components/app/status";
import { formatDateTime, runMutation } from "@/components/admin/shared";
import {
  CriteriaList,
  DecisionPill,
  DocumentReadings,
  ReviewStatus,
  TrailDialog,
  type TrailRow,
  TrailList,
} from "@/components/review/review-parts";
import { RequirementsChecklist } from "@/components/review/requirements-checklist";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { rand } from "../../../convex/lib/procurement";
import type { ApplicationStatus, Evaluation, TenderRequirement } from "../../../convex/schema";

/*
 * Shortlisting on the buyer's side. MASLink recommends a shortlist with written reasons for every applicant;
 * the buyer then awards or declines from it, and gives a reason for each action. Everything is on the record.
 */

/** Saves a run's record as a JSON file, for audit and for anyone who asks for reasons. */
function downloadRecord(name: string, entries: TrailRow[]) {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase()}-record.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Runs shortlisting for an opportunity and shows the latest result with its record. */
export function EvaluationCard({
  opportunityId,
  applicants,
}: {
  opportunityId: Id<"opportunities">;
  applicants: number;
}) {
  const data = useQuery(api.review.opportunityDecisions, { opportunityId });
  const request = useMutation(api.review.requestDecision);
  const [slots, setSlots] = useState("3");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!data) return null;
  const latest = data.runs[0];
  const running = latest?.status === "running";
  const slotsValue = Math.floor(Number(slots));
  const valid = slotsValue >= 1 && slotsValue <= 50;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Shortlisting</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Applicants are ranked on PPPFA price and B-BBEE points after their documents are checked. Reasons are
            recorded for every applicant.
          </p>
        </div>
        {data.canDecide && (
          <div className="flex shrink-0 items-end gap-2">
            <Field className="w-28">
              <FieldLabel htmlFor="shortlist-size">Shortlist size</FieldLabel>
              <Input
                id="shortlist-size"
                type="number"
                min={1}
                max={50}
                value={slots}
                onChange={(e) => setSlots(e.target.value)}
              />
            </Field>
            <Button disabled={running || applicants === 0 || !valid} onClick={() => setConfirming(true)}>
              {running && <Spinner />}
              {latest ? "Shortlist again" : "Shortlist applicants"}
            </Button>
          </div>
        )}
      </div>

      {latest && (
        <div className="space-y-2 border-t pt-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {latest.status === "running" && (
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Spinner className="size-3.5" />
                Shortlisting
              </span>
            )}
            {latest.status === "decided" && (
              <Status tone="success">
                {latest.shortlisted} shortlisted, limit {latest.slots}
              </Status>
            )}
            {latest.status === "failed" && <Status tone="danger">Did not complete</Status>}
            <span className="text-muted-foreground">
              {latest.requestedBy}, {formatDateTime(latest.at)}
            </span>
          </div>
          {latest.status === "running" && (
            <p className="text-muted-foreground">Applications still under review are completed first.</p>
          )}
          {latest.summary && <p>{latest.summary}</p>}
          {latest.error && <p className="text-destructive">Did not complete. Run shortlisting again.</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <TrailDialog
              entries={data.trail}
              title="Shortlisting record"
              description="Each step of the latest run, newest first."
              label="View record"
            />
            {data.trail.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => downloadRecord("shortlisting", data.trail)}>
                <DownloadIcon />
                Download
              </Button>
            )}
          </div>
        </div>
      )}

      {!data.canDecide && <p className="text-sm text-muted-foreground">Owners and admins can run shortlisting.</p>}

      <Dialog open={confirming} onOpenChange={(next) => !pending && setConfirming(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shortlist applicants</DialogTitle>
            <DialogDescription>
              Up to {slotsValue} of {applicants} applicant{applicants === 1 ? "" : "s"} will be shortlisted. The others
              are marked not shortlisted. Each applicant receives the reasons. You make the final decision from the
              shortlist.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const ok = await runMutation("Shortlisting started", () =>
                  request({ opportunityId, slots: slotsValue }),
                );
                setPending(false);
                if (ok) setConfirming(false);
              }}
            >
              {pending && <Spinner />}
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The review status and shortlisting outcome for an applicant's row. */
export function ApplicantReviewStatus({
  applicant,
}: {
  applicant: {
    review: { status: "reviewing" | "reviewed" | "failed" } | null;
    decision: { outcome: "shortlisted" | "not_shortlisted"; overriddenBy?: string } | null;
    evaluation: Evaluation;
  };
}) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <ReviewStatus review={applicant.review} engine={applicant.evaluation.engine} />
      <DecisionPill decision={applicant.decision} />
    </span>
  );
}

// Withdrawing is the SME's to do, never the buyer's
type ActionStatus = Exclude<ApplicationStatus, "withdrawn">;

const ACTIONS: Record<ActionStatus, { label: string; title: string; done: string }> = {
  shortlisted: { label: "Shortlist", title: "Shortlist", done: "Shortlisted" },
  submitted: { label: "Remove from shortlist", title: "Remove from shortlist", done: "Removed from shortlist" },
  declined: { label: "Decline", title: "Decline", done: "Declined" },
  awarded: { label: "Award", title: "Award", done: "Awarded" },
};

/** An ESD programme accepts SMEs instead of awarding, straight from their application. */
const ESD_ACTIONS: Record<ActionStatus, { label: string; title: string; done: string }> = {
  ...ACTIONS,
  submitted: { label: "Reset to awaiting decision", title: "Reset", done: "Reset" },
  awarded: { label: "Accept", title: "Accept into the programme", done: "Accepted" },
};

/**
 * The buyer's actions on one applicant. Each asks for a reason, which goes on the record. Awarding is only
 * offered from the shortlist, to owners and admins; an ESD programme's owners and admins accept SMEs directly.
 */
export function ApplicantActions({
  applicationId,
  companyName,
  status,
  canAct,
  canAward,
  esd = false,
}: {
  applicationId: Id<"applications">;
  companyName: string;
  status: ApplicationStatus;
  canAct: boolean;
  canAward: boolean;
  esd?: boolean;
}) {
  const setStatus = useMutation(api.enterprise.setApplicationStatus);
  const [target, setTarget] = useState<ActionStatus | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  if (status === "awarded" || status === "withdrawn") return null;
  const accept = canAward ? (["awarded"] as const) : [];
  const actions = esd ? ESD_ACTIONS : ACTIONS;
  const options: ActionStatus[] = esd
    ? status === "declined"
      ? [...accept, "submitted"]
      : status === "shortlisted"
        ? [...accept, "submitted", "declined"]
        : [...accept, "shortlisted", "declined"]
    : status === "shortlisted"
      ? [...accept, "submitted", "declined"]
      : status === "declined"
        ? ["shortlisted"]
        : ["shortlisted", "declined"];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setPending(true);
    const ok = await runMutation(`${actions[target].done}: ${companyName}`, () =>
      setStatus({ applicationId, status: target, reason }),
    );
    setPending(false);
    if (ok) {
      setTarget(null);
      setReason("");
    }
  };

  return (
    <>
      {options.map((option, i) => (
        <Button
          key={option}
          size="sm"
          variant={i === 0 ? "default" : "outline"}
          disabled={!canAct}
          title={canAct ? undefined : "Only owners and admins in your organisation can change an applicant’s status"}
          onClick={() => setTarget(option)}
        >
          {actions[option].label}
        </Button>
      ))}

      <Dialog open={!!target} onOpenChange={(next) => !pending && !next && setTarget(null)}>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {target ? actions[target].title : ""}: {companyName}
              </DialogTitle>
              <DialogDescription>The reason is recorded on the audit log.</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="action-reason">Reason</FieldLabel>
              <Textarea
                id="action-reason"
                rows={4}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
              <FieldDescription>Refer to the evaluation criteria, points or documents.</FieldDescription>
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || reason.trim().length < 10}>
                {pending && <Spinner />}
                {target ? actions[target].label : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One applicant's review: criteria, documents read, shortlisting outcome and the record. */
export function ApplicantReview({
  applicationId,
  companyName,
  evaluation,
  requirements,
}: {
  applicationId: Id<"applications">;
  companyName: string;
  evaluation: Evaluation;
  /** The confirmed tender register, when the buyer has one. */
  requirements?: TenderRequirement[];
}) {
  const review = useQuery(api.review.applicationReview, { applicationId });
  const retry = useMutation(api.review.retryReview);

  if (review === undefined) return <Spinner className="mx-auto" />;
  if (review === null) return null;

  return (
    <div className="space-y-5 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Review</p>
        <div className="flex flex-wrap items-center gap-2">
          <ReviewStatus review={review.review} engine={evaluation.engine} />
          {review.review?.status !== "reviewing" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => runMutation("Review restarted", () => retry({ applicationId }))}
            >
              Review again
            </Button>
          )}
          <TrailDialog
            entries={review.trail}
            title={`Record: ${companyName}`}
            description="Every step for this application, newest first."
            label="View record"
          />
          {review.trail.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => downloadRecord(companyName, review.trail)}>
              <DownloadIcon />
              Download
            </Button>
          )}
        </div>
      </div>

      {review.decision && <Outcome decision={review.decision} />}

      {requirements && evaluation.requirements && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Against the tender’s requirements</p>
          <RequirementsChecklist requirements={requirements} evaluation={evaluation} audience="buyer" />
        </div>
      )}

      {evaluation.engine === "jev" && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Evaluation criteria</p>
          <CriteriaList criteria={evaluation.criteria ?? []} />
          {(evaluation.concerns ?? []).length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">Concerns</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {evaluation.concerns!.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Submission</p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Price</dt>
              <dd>{review.quote !== null ? rand(review.quote) : "No quote"}</dd>
            </div>
            {review.proposal && (
              <div>
                <dt className="text-xs text-muted-foreground">Proposal</dt>
                <dd className="whitespace-pre-line">{review.proposal}</dd>
              </div>
            )}
          </dl>
          {review.attachments.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {review.attachments.map((f) => (
                <li key={f.name} className="flex items-center justify-between gap-3 p-2.5">
                  <span className="min-w-0">
                    <span className="block font-medium">{f.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {f.name} ({formatBytes(f.size)})
                    </span>
                  </span>
                  {f.url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={f.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Documents read</p>
          <DocumentReadings documents={review.documents} />
        </div>
      </div>

      {review.trail.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Latest on the record</p>
          <TrailList entries={review.trail.slice(0, 3)} />
        </div>
      )}
    </div>
  );
}

function Outcome({
  decision,
}: {
  decision: NonNullable<NonNullable<ReturnType<typeof useQuery<typeof api.review.applicationReview>>>["decision"]>;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <DecisionPill decision={decision} />
        {decision.rank !== undefined && <span>Ranked {decision.rank}</span>}
        {decision.totalPoints !== undefined && (
          <span className="text-muted-foreground tabular-nums">
            {decision.totalPoints} points
            {decision.pricePoints !== undefined && ` (price ${decision.pricePoints}`}
            {decision.bbbeePoints !== undefined && `, B-BBEE ${decision.bbbeePoints}`}
            {decision.pricePoints !== undefined && ")"}
          </span>
        )}
        {!decision.eligible && <span className="text-muted-foreground">Not eligible</span>}
      </div>
      <p className="mt-2">{decision.rationale}</p>
      {decision.overriddenBy && (
        <p className="mt-2 text-muted-foreground">
          Changed by {decision.overriddenBy}: {decision.overrideReason}
        </p>
      )}
    </div>
  );
}
