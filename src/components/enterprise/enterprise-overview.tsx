"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BadgeCheckIcon, BriefcaseBusinessIcon, CalendarClockIcon, InboxIcon, ShieldAlertIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { BarChart } from "@/components/app/bar-chart";
import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/section";
import { StatStrip } from "@/components/app/stat-strip";
import { Status } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Part } from "@/components/scene-parts";
import { errorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import { CreateOrganisation } from "./create-organisation";
import { closingLabel, KindTile, percent, PhasePill, isFinished, phaseOf, QualifiedShare } from "./tenders";

const isDev = process.env.NODE_ENV === "development";

type Overview = NonNullable<FunctionReturnType<typeof api.enterprise.overview>>;
type OpportunityRow = Overview["opportunities"][number];

const VERIFICATION: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  verified: { label: "Verified by MASLink", tone: "success" },
  unverified: { label: "Awaiting verification", tone: "warning" },
  rejected: { label: "Verification declined", tone: "danger" },
};

/** Open opportunities first, soonest closing first, then closed ones, most recently closed first. */
function byUrgency(a: OpportunityRow, b: OpportunityRow) {
  const aClosed = isFinished(phaseOf(a));
  const bClosed = isFinished(phaseOf(b));
  if (aClosed !== bClosed) return aClosed ? 1 : -1;
  return aClosed ? b.closesAt.localeCompare(a.closesAt) : a.closesAt.localeCompare(b.closesAt);
}

const opportunityHref = (r: OpportunityRow) => `/dashboard/opportunities?id=${r.id}`;

export function EnterpriseOverview() {
  const data = useQuery(api.enterprise.overview);

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  if (data === null) return <CreateOrganisation />;

  const { organization, opportunities } = data;
  const verification = VERIFICATION[organization.verificationStatus] ?? VERIFICATION.unverified;

  return (
    <div className="space-y-8">
      <Part id="page-heading" className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{organization.name}</h1>
        <Status tone={verification.tone}>{verification.label}</Status>
      </Part>

      {organization.verificationStatus !== "verified" && (
        // An alert, so it may be tinted (DESIGN.md)
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            {organization.verificationStatus === "rejected"
              ? "MASLink couldn’t verify this organisation, so it can’t publish listings. Contact MASLink to resolve it."
              : "MASLink is verifying your organisation. You can publish listings once it’s approved."}
          </p>
        </div>
      )}

      {opportunities.length === 0 ? <NoOpportunities /> : <Dashboard rows={opportunities} more={data.more} />}
    </div>
  );
}

