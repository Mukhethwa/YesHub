"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AdminPageHeader, Pill } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { CreateOrganisation } from "./create-organisation";
import { ApplicantActions } from "./evaluation";
import { closingLabel, KIND_LABELS, PhasePill, phaseOf } from "./tenders";

type Row = NonNullable<FunctionReturnType<typeof api.enterprise.shortlist>>[number];

/** Every business the organisation shortlisted, across all its opportunities. */
export function ShortlistsView() {
  const rows = useQuery(api.enterprise.shortlist);
  const [opportunityId, setOpportunityId] = useState("all");

  const opportunities = useMemo(() => {
    const byId = new Map<string, Row["opportunity"] & { count: number }>();
    for (const row of rows ?? []) {
      const existing = byId.get(row.opportunity.id);
      byId.set(row.opportunity.id, { ...row.opportunity, count: (existing?.count ?? 0) + 1 });
    }
    return [...byId.values()].sort((a, b) => a.closesAt.localeCompare(b.closesAt));
  }, [rows]);

  if (rows === undefined) return <Spinner className="mx-auto mt-24" />;
  if (rows === null) return <CreateOrganisation />;

  const shown = opportunities.filter((o) => opportunityId === "all" || o.id === opportunityId);
  const businesses = new Set(rows.map((r) => r.sme.id)).size;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Shortlists"
        description={
          rows.length === 0
            ? "Businesses you shortlist from your opportunities’ applicants appear here."
            : `${businesses} business${businesses === 1 ? "" : "es"} shortlisted across ${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"}. Contact details are shared once you shortlist.`
        }
      >
        {opportunities.length > 1 && (
          <Select value={opportunityId} onValueChange={setOpportunityId}>
            <SelectTrigger className="sm:w-80" aria-label="Show opportunity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All opportunities</SelectItem>
              {opportunities.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.title} ({o.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </AdminPageHeader>

      {rows.length === 0 ? (
        <Card className="mx-auto mt-6 max-w-lg text-center">
          <CardHeader>
            <CardTitle>No one shortlisted yet</CardTitle>
            <CardDescription>
              Open an opportunity, review its applicants and choose Shortlist on the businesses you want to take
              further.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/opportunities">Review opportunities</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        shown.map((opportunity) => (
          <Card key={opportunity.id}>
            <CardHeader>
              <CardTitle>
                <Link href={`/dashboard/opportunities?id=${opportunity.id}`} className="hover:underline">
                  {opportunity.title}
                </Link>
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <PhasePill phase={phaseOf(opportunity)} />
                <span>
                  {KIND_LABELS[opportunity.kind]}, {opportunity.reference}, {closingLabel(opportunity.closesAt)}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <ShortlistTable rows={rows.filter((r) => r.opportunity.id === opportunity.id)} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function ShortlistTable({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Business</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Shortlisted</TableHead>
          <TableHead className="pr-6 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.applicationId}>
            <TableCell className="max-w-64 pl-6">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{row.sme.companyName}</span>
                {row.sme.verified && <Pill tone="info">Verified</Pill>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {row.sme.city}, {row.sme.hqProvince}, {row.sme.bbbeeLevel}
              </span>
            </TableCell>
            <TableCell>
              <span className="font-medium tabular-nums">{row.score}</span>
              <span className="block text-xs text-muted-foreground">
                {row.qualifies ? "Qualifies" : "Doesn’t qualify"}
              </span>
            </TableCell>
            <TableCell className="max-w-64 text-sm">
              <span className="block truncate">
                {row.sme.contactName}
                <span className="text-muted-foreground">, {row.sme.contactRole}</span>
              </span>
              <a href={`mailto:${row.sme.email}`} className="block truncate text-xs underline underline-offset-2">
                {row.sme.email}
              </a>
              <a href={`tel:${row.sme.phone}`} className="block text-xs text-muted-foreground">
                {row.sme.phone}
              </a>
            </TableCell>
            <TableCell className="text-sm">
              {formatDate(row.shortlistedAt)}
              {row.shortlistedBy && <span className="block text-xs text-muted-foreground">by {row.shortlistedBy}</span>}
            </TableCell>
            <TableCell className="pr-6">
              <div className="flex items-center justify-end gap-1.5">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/suppliers?id=${row.sme.id}&from=${row.opportunity.id}`}>View business</Link>
                </Button>
                <ApplicantActions
                  applicationId={row.applicationId}
                  companyName={row.sme.companyName}
                  status="shortlisted"
                  canAct
                  canAward={false}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
