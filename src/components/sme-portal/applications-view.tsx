"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { FilterTabs, formatDateTime } from "@/components/admin/shared";
import { useBreadcrumb } from "@/components/portal/breadcrumbs";
import { closingLabel, formatRand, KIND_LABELS, PhasePill, isFinished, phaseOf } from "@/components/enterprise/tenders";
import { DecisionPill, ReviewStatus } from "@/components/review/review-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { DOCUMENTS } from "@/lib/sme/documents";
import { formatBytes, formatDate } from "@/lib/sme/format";
import type { SmeProfile } from "@/lib/sme/types";
import { api } from "../../../convex/_generated/api";
import { evaluateApplication, type EvaluableOpportunity } from "../../../convex/lib/evaluation";
import { rand } from "../../../convex/lib/procurement";
import { ApplicationStatusPill, ApplyButton, ChecksList, FitPill, reachLabel, reachOf } from "./opportunities-shared";
import { SectionHeader } from "./require-sme";
import { OutstandingDocuments, outstandingAfterReview, outstandingBeforeApplying } from "./tender-feedback";

/** The Opportunities tab: the SME's applications, or one opportunity when the URL has ?id=. */
export function ApplicationsView({ sme }: { sme: SmeProfile }) {
  const id = useSearchParams().get("id");
  return id ? <OpportunityForSme opportunityId={id} sme={sme} /> : <ApplicationsList sme={sme} />;
}

/* ------------------------------------------------------------------------------------------------------ */
/* Applications                                                                                           */
/* ------------------------------------------------------------------------------------------------------ */

type Row = NonNullable<FunctionReturnType<typeof api.smeOpportunities.myApplications>>[number];
type Filter = "all" | "active" | "shortlisted" | "past";

const isPast = (row: Row) => isFinished(phaseOf(row.opportunity)) || row.application.status === "declined";

