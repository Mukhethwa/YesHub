"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";

import { AdminPageHeader, Pill } from "@/components/admin/page-header";
import { FilterTabs, TablePagination, usePagination } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DOCUMENTS } from "@/lib/sme/documents";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { CreateOrganisation } from "./create-organisation";
import { OpportunityTable } from "./enterprise-overview";
import { closingLabel, formatRand, KIND_LABELS, percent, PhasePill, phaseOf } from "./tenders";

type Filter = "all" | "open" | "closing" | "closed";

function matches(row: Parameters<typeof phaseOf>[0], filter: Filter) {
  const phase = phaseOf(row);
  if (filter === "all") return true;
  if (filter === "open") return phase === "open" || phase === "closing";
  return phase === filter;
}

/** The Opportunities page: the full list, or one opportunity when the URL has ?id=. */
export function OpportunitiesView() {
  const id = useSearchParams().get("id");
  return id ? <OpportunityDetail opportunityId={id} /> : <OpportunityList />;
}

function OpportunityList() {
  const data = useQuery(api.enterprise.overview);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => data?.opportunities ?? [], [data]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        matches(r, filter) &&
        (!term || r.title.toLowerCase().includes(term) || r.reference.toLowerCase().includes(term)),
    );
  }, [rows, filter, search]);

  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [filter, search, setPage]);

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  if (data === null) return <CreateOrganisation />;

  const count = (f: Filter) => rows.filter((r) => matches(r, f)).length;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Opportunities"
        description="Every tender, RFQ and grant you’ve listed, with how many SMEs applied and how many qualify."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Filter opportunities"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: count("all") },
            { id: "open", label: "Open", count: count("open") },
            { id: "closing", label: "Closing this week", count: count("closing") },
            { id: "closed", label: "Closed", count: count("closed") },
          ]}
        />
        <Input
          type="search"
          placeholder="Search by title or reference"
          aria-label="Search opportunities"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:w-72"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {visible.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "You haven’t listed any opportunities yet." : "No opportunities match."}
          </p>
        ) : (
          <OpportunityTable rows={pagination.rows} />
        )}
      </div>
      <TablePagination pagination={pagination} noun="opportunities" />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* One opportunity and its applicants                                                                     */
/* ------------------------------------------------------------------------------------------------------ */

type Detail = NonNullable<FunctionReturnType<typeof api.enterprise.opportunity>>;
type Applicant = Detail["applicants"][number];
type ApplicantFilter = "all" | "qualify" | "not";

const docLabel = (key: string) => DOCUMENTS.find((d) => d.key === key)?.label ?? key;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
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

