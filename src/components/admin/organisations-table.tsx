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
} from "@/components/app/sort-filter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNow } from "@/hooks/use-now";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { downloadCsv } from "@/lib/csv";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { OrganisationInspector, VerificationPill } from "./organisation-inspector";
import { AdminPageHeader } from "./page-header";
import { FilterTabs, TablePagination, usePagination } from "./shared";

type Organisation = NonNullable<FunctionReturnType<typeof api.admin.organizations>>[number];
type Filter = "all" | "unverified" | "verified" | "rejected";
type BulkAction = "verified" | "rejected" | "unverified";

const matches = (org: Organisation, filter: Filter) => filter === "all" || org.verificationStatus === filter;

const STATUS_TEXT: Record<string, string> = {
  verified: "Verified",
  rejected: "Rejected",
  unverified: "Awaiting review",
};

const SORTS: SortStrategy<Organisation>[] = [
  { id: "newest", label: "Newest first", group: "Created", compare: by.number((o) => o.createdAt, true) },
  { id: "oldest", label: "Oldest first", group: "Created", compare: by.number((o) => o.createdAt) },
  { id: "name", label: "Name, A to Z", group: "Name", compare: by.text((o) => o.name) },
  { id: "name-desc", label: "Name, Z to A", group: "Name", compare: by.text((o) => o.name, true) },
  { id: "members", label: "Most members", group: "Size", compare: by.number((o) => o.memberCount, true) },
  { id: "members-asc", label: "Fewest members", group: "Size", compare: by.number((o) => o.memberCount) },
  { id: "teams", label: "Most teams", group: "Size", compare: by.number((o) => o.teamCount, true) },
  {
    id: "review",
    label: "Awaiting review first",
    group: "Needs attention",
    compare: by.first((o) => o.verificationStatus === "unverified"),
  },
  {
    id: "rejected",
    label: "Rejected first",
    group: "Needs attention",
    compare: by.first((o) => o.verificationStatus === "rejected"),
  },
];

function orgFacets(now: number | null): Facet<Organisation>[] {
  return [
    {
      id: "members",
      label: "Members",
      mode: "many",
      options: [
        { id: "1", label: "Just one" },
        { id: "2-5", label: "2 to 5" },
        { id: "6+", label: "6 or more" },
      ],
      match: (o, opt) =>
        opt === "1"
          ? o.memberCount <= 1
          : opt === "2-5"
            ? o.memberCount >= 2 && o.memberCount <= 5
            : o.memberCount >= 6,
    },
    {
      id: "teams",
      label: "Teams",
      mode: "many",
      options: [
        { id: "none", label: "No teams" },
        { id: "some", label: "Has teams" },
      ],
      match: (o, opt) => (opt === "none" ? o.teamCount === 0 : o.teamCount > 0),
    },
    {
      id: "note",
      label: "Review note",
      mode: "many",
      options: [
        { id: "yes", label: "Has a note" },
        { id: "no", label: "No note" },
      ],
      match: (o, opt) => (opt === "yes" ? !!o.verificationNote : !o.verificationNote),
    },
    dateFacet("created", "Created", (o) => o.createdAt, now),
  ];
}

const COPY: Record<BulkAction, { title: string; confirm: string; done: string }> = {
  verified: { title: "Verify organisations", confirm: "Verify", done: "Verified" },
  rejected: { title: "Reject organisations", confirm: "Reject", done: "Rejected" },
  unverified: { title: "Move back to review", confirm: "Move", done: "Moved to review" },
};

export function OrganisationsTable() {
  return (
    <RefreshScope>
      <Organisations />
    </RefreshScope>
  );
}

