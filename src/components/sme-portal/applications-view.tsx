"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { FilterTabs, formatDateTime, runMutation } from "@/components/admin/shared";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useBreadcrumb } from "@/components/portal/breadcrumbs";
import { closingLabel, formatRand, KIND_LABELS, PhasePill, isFinished, phaseOf } from "@/components/enterprise/tenders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { DOCUMENTS } from "@/lib/sme/documents";
import { formatBytes, formatDate } from "@/lib/sme/format";
import type { SmeProfile } from "@/lib/sme/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { evaluateApplication, type EvaluableOpportunity } from "../../../convex/lib/evaluation";
import { rand } from "../../../convex/lib/procurement";
import { isEsd } from "../../../convex/lib/kinds";
import type { SmeApplicationStatus } from "../../../convex/smeOpportunities";
import {
  ApplicationStatusPill,
  OpportunityCard,
  ApplyButton,
  reachLabel,
  reachOf,
  RecommendationList,
  recommendationsFor,
} from "./opportunities-shared";
import { SectionHeader } from "./require-sme";
import { outstandingBeforeApplying } from "../../../convex/lib/outstanding";
import { AddDocumentsButton, OutstandingDocuments } from "./tender-feedback";

/*
 * The SME's Opportunities tab. An SME sees only the status of its applications (in progress, submitted or
 * withdrawn), never how the buyer rated, ranked, opened or decided on them: that stays with the buyer.
 */

/** The Opportunities tab: the SME's applications, or one opportunity when the URL has ?id=. */
export function ApplicationsView({ sme }: { sme: SmeProfile }) {
  const id = useSearchParams().get("id");
  return id ? <OpportunityForSme opportunityId={id} sme={sme} /> : <ApplicationsList sme={sme} />;
}

/* ------------------------------------------------------------------------------------------------------ */
/* Applications                                                                                           */
/* ------------------------------------------------------------------------------------------------------ */

