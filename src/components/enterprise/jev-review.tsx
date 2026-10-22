"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { Pill } from "@/components/admin/page-header";
import { formatDateTime, runMutation } from "@/components/admin/shared";
import {
  CriteriaList,
  DecisionPill,
  DocumentReadings,
  ReviewStatus,
  TrailDialog,
  TrailList,
} from "@/components/review/review-parts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { rand } from "../../../convex/lib/procurement";
import type { Evaluation } from "../../../convex/schema";

/*
 * Jev on the buyer's side: asking Jev to decide an opportunity, and for each applicant, how Jev scored it,
 * what it read from the documents, the decision and the paper trail behind it.
 */

/** Asks Jev to decide who's approved, and shows the latest decision with its trail. */
export function JevDecisionCard({
  opportunityId,
  applicants,
}: {
  opportunityId: Id<"opportunities">;
  applicants: number;
}) {
  const data = useQuery(api.review.opportunityDecisions, { opportunityId });
  const request = useMutation(api.review.requestDecision);
  const [slots, setSlots] = useState("1");
  const [confirming, setConfirming] = useState(false);

  if (data === undefined) return null;
  if (data === null) return null;
  const latest = data.runs[0];
  const running = latest?.status === "running";
  const slotsValue = Math.floor(Number(slots));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jev’s decision</CardTitle>
        <CardDescription>
          Jev checks every application’s documents, calculates price and B-BBEE points with the preferential procurement
          formulas, and decides who to approve. Every step is on the record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {latest && (
          <div className="rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {latest.status === "running" && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Spinner className="size-3.5" />
                  Jev is deciding
                </span>
              )}
              {latest.status === "decided" && (
                <Pill tone="success">
                  {latest.approved} of up to {latest.slots} approved
                </Pill>
              )}
              {latest.status === "failed" && <Pill tone="danger">Decision failed</Pill>}
              <span className="text-muted-foreground">
                Asked by {latest.requestedBy}, {formatDateTime(latest.at)}
                {latest.model && ` · ${latest.model}`}
              </span>
            </div>
            {latest.status === "running" && (
              <p className="mt-2 text-muted-foreground">
                Reviews still in progress finish first. This usually takes a few minutes; you can leave this page.
              </p>
            )}
            {latest.summary && <p className="mt-2">{latest.summary}</p>}
            {latest.error && <p className="mt-2 text-destructive">{latest.error}</p>}
            <div className="mt-3">
              <TrailDialog
                entries={data.trail}
                title="Decision paper trail"
                description="Every step of the latest decision, newest first: points, Jev’s decisions, guardrails and changes made by people."
              />
            </div>
          </div>
        )}

        {data.canDecide ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="sm:w-48">
              <FieldLabel htmlFor="jev-slots">Applicants to approve</FieldLabel>
              <Input
                id="jev-slots"
                type="number"
                min={1}
                max={50}
                value={slots}
                onChange={(e) => setSlots(e.target.value)}
              />
            </Field>
            <Button
              disabled={running || applicants === 0 || !(slotsValue >= 1 && slotsValue <= 50)}
              onClick={() => setConfirming(true)}
            >
              {running && <Spinner />}
              {latest ? "Ask Jev to decide again" : "Ask Jev to decide"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Owners and admins in your organisation can ask Jev to decide.</p>
        )}
      </CardContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ask Jev to decide?</AlertDialogTitle>
            <AlertDialogDescription>
              Jev approves up to {slotsValue} of {applicants} applicant{applicants === 1 ? "" : "s"}. Approved
              applicants are marked awarded and the rest not successful, and they see the outcome with Jev’s reasons.
              You can change any decision afterwards, with a reason that’s kept on the record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runMutation("Jev is deciding", () => request({ opportunityId, slots: slotsValue }))}
            >
              Ask Jev
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** The review status and decision for an applicant's row. */
export function ApplicantJevStatus({
  applicant,
}: {
  applicant: {
    review: { status: "reviewing" | "reviewed" | "failed" } | null;
    decision: { outcome: "approved" | "not_approved"; overriddenBy?: string } | null;
    evaluation: Evaluation;
  };
}) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <ReviewStatus review={applicant.review} engine={applicant.evaluation.engine} />
      <DecisionPill decision={applicant.decision} />
    </span>
  );
}