function OpportunityDetail({ opportunityId }: { opportunityId: string }) {
  const detail = useQuery(api.enterprise.opportunity, { opportunityId });
  const [filter, setFilter] = useState<ApplicantFilter>("all");

  if (detail === undefined) return <Spinner className="mx-auto mt-24" />;
  if (detail === null) {
    return (
      <div className="py-24 text-center">
        <p className="font-medium">This opportunity isn’t available</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been removed, or it belongs to another organisation.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/dashboard/opportunities">All opportunities</Link>
        </Button>
      </div>
    );
  }

  const phase = phaseOf(detail);
  const qualifying = detail.applicants.filter((a) => a.evaluation.qualifies);
  const visible = detail.applicants.filter((a) =>
    filter === "all" ? true : filter === "qualify" ? a.evaluation.qualifies : !a.evaluation.qualifies,
  );
  const usesJev = detail.applicants.some((a) => a.evaluation.engine === "jev");

  return (
    <div className="space-y-6">
      <Button variant="link" size="sm" className="-ml-3 text-muted-foreground" asChild>
        <Link href="/dashboard/opportunities">All opportunities</Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <PhasePill phase={phase} />
          <span className="text-sm text-muted-foreground">
            {KIND_LABELS[detail.kind]} · {detail.reference}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{detail.title}</h1>
        {detail.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{detail.description}</p>}
      </div>

      <dl className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Closes">
          {formatDate(detail.closesAt)} <span className="text-muted-foreground">({closingLabel(detail.closesAt).toLowerCase()})</span>
        </Fact>
        <Fact label="Value">{formatRand(detail.value)}</Fact>
        <Fact label="Where">{detail.provinces.length ? detail.provinces.join(", ") : "Nationwide"}</Fact>
        <Fact label="Industry">{detail.industry || "Any industry"}</Fact>
        <Fact label="Minimum B-BBEE">{detail.minBbbeeLevel ? `Level ${detail.minBbbeeLevel}` : "None"}</Fact>
        <Fact label="Services">{detail.services.length ? detail.services.join(", ") : "Any"}</Fact>
        <div className="sm:col-span-2">
          <Fact label="Required documents">
            {detail.requiredDocuments.length ? detail.requiredDocuments.map(docLabel).join(", ") : "None"}
          </Fact>
        </div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Applications" value={detail.applications} />
        <Stat
          label="Qualify"
          value={detail.qualified}
          note={`${percent(detail.qualified, detail.applications)}% of applicants`}
        />
        <Stat label="Don’t qualify" value={detail.applications - detail.qualified} />
        <Stat label="Shortlisted" value={detail.shortlisted} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Applicants</CardTitle>
          <CardDescription>
            Ranked best fit first: SMEs that meet every requirement, then by score.{" "}
            {usesJev ? "Ranked by Jev." : "Checked by YES Hub’s eligibility rules until Jev ranking is connected."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          <div className="px-6">
            <FilterTabs
              label="Filter applicants"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "All", count: detail.applicants.length },
                { id: "qualify", label: "Qualify", count: qualifying.length },
                { id: "not", label: "Don’t qualify", count: detail.applicants.length - qualifying.length },
              ]}
            />
          </div>
          {visible.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">
              {detail.applicants.length === 0 ? "No SMEs have applied yet." : "No applicants in this group."}
            </p>
          ) : (
            <ApplicantTable applicants={visible} ranks={new Map(detail.applicants.map((a, i) => [a.id, i + 1]))} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicantTable({ applicants, ranks }: { applicants: Applicant[]; ranks: Map<string, number> }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 pl-6">Rank</TableHead>
          <TableHead>SME</TableHead>
          <TableHead>B-BBEE</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Result</TableHead>
          <TableHead className="pr-6 text-right">
            <span className="sr-only">Details</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {applicants.map((a) => {
          const expanded = open === a.id;
          return (
            <Fragment key={a.id}>
              <TableRow>
                <TableCell className="pl-6 font-medium tabular-nums">{ranks.get(a.id)}</TableCell>
                <TableCell className="max-w-72">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{a.sme.companyName}</span>
                    {a.sme.verified && <Pill tone="info">Verified</Pill>}
                    {a.status === "shortlisted" && <Pill tone="success">Shortlisted</Pill>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.sme.city}, {a.sme.hqProvince} · {a.sme.industry}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{a.sme.bbbeeLevel || "Not stated"}</TableCell>
                <TableCell>
                  <div className="w-24">
                    <span className="font-medium tabular-nums">{a.evaluation.score}</span>
                    <Progress value={a.evaluation.score} className="mt-1.5" aria-label={`Score ${a.evaluation.score} out of 100`} />
                  </div>
                </TableCell>
                <TableCell>
                  {a.evaluation.qualifies ? <Pill tone="success">Qualifies</Pill> : <Pill tone="danger">Doesn’t qualify</Pill>}
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : a.id)}
                  >
                    {expanded ? "Hide" : "Why"}
                  </Button>
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={6} className="px-6 py-4 whitespace-normal">
                    <ApplicantChecks applicant={a} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ApplicantChecks({ applicant }: { applicant: Applicant }) {
  const { evaluation } = applicant;
  const required = evaluation.checks.filter((c) => c.required);
  const strengths = evaluation.checks.filter((c) => !c.required);

  const list = (checks: typeof evaluation.checks) => (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.id} className="flex items-baseline justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">{c.label}</span>
            <span className="block text-xs text-muted-foreground">{c.detail}</span>
          </span>
          <span className={c.passed ? "shrink-0 text-xs font-medium text-success" : "shrink-0 text-xs font-medium text-destructive"}>
            {c.passed ? "Met" : "Not met"}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm">{evaluation.summary}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Requirements</p>
          {list(required)}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Strengths</p>
          {list(strengths)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Applied {formatDate(applicant.submittedAt)} · checked {formatDate(evaluation.evaluatedAt)}
      </p>
    </div>
  );
}