function Organisations() {
  const organizations = useQuery(api.admin.organizations);
  const setVerification = useMutation(api.admin.setOrganizationVerification);
  const { can } = useStaffPermissions();
  const params = useSearchParams();
  const [search, setSearch] = useTableState("orgs.search", "");
  const [filter, setFilter] = useTableState<Filter>("orgs.filter", (params.get("status") as Filter | null) ?? "all");
  const [sort, setSort] = useTableState<SortValue>("orgs.sort", { by: "newest", then: null });
  const [facetValue, setFacetValue] = useTableState<FilterValue>("orgs.facets", {});
  const now = useNow();
  const facets = useMemo(() => orgFacets(now), [now]);
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("id"));
  const [bulk, setBulk] = useState<BulkAction | null>(null);

  const searched = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (organizations ?? []).filter(
      (o) =>
        matches(o, filter) && (!term || o.name.toLowerCase().includes(term) || o.slug.toLowerCase().includes(term)),
    );
  }, [organizations, search, filter]);
  const faceted = useFacets(searched, facets, facetValue);
  const visible = useMemo(() => sortRows(faceted.rows, SORTS, sort), [faceted.rows, sort]);

  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [search, filter, facetValue, setPage]);
  const selection = useSelection(useMemo(() => visible.map((o) => o.id), [visible]));
  const chosen = visible.filter((o) => selection.has(o.id));

  const count = (f: Filter) => (organizations ?? []).filter((o) => matches(o, f)).length;

  const exportRows = () =>
    downloadCsv("organisations", chosen.length ? chosen : visible, [
      { header: "Organisation", value: (o) => o.name },
      { header: "Slug", value: (o) => o.slug },
      { header: "Status", value: (o) => STATUS_TEXT[o.verificationStatus] ?? o.verificationStatus },
      { header: "Members", value: (o) => o.memberCount },
      { header: "Teams", value: (o) => o.teamCount },
      { header: "Note", value: (o) => o.verificationNote ?? "" },
      { header: "Created", value: (o) => new Date(o.createdAt).toISOString().slice(0, 10) },
    ]);

  const runAction = async (status: BulkAction, note: string) => {
    await runBulk(
      chosen.filter((o) => o.verificationStatus !== status),
      (o) => setVerification({ organizationId: o.id, status, note: note || undefined }),
      { done: COPY[status].done, noun: "organisation" },
    );
    selection.clear();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Organisations" />

      <DataToolbar
        filters={
          <FilterTabs
            label="Filter organisations"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: count("all") },
              { id: "unverified", label: "Awaiting review", count: count("unverified") },
              { id: "verified", label: "Verified", count: count("verified") },
              { id: "rejected", label: "Rejected", count: count("rejected") },
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
        searchLabel="Search organisations"
        onExport={exportRows}
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">
                <SelectAllCheckbox selection={selection} label="Select all organisations" />
              </TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Members</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Teams</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations === undefined &&
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {organizations !== undefined && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {organizations?.length ? "No organisations match." : "No organisations yet."}
                </TableCell>
              </TableRow>
            )}
            {pagination.rows.map((org) => (
              <TableRow
                key={org.id}
                data-state={selection.has(org.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => setSelectedId(org.id)}
              >
                <TableCell className="pl-4">
                  <RowCheckbox selection={selection} id={org.id} label={`Select ${org.name}`} />
                </TableCell>
                <TableCell className="max-w-72">
                  <button type="button" className="w-full text-left" aria-label={`Open ${org.name}`}>
                    <Identity name={org.name} detail={`@${org.slug}`} />
                  </button>
                </TableCell>
                <TableCell>
                  <VerificationPill status={org.verificationStatus} />
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{org.memberCount}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{org.teamCount}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatDate(org.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination pagination={pagination} noun="organisations" />

      <BulkBar selection={selection} noun="organisation">
        {(["verified", "rejected", "unverified"] as const).map((status) => (
          <Button
            key={status}
            size="sm"
            variant="outline"
            disabled={!can({ organization: ["verify"] })}
            onClick={() => setBulk(status)}
          >
            {COPY[status].confirm === "Move" ? "Back to review" : COPY[status].confirm}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={exportRows}>
          Export
        </Button>
      </BulkBar>

      {bulk && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setBulk(null)}
          title={`${COPY[bulk].title} (${chosen.length})`}
          description={bulk === "rejected" ? "Rejected organisations can’t publish opportunities." : undefined}
          confirmLabel={COPY[bulk].confirm}
          destructive={bulk === "rejected"}
          reason={{ label: "Note for other staff", required: bulk === "rejected" }}
          onConfirm={(note) => runAction(bulk, note)}
        />
      )}

      <OrganisationInspector organizationId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