function matchesFilter(row: Row, filter: Filter) {
  switch (filter) {
    case "active":
      return !isPast(row);
    case "shortlisted":
      return row.application.status === "shortlisted" || row.application.status === "awarded";
    case "past":
      return isPast(row);
    default:
      return true;
  }
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function ApplicationsList({ sme }: { sme: SmeProfile }) {
  const rows = useQuery(api.smeOpportunities.myApplications);
  const [filter, setFilter] = useState<Filter>("all");

  // Requirements that held the SME back most often, so it knows what to fix first
  const commonGaps = useMemo(() => {
    const counts = new Map<string, { label: string; detail: string; count: number }>();
    for (const row of rows ?? []) {
      for (const check of row.application.evaluation.checks) {
        if (!check.required || check.passed) continue;
        const entry = counts.get(check.id) ?? { label: check.label, detail: check.detail, count: 0 };
        entry.count++;
        counts.set(check.id, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  }, [rows]);

  if (rows === undefined) return <Spinner className="mx-auto mt-24" />;
  if (rows === null) return null;

  const count = (f: Filter) => rows.filter((r) => matchesFilter(r, f)).length;
  const visible = rows.filter((r) => matchesFilter(r, filter));
  const viewed = rows.filter((r) => r.application.views > 0).length;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Opportunities"
        description={`Every tender, RFQ and grant ${sme.companyName} has applied to, and how each one is going.`}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">You haven’t applied to anything yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Your matches are open opportunities that fit your profile. Apply from there and track them here.
            </p>
            <Button className="mt-4" asChild>
              <Link href="/sme/matches">See my matches</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Applications" value={rows.length} note={`${count("active")} still open`} />
            <Stat label="Shortlisted" value={count("shortlisted")} />
            <Stat
              label="Qualified"
              value={rows.filter((r) => r.application.evaluation.qualifies).length}
              note="Met every requirement when you applied"
            />
            <Stat label="Viewed by buyers" value={viewed} note={`${rows.length - viewed} not opened yet`} />
          </div>

          {commonGaps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>What’s holding you back</CardTitle>
                <CardDescription>
                  Requirements you didn’t meet across your applications. Fixing these opens up more work.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {commonGaps.map((gap) => (
                    <li key={gap.label} className="flex items-baseline justify-between gap-4">
                      <span>
                        <span className="font-medium">{gap.label}</span>
                        <span className="block text-xs text-muted-foreground">{gap.detail}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {gap.count} application{gap.count === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/sme/documents">Update documents</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/sme/profile">Edit profile</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <FilterTabs
            label="Filter applications"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: rows.length },
              { id: "active", label: "Open", count: count("active") },
              { id: "shortlisted", label: "Shortlisted", count: count("shortlisted") },
              { id: "past", label: "Past", count: count("past") },
            ]}
          />

          <ul className="space-y-3">
            {visible.map((row) => (
              <ApplicationCard key={row.application.id} row={row} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ApplicationCard({ row }: { row: Row }) {
  const { opportunity: o, application: a } = row;
  return (
    <li className="rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link href={`/sme/opportunities?id=${o.id}`} className="block font-medium hover:underline">
            {o.title}
          </Link>
          <p className="text-sm text-muted-foreground">
            {o.organizationName}, {KIND_LABELS[o.kind]}, {o.reference}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ApplicationStatusPill status={a.status} />
          <ReviewStatus review={a.review} engine={a.evaluation.engine} />
          <PhasePill phase={phaseOf(o)} />
        </div>
      </div>
      <dl className="mt-4 grid gap-3 border-t pt-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Applied</dt>
          <dd>{formatDate(a.submittedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {a.evaluation.engine === "jev" ? "Review" : "When you applied"}
          </dt>
          <dd>{a.evaluation.qualifies ? "Qualified" : "Didn’t qualify yet"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Buyer activity</dt>
          <dd>
            {a.views === 0
              ? "Not opened yet"
              : `Opened ${a.views} time${a.views === 1 ? "" : "s"}, last ${formatDate(a.lastViewedAt ?? undefined)}`}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* One opportunity, as an SME sees it                                                                     */
/* ------------------------------------------------------------------------------------------------------ */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

const docLabel = (key: string) => DOCUMENTS.find((d) => d.key === key)?.label ?? key;

function OpportunityForSme({ opportunityId, sme }: { opportunityId: string; sme: SmeProfile }) {
  const o = useQuery(api.smeOpportunities.opportunity, { opportunityId });
  useBreadcrumb(o?.title);
  // A live check for SMEs that haven't applied, so they see their fit before applying
  const preview = useMemo(
    () => (o && !o.application ? evaluateApplication(o as EvaluableOpportunity, sme) : null),
    [o, sme],
  );

  if (o === undefined) return <Spinner className="mx-auto mt-24" />;
  if (o === null) {
    return (
      <div className="py-24 text-center">
        <p className="font-medium">This opportunity isn’t available</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have closed or been withdrawn by the buyer.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/sme/matches">Back to my matches</Link>
        </Button>
      </div>
    );
  }

  const phase = phaseOf(o);
  const a = o.application;
  const evaluation = a?.evaluation ?? preview!;

  return (
    <div className="space-y-6">
      <Button variant="link" size="sm" className="-ml-3 text-muted-foreground" asChild>
        <Link href={a ? "/sme/opportunities" : "/sme/matches"}>{a ? "All my applications" : "Back to my matches"}</Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <PhasePill phase={phase} />
          {a && <ApplicationStatusPill status={a.status} />}
          <span className="text-sm text-muted-foreground">
            {KIND_LABELS[o.kind]}, {o.reference}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{o.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {o.organizationName}, {reachLabel(reachOf(o, sme), o, sme)}
        </p>
      </div>

      {o.cancellation && (
        <div className="rounded-md border-l-4 border-l-destructive bg-destructive/10 p-4 text-sm">
          <p className="font-medium">
            {o.organizationName} cancelled this opportunity on {formatDate(o.cancellation.at)}
          </p>
          <p className="mt-1 text-muted-foreground">Their reason: {o.cancellation.reason}</p>
        </div>
      )}

      <dl className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Closes">
          {formatDate(o.closesAt)}{" "}
          <span className="text-muted-foreground">({closingLabel(o.closesAt).toLowerCase()})</span>
        </Fact>
        <Fact label="Value">{formatRand(o.value)}</Fact>
        <Fact label="Contract period">{o.contractPeriod || "Not stated"}</Fact>
        <Fact label="Minimum B-BBEE">{o.minBbbeeLevel ? `Level ${o.minBbbeeLevel}` : "None"}</Fact>
        <Fact label="Industry">{o.industry || "Any industry"}</Fact>
        <Fact label="Where">{o.provinces.length ? o.provinces.join(", ") : "Nationwide"}</Fact>
        <div className="sm:col-span-2">
          <Fact label="Documents you need">
            {o.requiredDocuments.length ? o.requiredDocuments.map(docLabel).join(", ") : "None"}
          </Fact>
        </div>
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>{a ? "Your application" : "Your fit"}</CardTitle>
          <CardDescription>
            {a
              ? a.evaluation.engine === "jev"
                ? `Reviewed on ${formatDateTime(a.evaluation.evaluatedAt)}, the same way the buyer sees it.`
                : `Checked when you applied on ${formatDateTime(a.submittedAt)}, the same way the buyer sees it.`
              : "Your profile against this opportunity’s requirements."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <FitPill evaluation={evaluation} />
          </div>
          <ChecksList evaluation={evaluation} />
          {a && <ApplicationReview application={a} />}

          {a ? (
            <ol className="space-y-2 border-t pt-4 text-sm">
              <TimelineItem at={a.submittedAt}>You applied</TimelineItem>
              {a.views > 0 && (
                <TimelineItem at={a.lastViewedAt}>
                  {o.organizationName} last opened your application ({a.views} time{a.views === 1 ? "" : "s"} so far)
                </TimelineItem>
              )}
              {a.status !== "submitted" && (
                <TimelineItem at={a.statusChangedAt}>
                  {a.status === "shortlisted"
                    ? `Shortlisted. ${o.organizationName} can now see your contact details.`
                    : a.status === "awarded"
                      ? `Awarded by ${o.organizationName}.`
                      : "Not taken further."}
                  {/* The reason given for the decision (PAJA s5) */}
                  {a.statusReason && <span className="block text-muted-foreground">Reason: {a.statusReason}</span>}
                </TimelineItem>
              )}
            </ol>
          ) : (
            !isFinished(phase) && (
              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {evaluation.qualifies
                    ? "You meet every requirement."
                    : "Requirements you don’t meet are shown to the buyer."}
                </p>
                <ApplyButton
                  opportunityId={o.id}
                  title={o.title}
                  qualifies={evaluation.qualifies}
                  scoresPrice={o.scoresPrice}
                  size="default"
                />
              </div>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents outstanding</CardTitle>
          <CardDescription>
            {a
              ? "What the buyer’s tender still needs from you, read from the documents you sent and your profile."
              : o.tender
                ? "What this tender asks for that your profile doesn’t cover yet, and the tender’s own forms to bring."
                : "Documents this opportunity asks for that your profile doesn’t have yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {a && o.tender && !a.evaluation.requirements ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Checking your documents against the tender.
            </p>
          ) : (
            <OutstandingDocuments
              items={
                a && o.tender
                  ? outstandingAfterReview(o.tender, a.evaluation)
                  : outstandingBeforeApplying(o.tender, o.requiredDocuments, sme)
              }
              applied={!!a}
              application={a ?? undefined}
              canChange={!!a && !isFinished(phase) && a.status === "submitted" && !a.decision}
            />
          )}
        </CardContent>
      </Card>

      {o.listing && (
        <Card>
          <CardHeader>
            <CardTitle>About this opportunity</CardTitle>
            <CardDescription>
              Published by {o.organizationName} on {formatDate(o.listing.publishedAt)}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <ListingItem label="Scope of work">{o.listing.scope}</ListingItem>
              <ListingItem label="Briefing session">{o.listing.briefing || "No briefing session"}</ListingItem>
              <ListingItem label="How to submit">{o.listing.submission}</ListingItem>
              <ListingItem label="How you’ll be evaluated">
                <ul className="list-disc space-y-1 pl-5">
                  {o.listing.evaluationCriteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </ListingItem>
              <ListingItem label="Enquiries">
                {o.listing.enquiriesName},{" "}
                <a href={`mailto:${o.listing.enquiriesEmail}`} className="underline underline-offset-2">
                  {o.listing.enquiriesEmail}
                </a>
              </ListingItem>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tender documents</CardTitle>
          <CardDescription>Released by {o.organizationName}. Read these before you apply.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {o.documents.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No documents released.</p>
          ) : (
            <ul className="divide-y border-t">
              {o.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{doc.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {doc.name}, {formatBytes(doc.size)}
                    </span>
                  </span>
                  {doc.url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={doc.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ListingItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

type MyApplication = NonNullable<
  NonNullable<FunctionReturnType<typeof api.smeOpportunities.opportunity>>["application"]
>;

/** Jev's review of the SME's own application: how each criterion scored, and the decision with its reasons. */
function ApplicationReview({ application: a }: { application: MyApplication }) {
  const { evaluation } = a;
  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">Review</p>
        <ReviewStatus review={a.review} engine={evaluation.engine} />
      </div>

      {a.decision && (
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionPill decision={a.decision} />
          </div>
          <p className="mt-2 text-sm">{a.decision.rationale}</p>
        </div>
      )}

      {evaluation.engine === "jev" ? (
        <>
          {(evaluation.concerns ?? []).length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">What to look at</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {evaluation.concerns!.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {a.review?.status === "reviewing"
            ? "Review in progress."
            : "Scored on eligibility rules. Document review pending."}
        </p>
      )}

      {(a.quote !== null || a.attachments.length > 0 || a.proposal) && (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {a.quote !== null && (
            <div>
              <dt className="text-xs text-muted-foreground">Your price</dt>
              <dd>{rand(a.quote)}</dd>
            </div>
          )}
          {a.attachments.length > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Documents you sent</dt>
              <dd>{a.attachments.map((f) => f.label).join(", ")}</dd>
            </div>
          )}
          {a.proposal && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Your proposal</dt>
              <dd className="whitespace-pre-line">{a.proposal}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/** One line of an application's history: the date in its own column, then what happened. */
function TimelineItem({ at, children }: { at: number | null | undefined; children: React.ReactNode }) {
  return (
    <li className="grid gap-x-4 sm:grid-cols-[10rem_1fr]">
      <span className="text-muted-foreground tabular-nums">{at ? formatDateTime(at) : ""}</span>
      <span>{children}</span>
    </li>
  );
}
