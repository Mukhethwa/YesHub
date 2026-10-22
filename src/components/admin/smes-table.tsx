"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Identity } from "@/components/app/avatar";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import {
  BulkBar,
  DataToolbar,
  RefreshScope,
  RowCheckbox,
  runBulk,
  SelectAllCheckbox,
  useSelection,
  useTableState,
} from "@/components/app/data-toolbar";
import {
  ActiveFilters,
  by,
  dateFacet,
  type Facet,
  FilterMenu,
  type FilterValue,
  SortMenu,
  type SortStrategy,
  type SortValue,
  sortRows,
  useFacets,
  valuesFacet,
} from "@/components/app/sort-filter";
import { Status } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNow } from "@/hooks/use-now";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { downloadCsv } from "@/lib/csv";
import { BBBEE_LEVELS, EMPLOYEE_BANDS, YEARS_TRADING } from "@/lib/sme/constants";
import { docStatus, documentProgress } from "@/lib/sme/documents";
import { formatDate } from "@/lib/sme/format";
import { getReadiness } from "@/lib/sme/readiness";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader } from "./page-header";
import { FilterTabs, TablePagination, usePagination } from "./shared";
import { SmeInspector, StatusPill } from "./sme-inspector";

type Sme = NonNullable<FunctionReturnType<typeof api.admin.smes>>[number];
type Filter = "all" | "unverified" | "verified" | "suspended" | "attention";
type BulkAction = "verify" | "unverify" | "suspend" | "reinstate";

const hasExpired = (sme: Sme) =>
  (["bbbeeCertificate", "taxCertificate"] as const).some((k) => docStatus(sme, k) === "expired");

function matches(sme: Sme, filter: Filter) {
  switch (filter) {
    case "all":
      return true;
    case "unverified":
      return !sme.verifiedAt && !sme.suspendedAt;
    case "verified":
      return !!sme.verifiedAt && !sme.suspendedAt;
    case "suspended":
      return !!sme.suspendedAt;
    case "attention": {
      const docs = documentProgress(sme);
      return docs.requiredDone < docs.requiredTotal || hasExpired(sme);
    }
  }
}

const statusText = (sme: Sme) => (sme.suspendedAt ? "Suspended" : sme.verifiedAt ? "Verified" : "Unverified");

const rank = (list: string[], value: string) => (list.includes(value) ? list.indexOf(value) : null);
const toVerify = (s: Sme) => !s.verifiedAt && !s.suspendedAt;

const SORTS: SortStrategy<Sme>[] = [
  { id: "newest", label: "Newest first", group: "Registered", compare: by.number((s) => s._creationTime, true) },
  { id: "oldest", label: "Oldest first", group: "Registered", compare: by.number((s) => s._creationTime) },
  { id: "name", label: "Name, A to Z", group: "Name", compare: by.text((s) => s.companyName) },
  { id: "name-desc", label: "Name, Z to A", group: "Name", compare: by.text((s) => s.companyName, true) },
  {
    id: "readiness",
    label: "Readiness, highest first",
    group: "Readiness",
    compare: by.number((s) => getReadiness(s).score, true),
  },
  {
    id: "readiness-asc",
    label: "Readiness, lowest first",
    group: "Readiness",
    compare: by.number((s) => getReadiness(s).score),
  },
  {
    id: "docs",
    label: "Most documents",
    group: "Readiness",
    compare: by.number((s) => documentProgress(s).done, true),
  },
  {
    id: "docs-asc",
    label: "Fewest documents",
    group: "Readiness",
    compare: by.number((s) => documentProgress(s).done),
  },
  {
    id: "bbbee",
    label: "B-BBEE level, best first",
    group: "Compliance",
    compare: by.number((s) => rank(BBBEE_LEVELS, s.bbbeeLevel)),
  },
  { id: "tax", label: "Tax clearance, expiring soonest", group: "Compliance", compare: by.text((s) => s.taxExpiry) },
  {
    id: "bbbee-expiry",
    label: "B-BBEE, expiring soonest",
    group: "Compliance",
    compare: by.text((s) => s.bbbeeExpiry),
  },
  {
    id: "years",
    label: "Longest trading",
    group: "Size",
    compare: by.number((s) => rank(YEARS_TRADING, s.yearsTrading), true),
  },
  {
    id: "employees",
    label: "Most employees",
    group: "Size",
    compare: by.number((s) => rank(EMPLOYEE_BANDS, s.employees), true),
  },
  { id: "province", label: "Province", group: "Place and sector", compare: by.text((s) => s.hqProvince) },
  { id: "industry", label: "Industry", group: "Place and sector", compare: by.text((s) => s.industry) },
  { id: "to-verify", label: "To verify first", group: "Needs attention", compare: by.first(toVerify) },
  {
    id: "issues",
    label: "Document issues first",
    group: "Needs attention",
    compare: by.first((s) => matches(s, "attention")),
  },
  { id: "suspended", label: "Suspended first", group: "Needs attention", compare: by.first((s) => !!s.suspendedAt) },
];