type Row = NonNullable<FunctionReturnType<typeof api.smeOpportunities.myApplications>>[number];
type Filter = "all" | SmeApplicationStatus;

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

  if (rows === undefined) return <Spinner className="mx-auto mt-24" />;
  if (rows === null) return null;

  const count = (f: Filter) => rows.filter((r) => f === "all" || r.status === f).length;
  const visible = rows.filter((r) => filter === "all" || r.status === filter);
  const stillOpen = rows.filter((r) => r.status === "submitted" && !isFinished(phaseOf(r.opportunity))).length;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Opportunities"
        description={`Every tender, RFQ and grant ${sme.companyName} has started or applied to.`}
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
            <Stat label="Submitted" value={count("submitted")} note={`${stillOpen} still open`} />
            <Stat label="In progress" value={count("in_progress")} note="Saved, not sent yet" />
            <Stat label="Accepted" value={count("accepted")} note="Into support programmes" />
            <Stat label="Withdrawn" value={count("withdrawn")} />
          </div>

          <FilterTabs
            label="Filter applications"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: rows.length },
              { id: "in_progress", label: "In progress", count: count("in_progress") },
              { id: "submitted", label: "Submitted", count: count("submitted") },
              { id: "accepted", label: "Accepted", count: count("accepted") },
              { id: "withdrawn", label: "Withdrawn", count: count("withdrawn") },
            ]}
          />

          <ul className="grid gap-4 lg:grid-cols-2">
            {visible.map((row) => (
              <ApplicationCard key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ApplicationCard({ row }: { row: Row }) {
  const { opportunity: o } = row;
  const finished = isFinished(phaseOf(o));
  const href = `/sme/opportunities?id=${o.id}`;
  const continuing = row.status === "in_progress" && !finished;
  return (
    <OpportunityCard
      kind={o.kind}
      reference={o.reference}
      title={o.title}
      href={href}
      subtitle={`${o.organizationName}, ${KIND_LABELS[o.kind]}`}
      status={
        <>
          <ApplicationStatusPill status={row.status} />
          <PhasePill phase={phaseOf(o)} />
        </>
      }
      facts={[
        {
          label: { in_progress: "Last saved", submitted: "Submitted", accepted: "Accepted", withdrawn: "Withdrawn" }[
            row.status
          ],
          value: formatDate(row.at),
        },
        { label: finished ? "Closed" : "Closes", value: formatDate(o.closesAt), note: closingLabel(o.closesAt) },
        { label: "Value", value: formatRand(o.value) },
      ]}
      actions={
        <Button size="sm" variant={continuing ? "default" : "outline"} asChild>
          <Link href={href}>{continuing ? "Continue application" : "View"}</Link>
        </Button>
      }
    />
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

type ForSme = NonNullable<FunctionReturnType<typeof api.smeOpportunities.opportunity>>;

function OpportunityForSme({ opportunityId, sme }: { opportunityId: string; sme: SmeProfile }) {
  const o = useQuery(api.smeOpportunities.opportunity, { opportunityId });
  useBreadcrumb(o?.reference);
  // Checked in the browser against the SME's own profile, only to suggest what would strengthen it
  const recommendations = useMemo(
    () => (o && !o.application ? recommendationsFor(evaluateApplication(o as EvaluableOpportunity, sme), o) : []),
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
  const status: SmeApplicationStatus | null = a ? a.status : o.draft ? "in_progress" : null;
  const esd = isEsd(o.kind);

  return (
    <div className="space-y-6">
      <Button variant="link" size="sm" className="-ml-3 text-muted-foreground" asChild>
        <Link href={status ? "/sme/opportunities" : esd ? "/sme/programmes" : "/sme/matches"}>
          {status ? "All my applications" : esd ? "Back to support programmes" : "Back to my matches"}
        </Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <PhasePill phase={phase} />
          {status && <ApplicationStatusPill status={status} />}
          <span className="text-sm text-muted-foreground">{KIND_LABELS[o.kind]}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{o.reference}</h1>
        <p className="mt-1 text-lg font-medium">{o.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
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
        <Fact label={esd ? "Programme length" : "Contract period"}>{o.contractPeriod || "Not stated"}</Fact>
        <Fact label="Minimum B-BBEE">{o.minBbbeeLevel ? `Level ${o.minBbbeeLevel}` : "None"}</Fact>
        <Fact label="Industry">{o.industry || "Any industry"}</Fact>
        <Fact label="Where">{o.provinces.length ? o.provinces.join(", ") : "Nationwide"}</Fact>
        <div className="sm:col-span-2">
          <Fact label="Documents you need">
            {o.requiredDocuments.length ? o.requiredDocuments.map(docLabel).join(", ") : "None"}
          </Fact>
        </div>
      </dl>

      {a ? (
        <YourApplication opportunity={o} application={a} />
      ) : (
        <BeforeYouApply opportunity={o} recommendations={recommendations} />
      )}

      {o.tender && a?.status !== "withdrawn" && (
        <Card>
          <CardHeader>
            <CardTitle>Documents outstanding</CardTitle>
            <CardDescription>
              {a
                ? "What the buyer’s tender still needs from you, from the documents you sent and your profile."
                : "What this tender asks for that your profile doesn’t cover yet, and the tender’s own forms to bring."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {a && !o.outstanding ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Checking your documents against the tender.
              </p>
            ) : (
              <OutstandingDocuments
                // Before applying, the tips above cover the profile; this adds what the tender itself asks for
                items={o.outstanding ?? outstandingBeforeApplying(o.tender, [], sme)}
                applied={!!a}
                application={a ?? undefined}
                canChange={!!a && a.status === "submitted" && !isFinished(phaseOf(o))}
              />
            )}
          </CardContent>
        </Card>
      )}

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
              <ListingItem label={esd ? "What it offers" : "Scope of work"}>{o.listing.scope}</ListingItem>
              <ListingItem label="Briefing session">{o.listing.briefing || "No briefing session"}</ListingItem>
              <ListingItem label="How to submit">{o.listing.submission}</ListingItem>
              <ListingItem label={esd ? "Who it’s for" : "How you’ll be evaluated"}>
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

/** Before the SME sends an application: what would strengthen it, and applying or finishing a saved one. */
function BeforeYouApply({
  opportunity: o,
  recommendations,
}: {
  opportunity: ForSme;
  recommendations: ReturnType<typeof recommendationsFor>;
}) {
  const discard = useMutation(api.smeOpportunities.discardDraft);
  const [confirming, setConfirming] = useState(false);
  const finished = isFinished(phaseOf(o));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{o.draft ? "Your application, in progress" : "Before you apply"}</CardTitle>
        <CardDescription>
          {recommendations.length
            ? "Ways to strengthen your application, from your profile."
            : "Your profile covers what this opportunity asks for."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {recommendations.length > 0 && <RecommendationList recommendations={recommendations} />}

        {o.draft && <WhatYouSent sent={o.draft} />}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {finished
              ? o.draft
                ? "This opportunity closed before you sent your application."
                : "This opportunity has closed."
              : o.draft
                ? `Saved on ${formatDateTime(o.draft.updatedAt)}. The buyer sees nothing until you send it.`
                : "Save your application to finish later, or send it when it’s ready."}
          </p>
          <div className="flex shrink-0 gap-2">
            {o.draft && (
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Discard
              </Button>
            )}
            {!finished && (
              <ApplyButton
                opportunityId={o.id}
                title={o.title}
                scoresPrice={o.scoresPrice}
                saved={o.draft}
                size="default"
                esd={isEsd(o.kind)}
              />
            )}
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Discard this application?"
        description="Everything you saved for it, including documents, is deleted. The buyer never saw it."
        confirmLabel="Discard"
        destructive
        onConfirm={() => runMutation("Application discarded.", () => discard({ opportunityId: o.id }))}
      />
    </Card>
  );
}

/** A sent application: its status, what was sent, and adding documents or withdrawing while it's open. */
function YourApplication({
  opportunity: o,
  application: a,
}: {
  opportunity: ForSme;
  application: NonNullable<ForSme["application"]>;
}) {
  const withdraw = useMutation(api.smeOpportunities.withdraw);
  const [confirming, setConfirming] = useState(false);
  const canChange = a.status === "submitted" && !isFinished(phaseOf(o));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your application</CardTitle>
        <CardDescription>
          {a.status === "withdrawn"
            ? "You withdrew this application, so the buyer no longer considers it."
            : a.status === "accepted"
              ? `${o.organizationName} accepted you into this programme. They’ll contact you about the next steps.`
              : `Sent to ${o.organizationName}. ${
                  isEsd(o.kind)
                    ? "You’ll see here when you’re accepted into the programme."
                    : "The buyer contacts you directly if they want to take it further."
                }`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="space-y-2 text-sm">
          <TimelineItem at={a.submittedAt}>You sent your application</TimelineItem>
          {a.acceptedAt && <TimelineItem at={a.acceptedAt}>Accepted into the programme</TimelineItem>}
          {a.withdrawnAt && <TimelineItem at={a.withdrawnAt}>You withdrew it</TimelineItem>}
        </ol>

        <WhatYouSent sent={a} />

        {canChange && (
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              You can add documents or withdraw until the opportunity closes.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Withdraw
              </Button>
              <AddDocumentsButton application={a as { id: Id<"applications">; attachments: typeof a.attachments }} />
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Withdraw your application?"
        description={`${o.organizationName} will no longer consider it. You can’t apply to this opportunity again.`}
        confirmLabel="Withdraw application"
        destructive
        onConfirm={() => runMutation("Application withdrawn.", () => withdraw({ applicationId: a.id }))}
      />
    </Card>
  );
}

function WhatYouSent({
  sent,
}: {
  sent: { quote: number | null; proposal: string | null; attachments: { label: string; name: string }[] };
}) {
  if (sent.quote === null && !sent.proposal && sent.attachments.length === 0) return null;
  return (
    <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
      {sent.quote !== null && (
        <div>
          <dt className="text-xs text-muted-foreground">Your price</dt>
          <dd>{rand(sent.quote)}</dd>
        </div>
      )}
      {sent.attachments.length > 0 && (
        <div>
          <dt className="text-xs text-muted-foreground">Documents</dt>
          <dd>{sent.attachments.map((f) => f.label).join(", ")}</dd>
        </div>
      )}
      {sent.proposal && (
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Your proposal</dt>
          <dd className="whitespace-pre-line">{sent.proposal}</dd>
        </div>
      )}
    </dl>
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

/** One line of an application's history: the date in its own column, then what happened. */
function TimelineItem({ at, children }: { at: number | null | undefined; children: React.ReactNode }) {
  return (
    <li className="grid gap-x-4 sm:grid-cols-[10rem_1fr]">
      <span className="text-muted-foreground tabular-nums">{at ? formatDateTime(at) : ""}</span>
      <span>{children}</span>
    </li>
  );
}
