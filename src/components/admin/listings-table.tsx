"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Status } from "@/components/app/status";
import {
  closingLabel,
  daysUntil,
  formatRand,
  KIND_LABELS,
  KindTile,
  PhasePill,
  phaseOf,
  QualifiedShare,
} from "@/components/enterprise/tenders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DOCUMENTS } from "@/lib/sme/documents";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { isEsd } from "../../../convex/lib/kinds";
import type { OpportunityKind, OpportunityStatus } from "../../../convex/schema";
import { AdminPageHeader } from "./page-header";
import { FilterTabs, formatDateTime, TablePagination, usePagination } from "./shared";

/*
 * Every listing and ESD programme on MASLink, for staff: which organisation posted it, whether SMEs can see
 * it today and why not, and its applicant figures counted the way the organisation sees them.
 */

type Row = NonNullable<FunctionReturnType<typeof api.admin.listings>>[number];
type Filter = "all" | "visible" | "hidden" | "procurement" | "esd";

/**
 * Whether SMEs can see a listing today, with the same rules as their portal: open, from a verified
 * organisation, and not past its closing date. Otherwise, why not.
 */
export function smeVisibility(listing: {
  kind: OpportunityKind;
  status: OpportunityStatus;
  closesAt: string;
  organization: { verificationStatus: string } | null;
}): { visible: boolean; reason: string } {
  const where = isEsd(listing.kind) ? "Support programmes" : "My matches";
  if (listing.status === "draft") return { visible: false, reason: "Draft, not published" };
  if (listing.status === "cancelled") return { visible: false, reason: "Cancelled by the organisation" };
  if (listing.status === "awarded") return { visible: false, reason: "Awarded" };
  if (!listing.organization) return { visible: false, reason: "Its organisation was deleted" };
  if (listing.organization.verificationStatus !== "verified") {
    return { visible: false, reason: `Organisation ${listing.organization.verificationStatus}` };
  }
  if (listing.status === "closed" || daysUntil(listing.closesAt) < 0) return { visible: false, reason: "Closed" };
  return { visible: true, reason: `Visible to SMEs in ${where}` };
}

function matches(row: Row, filter: Filter) {
  switch (filter) {
    case "visible":
      return smeVisibility(row).visible;
    case "hidden":
      return !smeVisibility(row).visible;
    case "procurement":
      return !isEsd(row.kind);
    case "esd":
      return isEsd(row.kind);
    default:
      return true;
  }
}

/** A listing's reference as its heading, its title underneath. */
function ListingName({ reference, title }: { reference: string; title: string }) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{reference}</span>
      <span className="block truncate text-xs text-muted-foreground">{title}</span>
    </span>
  );
}