const readinessBand = (s: Sme) => {
  const score = getReadiness(s).score;
  return score >= 80 ? "high" : score >= 50 ? "mid" : "low";
};

function smeFacets(now: number | null, smes: Sme[]): Facet<Sme>[] {
  const docFacet = (id: string, label: string, key: "taxCertificate" | "bbbeeCertificate"): Facet<Sme> => ({
    id,
    label,
    mode: "many",
    options: [
      { id: "ok", label: "Valid" },
      { id: "expired", label: "Expired" },
      { id: "missing", label: "Missing" },
    ],
    match: (s, o) => docStatus(s, key) === o,
  });
  return [
    valuesFacet("province", "Head office", smes, (s) => s.hqProvince),
    valuesFacet("industry", "Industry", smes, (s) => s.industry),
    {
      id: "bbbee",
      label: "B-BBEE level",
      mode: "many",
      options: BBBEE_LEVELS.map((l) => ({ id: l, label: l })),
      match: (s, o) => s.bbbeeLevel === o,
    },
    {
      id: "readiness",
      label: "Readiness",
      mode: "many",
      options: [
        { id: "high", label: "80% and above" },
        { id: "mid", label: "50 to 79%" },
        { id: "low", label: "Below 50%" },
      ],
      match: (s, o) => readinessBand(s) === o,
    },
    docFacet("tax", "Tax clearance", "taxCertificate"),
    docFacet("bbbeeDoc", "B-BBEE certificate", "bbbeeCertificate"),
    {
      id: "coverage",
      label: "Coverage",
      mode: "many",
      options: [
        { id: "nationwide", label: "Nationwide" },
        { id: "provincial", label: "Selected provinces" },
      ],
      match: (s, o) => (o === "nationwide" ? s.nationwide : !s.nationwide),
    },
    {
      id: "size",
      label: "Employees",
      mode: "many",
      options: EMPLOYEE_BANDS.map((b) => ({ id: b, label: b })),
      match: (s, o) => s.employees === o,
    },
    dateFacet("registered", "Registered", (s) => s._creationTime, now),
  ];
}

const COPY: Record<BulkAction, { title: string; confirm: string; done: string }> = {
  verify: { title: "Verify SMEs", confirm: "Verify", done: "Verified" },
  unverify: { title: "Remove verification", confirm: "Remove", done: "Verification removed" },
  suspend: { title: "Suspend SMEs", confirm: "Suspend", done: "Suspended" },
  reinstate: { title: "Reinstate SMEs", confirm: "Reinstate", done: "Reinstated" },
};

export function SmesTable() {
  return (
    <RefreshScope>
      <Smes />
    </RefreshScope>
  );
}