/** Jev's full review of one applicant: criteria, the documents it read, the decision and the trail. */
export function ApplicantJevReview({
  applicationId,
  companyName,
  evaluation,
}: {
  applicationId: Id<"applications">;
  companyName: string;
  evaluation: Evaluation;
}) {
  const review = useQuery(api.review.applicationReview, { applicationId });
  const retry = useMutation(api.review.retryReview);

  if (review === undefined) return <Spinner className="mx-auto" />;
  if (review === null) return null;

  return (
    <div className="space-y-5 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Jev’s review</p>
        <div className="flex flex-wrap items-center gap-2">
          <ReviewStatus review={review.review} engine={evaluation.engine} />
          {review.review?.status !== "reviewing" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => runMutation("Jev is reviewing it again", () => retry({ applicationId }))}
            >
              Review again
            </Button>
          )}
          <TrailDialog
            entries={review.trail}
            title={`Paper trail: ${companyName}`}
            description="Everything that happened to this application, newest first: what Jev read, how it scored, the decision and any changes."
          />
        </div>
      </div>

      {review.decision && (
        <DecisionBox applicationId={applicationId} decision={review.decision} companyName={companyName} />
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
          <p className="text-sm font-medium">What the SME sent</p>
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
                      {f.name} · {formatBytes(f.size)}
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
          <p className="text-sm font-medium">Documents Jev read</p>
          <DocumentReadings documents={review.documents} />
        </div>
      </div>

      {review.trail.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Latest on the trail</p>
          <TrailList entries={review.trail.slice(0, 3)} />
        </div>
      )}
    </div>
  );
}

function DecisionBox({
  applicationId,
  decision,
  companyName,
}: {
  applicationId: Id<"applications">;
  decision: NonNullable<NonNullable<ReturnType<typeof useQuery<typeof api.review.applicationReview>>>["decision"]>;
  companyName: string;
}) {
  const override = useMutation(api.review.overrideDecision);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const target = decision.outcome === "approved" ? "not_approved" : "approved";

  return (
    <div className={decision.outcome === "approved" ? "rounded-lg bg-success/10 p-4" : "rounded-lg bg-muted p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <DecisionPill decision={decision} />
          {decision.rank !== undefined && <span>Ranked {decision.rank}</span>}
          {decision.totalPoints !== undefined && (
            <span className="text-muted-foreground">
              {decision.totalPoints} points
              {decision.pricePoints !== undefined && ` (price ${decision.pricePoints}`}
              {decision.bbbeePoints !== undefined && `, B-BBEE ${decision.bbbeePoints}`}
              {decision.pricePoints !== undefined && ")"}
            </span>
          )}
          {!decision.eligible && <span className="text-muted-foreground">Not eligible</span>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {target === "approved" ? "Approve instead" : "Don’t approve"}
        </Button>
      </div>
      <p className="mt-2 text-sm">{decision.rationale}</p>
      {decision.overriddenBy && (
        <p className="mt-2 text-sm text-muted-foreground">
          Changed by {decision.overriddenBy}: {decision.overrideReason}
        </p>
      )}

      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target === "approved" ? `Approve ${companyName}?` : `Don’t approve ${companyName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This changes Jev’s decision. Your name and reason go on the paper trail, and the SME sees the new outcome.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="override-reason">Reason</FieldLabel>
            <Textarea id="override-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <FieldDescription>At least a sentence: what you checked and why it changes the outcome.</FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || reason.trim().length < 10}
              onClick={async (e) => {
                e.preventDefault();
                setPending(true);
                const ok = await runMutation("Decision changed", () =>
                  override({ applicationId, outcome: target, reason }),
                );
                setPending(false);
                if (ok) {
                  setReason("");
                  setOpen(false);
                }
              }}
            >
              {pending && <Spinner />}
              Change decision
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