function Dashboard({ rows, more }: { rows: OpportunityRow[]; more: boolean }) {
  const open = rows.filter((r) => phaseOf(r) !== "closed");
  const closingThisWeek = [...rows.filter((r) => phaseOf(r) === "closing")].sort(byUrgency);
  const applications = rows.reduce((sum, r) => sum + r.applications, 0);
  const qualified = rows.reduce((sum, r) => sum + r.qualified, 0);
  const shortlisted = rows.reduce((sum, r) => sum + r.shortlisted, 0);
  const awaitingReview = rows.reduce((sum, r) => sum + r.awaitingReview, 0);
  // Open opportunities where nobody who applied meets the requirements
  const needsAttention = open.filter((r) => r.qualified === 0).sort(byUrgency);
  const busiest = [...open].sort((a, b) => b.applications - a.applications).slice(0, 6);

  return (
    <>
      <StatStrip
        variant="brand"
        items={[
          {
            label: "Open listings",
            icon: BriefcaseBusinessIcon,
            value: open.length,
            context: `of ${rows.length}${more ? "+" : ""} listed`,
            href: "/dashboard/opportunities",
          },
          {
            label: "Applications",
            icon: InboxIcon,
            value: applications,
            context: awaitingReview ? undefined : "All reviewed",
            action: awaitingReview
              ? { label: `${awaitingReview} to review`, href: "/dashboard/opportunities" }
              : undefined,
          },
          {
            label: "Meet the requirements",
            icon: BadgeCheckIcon,
            value: `${percent(qualified, applications)}%`,
            context: `${qualified} applicants, ${shortlisted} shortlisted`,
          },
          {
            label: "Closing this week",
            icon: CalendarClockIcon,
            value: closingThisWeek.length,
            context: closingThisWeek.length ? undefined : "Nothing closes in the next 7 days",
            action: closingThisWeek[0]
              ? { label: `Next: ${closingThisWeek[0].title}`, href: opportunityHref(closingThisWeek[0]) }
              : undefined,
          },
        ]}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Section title="Applicants per listing" description="Open listings with the most applicants.">
          <div className="rounded-lg border bg-card p-5">
            <BarChart
              rows={busiest.map((r) => ({
                key: r.id,
                label: r.title,
                href: opportunityHref(r),
                segments: [
                  { value: r.qualified, className: "bg-brand-green", label: "meet the requirements" },
                  { value: r.applications - r.qualified, className: "bg-brand-blue/30", label: "don’t yet" },
                ],
              }))}
              legend={[
                { label: "Meet the requirements", className: "bg-brand-green" },
                { label: "Don’t yet", className: "bg-brand-blue/30" },
              ]}
              empty="No open listings."
            />
          </div>
        </Section>

        <Section title="Needs attention">
          {needsAttention.length === 0 ? (
            <div className="rounded-lg border bg-card">
              <EmptyState illustration="allChecked" title="Every open listing has a qualifying applicant" size="sm" />
            </div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-lg border border-l-4 border-l-warning bg-card">
              {needsAttention.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <KindTile kind={r.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.applications === 0
                        ? `No applications yet. ${closingLabel(r.closesAt)}.`
                        : `${r.applications} applied, none meet the requirements. ${closingLabel(r.closesAt)}.`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={opportunityHref(r)}>Review</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Latest listings" href="/dashboard/opportunities">
        <div className="overflow-hidden rounded-lg border bg-card">
          <OpportunityTable rows={[...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3)} />
        </div>
      </Section>

      {isDev && <RemoveSamplesButton />}
    </>
  );
}

/** Listings with their applicant counts. Shared by the overview and the Listings page. */
export function OpportunityTable({ rows }: { rows: OpportunityRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Listing</TableHead>
          <TableHead>Status</TableHead>
          {/* The number columns share one width so they sit evenly at the right */}
          <TableHead className="w-32 text-right">Applications</TableHead>
          <TableHead className="hidden w-32 text-right lg:table-cell">Qualify</TableHead>
          <TableHead className="hidden w-32 pr-4 text-right xl:table-cell">Shortlisted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="max-w-80 pl-4">
              <Link href={opportunityHref(r)} className="flex items-center gap-3">
                <KindTile kind={r.kind} />
                <span className="min-w-0">
                  <span className="block truncate font-medium hover:underline">{r.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.reference}
                    {r.teamName ? `, ${r.teamName}` : ""}
                  </span>
                </span>
              </Link>
            </TableCell>
            <TableCell>
              <PhasePill phase={phaseOf(r)} />
              <span className="mt-0.5 block text-xs text-muted-foreground">{closingLabel(r.closesAt)}</span>
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">{r.applications}</TableCell>
            <TableCell className="hidden text-right lg:table-cell">
              <QualifiedShare qualified={r.qualified} applications={r.applications} />
            </TableCell>
            <TableCell className="hidden pr-4 text-right tabular-nums xl:table-cell">{r.shortlisted}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NoOpportunities() {
  return (
    <div className="rounded-lg border bg-card">
      <EmptyState illustration="contract" title="No listings yet" action={isDev ? <AddSamplesButton /> : undefined}>
        Your tenders, RFQs and grants appear here with how many SMEs applied and how many meet your requirements.
      </EmptyState>
    </div>
  );
}

function AddSamplesButton() {
  const add = useMutation(api.enterprise.addSampleOpportunities);
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await add();
        } catch (error) {
          toast.error(errorMessage(error, "Couldn’t add the sample listings."));
        } finally {
          setPending(false);
        }
      }}
    >
      {pending && <Spinner />}
      Dev: add sample tenders
    </Button>
  );
}

function RemoveSamplesButton() {
  const remove = useMutation(api.enterprise.removeSampleOpportunities);
  return (
    <div className="scene-hide text-right">
      <Button variant="link" size="sm" className="text-muted-foreground" onClick={() => remove()}>
        Dev: remove sample tenders
      </Button>
    </div>
  );
}