function Smes() {
  const smes = useQuery(api.admin.smes);
  const setVerified = useMutation(api.admin.setSmeVerified);
  const setSuspended = useMutation(api.admin.setSmeSuspended);
  const { can } = useStaffPermissions();
  const params = useSearchParams();
  const [search, setSearch] = useTableState("smes.search", "");
  const [filter, setFilter] = useTableState<Filter>("smes.filter", "all");
  const [sort, setSort] = useTableState<SortValue>("smes.sort", { by: "newest", then: null });
  const [facetValue, setFacetValue] = useTableState<FilterValue>("smes.facets", {});
  const now = useNow();
  const [selectedId, setSelectedId] = useState<Id<"smes"> | null>(() => params.get("id") as Id<"smes"> | null);
  const [bulk, setBulk] = useState<BulkAction | null>(null);

  const facets = useMemo(() => smeFacets(now, smes ?? []), [now, smes]);
  const searched = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (smes ?? []).filter(
      (s) =>
        matches(s, filter) &&
        (!term ||
          [s.companyName, s.industry, s.city, s.hqProvince, s.registrationNumber, s.owner?.email ?? ""].some((field) =>
            field.toLowerCase().includes(term),
          )),
    );
  }, [smes, search, filter]);
  const faceted = useFacets(searched, facets, facetValue);
  const visible = useMemo(() => sortRows(faceted.rows, SORTS, sort), [faceted.rows, sort]);

  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [search, filter, facetValue, setPage]);
  const selection = useSelection(useMemo(() => visible.map((s) => s._id as string), [visible]));
  const chosen = visible.filter((s) => selection.has(s._id));

  const count = (f: Filter) => (smes ?? []).filter((s) => matches(s, f)).length;

  const exportRows = () =>
    downloadCsv("smes", chosen.length ? chosen : visible, [
      { header: "Company", value: (s) => s.companyName },
      { header: "Registration number", value: (s) => s.registrationNumber },
      { header: "CSD number", value: (s) => s.csdNumber },
      { header: "Industry", value: (s) => s.industry },
      { header: "City", value: (s) => s.city },
      { header: "Province", value: (s) => s.hqProvince },
      { header: "B-BBEE level", value: (s) => s.bbbeeLevel },
      { header: "Status", value: statusText },
      { header: "Readiness %", value: (s) => getReadiness(s).score },
      { header: "Documents", value: (s) => `${documentProgress(s).done}/${documentProgress(s).total}` },
      { header: "Contact", value: (s) => s.contactName },
      { header: "Email", value: (s) => s.email },
      { header: "Phone", value: (s) => s.phone },
      { header: "Registered", value: (s) => new Date(s._creationTime).toISOString().slice(0, 10) },
    ]);

  const runAction = async (action: BulkAction, reason: string) => {
    const targets = chosen.filter((s) =>
      action === "verify"
        ? !s.verifiedAt
        : action === "unverify"
          ? !!s.verifiedAt
          : action === "suspend"
            ? !s.suspendedAt
            : !!s.suspendedAt,
    );
    await runBulk(
      targets,
      (s) =>
        action === "verify" || action === "unverify"
          ? setVerified({ smeId: s._id, verified: action === "verify" })
          : setSuspended({ smeId: s._id, suspended: action === "suspend", reason: reason || undefined }),
      { done: COPY[action].done, noun: "SME" },
    );
    selection.clear();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="SMEs" />

      <DataToolbar
        filters={
          <FilterTabs
            label="Filter SMEs"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: count("all") },
              { id: "unverified", label: "To verify", count: count("unverified") },
              { id: "verified", label: "Verified", count: count("verified") },
              { id: "suspended", label: "Suspended", count: count("suspended") },
              { id: "attention", label: "Document issues", count: count("attention") },
            ]}
          />
        }
        search={search}
        onSearch={setSearch}
        controls={
          <>
            <FilterMenu facets={facets} value={facetValue} onChange={setFacetValue} counts={faceted.counts} />
            <SortMenu strategies={SORTS} value={sort} onChange={setSort} />
          </>
        }
        chips={<ActiveFilters facets={facets} value={facetValue} onChange={setFacetValue} />}
        searchLabel="Search company, place, reg no."
        onExport={exportRows}
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">
                <SelectAllCheckbox selection={selection} label="Select all SMEs" />
              </TableHead>
              <TableHead>Business</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Readiness</TableHead>
              <TableHead className="hidden sm:table-cell">Documents</TableHead>
              <TableHead className="hidden md:table-cell">Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {smes === undefined &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {smes !== undefined && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {smes?.length ? "No SMEs match." : "No SMEs yet."}
                </TableCell>
              </TableRow>
            )}
            {pagination.rows.map((sme) => {
              const { score } = getReadiness(sme);
              const docs = documentProgress(sme);
              return (
                <TableRow
                  key={sme._id}
                  data-state={selection.has(sme._id) ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(sme._id)}
                >
                  <TableCell className="pl-4">
                    <RowCheckbox selection={selection} id={sme._id} label={`Select ${sme.companyName}`} />
                  </TableCell>
                  <TableCell className="max-w-72">
                    <button type="button" className="w-full text-left" aria-label={`Open ${sme.companyName}`}>
                      <Identity name={sme.companyName} detail={`${sme.industry}${sme.isDemo ? " (sample)" : ""}`} />
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {sme.city}, {sme.hqProvince}
                  </TableCell>
                  <TableCell>
                    <StatusPill sme={sme} />
                  </TableCell>
                  <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell">{score}%</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm tabular-nums">
                        {docs.done} of {docs.total}
                      </span>
                      {hasExpired(sme) ? (
                        <Status tone="danger">Expired document</Status>
                      ) : docs.requiredDone < docs.requiredTotal ? (
                        <Status tone="warning">Missing required</Status>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDate(sme._creationTime)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TablePagination pagination={pagination} noun="SMEs" />

      <BulkBar selection={selection} noun="SME">
        <Button size="sm" variant="outline" disabled={!can({ sme: ["verify"] })} onClick={() => setBulk("verify")}>
          Verify
        </Button>
        <Button size="sm" variant="outline" disabled={!can({ sme: ["verify"] })} onClick={() => setBulk("unverify")}>
          Remove verification
        </Button>
        <Button size="sm" variant="outline" disabled={!can({ sme: ["suspend"] })} onClick={() => setBulk("suspend")}>
          Suspend
        </Button>
        <Button size="sm" variant="outline" disabled={!can({ sme: ["suspend"] })} onClick={() => setBulk("reinstate")}>
          Reinstate
        </Button>
        <Button size="sm" variant="outline" onClick={exportRows}>
          Export
        </Button>
      </BulkBar>

      {bulk && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setBulk(null)}
          title={`${COPY[bulk].title} (${chosen.length})`}
          description={bulk === "suspend" ? "Suspended SMEs are hidden from matching until reinstated." : undefined}
          confirmLabel={COPY[bulk].confirm}
          destructive={bulk === "suspend"}
          reason={bulk === "suspend" ? { required: true } : undefined}
          onConfirm={(reason) => runAction(bulk, reason)}
        />
      )}

      <SmeInspector smeId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
