"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader, Pill } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import { CreateOrganisation } from "./create-organisation";
import { closingLabel, KIND_LABELS, percent, PhasePill, phaseOf, QualifiedShare } from "./tenders";

const isDev = process.env.NODE_ENV === "development";

type Overview = NonNullable<FunctionReturnType<typeof api.enterprise.overview>>;
type Row = Overview["opportunities"][number];

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

const VERIFICATION: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  verified: { label: "Verified", tone: "success" },
  unverified: { label: "Awaiting verification", tone: "warning" },
  rejected: { label: "Verification declined", tone: "danger" },
};

/** Open opportunities first, soonest closing first, then closed ones, most recently closed first. */
function byUrgency(a: Row, b: Row) {
  const aClosed = phaseOf(a) === "closed";
  const bClosed = phaseOf(b) === "closed";
  if (aClosed !== bClosed) return aClosed ? 1 : -1;
  return aClosed ? b.closesAt.localeCompare(a.closesAt) : a.closesAt.localeCompare(b.closesAt);
}

export function EnterpriseOverview() {
  const data = useQuery(api.enterprise.overview);

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  if (data === null) return <CreateOrganisation />;

  const { organization, opportunities } = data;
  const verification = VERIFICATION[organization.verificationStatus] ?? VERIFICATION.unverified;

  return (
    <div className="space-y-6">
      <AdminPageHeader title={organization.name} description="How your tenders, RFQs and grants are doing.">
        <Pill tone={verification.tone}>{verification.label}</Pill>
      </AdminPageHeader>

      {organization.verificationStatus !== "verified" && (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {organization.verificationStatus === "rejected"
            ? "YES Hub couldn’t verify this organisation, so it can’t publish opportunities. Contact YES Hub to resolve it."
            : "YES Hub is verifying your organisation. You’ll be able to publish opportunities once it’s approved."}
        </p>
      )}

      {opportunities.length === 0 ? <NoOpportunities /> : <Dashboard rows={opportunities} more={data.more} />}
    </div>
  );
}

function Dashboard({ rows, more }: { rows: Row[]; more: boolean }) {
  const open = rows.filter((r) => phaseOf(r) !== "closed");
  const closingThisWeek = rows.filter((r) => phaseOf(r) === "closing");
  const applications = rows.reduce((sum, r) => sum + r.applications, 0);
  const qualified = rows.reduce((sum, r) => sum + r.qualified, 0);
  const shortlisted = rows.reduce((sum, r) => sum + r.shortlisted, 0);
  // Open opportunities with applicants but none who meet the requirements
  const needsAttention = open.filter((r) => r.qualified === 0).sort(byUrgency);
  const nextClosing = [...closingThisWeek].sort(byUrgency)[0];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Opportunities listed"
          value={`${rows.length}${more ? "+" : ""}`}
          note={`${open.length} open · ${rows.length - open.length} closed`}
        />
        <Stat
          label="Applications"
          value={applications}
          note={rows.length > 0 ? `${(applications / rows.length).toFixed(1)} per opportunity on average` : undefined}
        />
        <Stat
          label="Qualifying applicants"
          value={qualified}
          note={`${percent(qualified, applications)}% meet the requirements · ${shortlisted} shortlisted`}
        />
        <Stat
          label="Closing this week"
          value={closingThisWeek.length}
          note={nextClosing ? `Next: ${nextClosing.title}` : "Nothing closes in the next 7 days"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your opportunities</CardTitle>
          <CardDescription>
            Applicants are checked against each opportunity’s requirements as they apply.
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/opportunities">View all</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <OpportunityTable rows={[...rows].sort(byUrgency).slice(0, 8)} />
        </CardContent>
      </Card>

      {needsAttention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Open opportunities with no qualifying applicant yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {needsAttention.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/opportunities?id=${r.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.applications === 0
                          ? "No applications yet"
                          : `${r.applications} applied, none meet the requirements`}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{closingLabel(r.closesAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {isDev && <RemoveSamplesButton />}
    </>
  );
}

/** Opportunities with their applicant counts. Shared by the overview and the Opportunities page. */
export function OpportunityTable({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Opportunity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Applications</TableHead>
          <TableHead>Qualify</TableHead>
          <TableHead className="pr-6 text-right">Shortlisted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const phase = phaseOf(r);
          return (
            <TableRow key={r.id}>
              <TableCell className="max-w-80 pl-6">
                <Link href={`/dashboard/opportunities?id=${r.id}`} className="block">
                  <span className="block truncate font-medium hover:underline">{r.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {KIND_LABELS[r.kind]} · {r.reference} · {r.teamName ?? "No department"}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <PhasePill phase={phase} />
                <span className="mt-1 block text-xs text-muted-foreground">{closingLabel(r.closesAt)}</span>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{r.applications}</TableCell>
              <TableCell>
                <QualifiedShare qualified={r.qualified} applications={r.applications} />
              </TableCell>
              <TableCell className="pr-6 text-right tabular-nums">{r.shortlisted}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function NoOpportunities() {
  return (
    <Card className="mx-auto mt-6 max-w-lg text-center">
      <CardHeader>
        <CardTitle>No opportunities yet</CardTitle>
        <CardDescription>
          Your tenders, RFQs and grants will appear here with how many SMEs applied and how many qualify. Publishing
          opportunities is coming next.
        </CardDescription>
      </CardHeader>
      {isDev && (
        <CardContent className="flex justify-center">
          <AddSamplesButton />
        </CardContent>
      )}
    </Card>
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
          toast.error(errorMessage(error, "Couldn’t add the sample opportunities."));
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
    <div className="text-right">
      <Button variant="link" size="sm" className="text-muted-foreground" onClick={() => remove()}>
        Dev: remove sample tenders
      </Button>
    </div>
  );
}