export function ListingsTable() {
  const rows = useQuery(api.admin.listings);
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("id"));

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        matches(r, filter) &&
        (!term ||
          [r.reference, r.title, r.organization?.name ?? ""].some((field) => field.toLowerCase().includes(term))),
    );
  }, [rows, filter, search]);
  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [filter, search, setPage]);

  if (rows === null) return null;
  const count = (f: Filter) => (rows ?? []).filter((r) => matches(r, f)).length;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Listings"
        description="Every tender, RFQ and ESD programme on MASLink, whether SMEs can see it today, and its applicants as the organisation sees them."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Filter listings"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: count("all") },
            { id: "visible", label: "Visible to SMEs", count: count("visible") },
            { id: "hidden", label: "Hidden from SMEs", count: count("hidden") },
            { id: "procurement", label: "Tenders and RFQs", count: count("procurement") },
            { id: "esd", label: "ESD programmes", count: count("esd") },
          ]}
        />
        <Input
          type="search"
          placeholder="Search by reference, title or organisation"
          aria-label="Search listings"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:w-80"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {rows === undefined ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No organisation has published anything yet." : "No listings match."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Listing</TableHead>
                <TableHead className="hidden md:table-cell">Organisation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 text-right">Applications</TableHead>
                <TableHead className="hidden w-28 text-right lg:table-cell">Qualify</TableHead>
                <TableHead className="hidden w-32 text-right xl:table-cell">Shortlisted or accepted</TableHead>
                <TableHead className="hidden w-28 pr-4 text-right xl:table-cell">Withdrawn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.rows.map((r) => {
                const visibility = smeVisibility(r);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedId(r.id)}>
                    <TableCell className="max-w-80 pl-4">
                      <span className="flex items-center gap-3">
                        <KindTile kind={r.kind} />
                        <ListingName reference={r.reference} title={r.title} />
                      </span>
                    </TableCell>
                    <TableCell className="hidden max-w-56 md:table-cell">
                      <span className="block truncate text-sm">{r.organization?.name ?? "Deleted organisation"}</span>
                      <span className="block text-xs text-muted-foreground">{KIND_LABELS[r.kind]}</span>
                    </TableCell>
                    <TableCell>
                      <PhasePill phase={phaseOf(r)} />
                      <Status tone={visibility.visible ? "success" : "neutral"} className="mt-0.5 block">
                        {visibility.reason}
                      </Status>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{r.applications}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">
                      <QualifiedShare qualified={r.qualified} applications={r.applications} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums xl:table-cell">
                      {isEsd(r.kind) ? `${r.awarded} accepted` : `${r.shortlisted} shortlisted`}
                    </TableCell>
                    <TableCell className="hidden pr-4 text-right tabular-nums xl:table-cell">{r.withdrawn}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      <TablePagination pagination={pagination} noun="listings" />

      <ListingInspector listingId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

const docLabel = (key: string) => DOCUMENTS.find((d) => d.key === key)?.label ?? key;

function ListingInspector({ listingId, onClose }: { listingId: string | null; onClose: () => void }) {
  return (
    <Sheet open={!!listingId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {listingId && <Inspector key={listingId} listingId={listingId} />}
      </SheetContent>
    </Sheet>
  );
}

const APPLICANT_STATUS = {
  submitted: "Awaiting a decision",
  shortlisted: "Shortlisted",
  declined: "Declined",
  awarded: "Awarded",
  withdrawn: "Withdrawn by the SME",
} as const;

function Inspector({ listingId }: { listingId: string }) {
  const listing = useQuery(api.admin.listing, { opportunityId: listingId });

  if (listing === undefined) {
    return (
      <>
        <SheetTitle className="sr-only">Loading listing</SheetTitle>
        <Spinner className="m-auto mt-24" />
      </>
    );
  }
  if (listing === null) {
    return (
      <SheetHeader className="p-6">
        <SheetTitle>Listing not found</SheetTitle>
        <SheetDescription>It may have been deleted.</SheetDescription>
      </SheetHeader>
    );
  }

  const esd = isEsd(listing.kind);
  const visibility = smeVisibility(listing);
  const { counts } = listing;

  return (
    <>
      <SheetHeader className="border-b p-6">
        <SheetTitle className="text-lg">{listing.reference}</SheetTitle>
        <p className="text-base font-medium">{listing.title}</p>
        <SheetDescription>
          {KIND_LABELS[listing.kind]} from {listing.organization?.name ?? "a deleted organisation"}
        </SheetDescription>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <PhasePill phase={phaseOf(listing)} />
          <Status tone={visibility.visible ? "success" : "neutral"}>{visibility.reason}</Status>
        </div>
      </SheetHeader>

      <div className="space-y-6 p-6">
        {listing.cancellation && (
          <p className="rounded-md border-l-4 border-l-destructive bg-destructive/10 p-3 text-sm">
            Cancelled {formatDateTime(listing.cancellation.at)}: {listing.cancellation.reason}
          </p>
        )}

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Fact label="Published">{listing.publishedAt ? formatDate(listing.publishedAt) : "Not yet"}</Fact>
          <Fact label="Closes">
            {formatDate(listing.closesAt)}{" "}
            <span className="text-muted-foreground">({closingLabel(listing.closesAt).toLowerCase()})</span>
          </Fact>
          <Fact label={esd ? "Value per SME" : "Value"}>{formatRand(listing.value)}</Fact>
          <Fact label="Where">{listing.provinces.length ? listing.provinces.join(", ") : "Nationwide"}</Fact>
          <Fact label="Industry">{listing.industry || "Any industry"}</Fact>
          <Fact label="Minimum B-BBEE">{listing.minBbbeeLevel ? `Level ${listing.minBbbeeLevel}` : "None"}</Fact>
          <div className="sm:col-span-2">
            <Fact label="Required documents">
              {listing.requiredDocuments.length ? listing.requiredDocuments.map(docLabel).join(", ") : "None"}
            </Fact>
          </div>
        </dl>

        <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
          <Figure label="Applications" value={counts.applications} />
          <Figure label="Meet the requirements" value={counts.qualified} />
          <Figure label={esd ? "Accepted" : "Shortlisted"} value={esd ? counts.awarded : counts.shortlisted} />
          <Figure label="Withdrawn" value={counts.withdrawn} />
          {!esd && <Figure label="Awarded" value={counts.awarded} />}
          <Figure label="Declined" value={counts.declined} />
          <Figure label="Started, not sent" value={counts.inProgress} />
        </dl>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Applicants</h3>
          {listing.applicants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SMEs have applied yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {listing.applicants.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <span className="min-w-0">
                    <Link href={`/admin/smes?id=${a.smeId}`} className="block truncate font-medium hover:underline">
                      {a.companyName}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {a.hqProvince ? `${a.hqProvince}, ` : ""}applied {formatDate(a.submittedAt)}
                      {a.statusChangedBy && a.status !== "withdrawn" ? `, ${a.statusChangedBy}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block">
                      {esd && a.status === "awarded" ? "Accepted" : APPLICANT_STATUS[a.status]}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {a.qualifies ? "Qualifies" : "Doesn’t qualify"}, {a.score}/100
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {listing.organization && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/organisations?id=${listing.organization.id}`}>Open {listing.organization.name}</Link>
          </Button>
        )}
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
