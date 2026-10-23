"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CircleXIcon, DownloadIcon, ListChecksIcon, LoaderIcon, ScrollTextIcon, UsersRoundIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DataToolbar, RefreshScope, useTableState } from "@/components/app/data-toolbar";
import { by, SortMenu, type SortStrategy, type SortValue, sortRows } from "@/components/app/sort-filter";
import { StatStrip } from "@/components/app/stat-strip";
import { Status } from "@/components/app/status";
import { KindTile } from "@/components/enterprise/tenders";
import { cleanError, plainSummary, TrailList } from "@/components/review/review-parts";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AdminPageHeader } from "./page-header";
import { FilterTabs, formatDateTime, TablePagination, usePagination } from "./shared";

type Run = NonNullable<FunctionReturnType<typeof api.review.recentDecisions>>[number];
type Filter = "all" | "decided" | "running" | "failed";

const EDGE: Record<Run["status"], string> = {
  decided: "before:bg-brand-green",
  running: "before:bg-brand-yellow",
  failed: "before:bg-brand-red",
};

const SORTS: SortStrategy<Run>[] = [
  { id: "newest", label: "Newest first", group: "Date", compare: by.number((r) => r.at, true) },
  { id: "oldest", label: "Oldest first", group: "Date", compare: by.number((r) => r.at) },
  { id: "applicants", label: "Most applicants", group: "Size", compare: by.number((r) => r.applicants, true) },
  { id: "places", label: "Most places", group: "Size", compare: by.number((r) => r.slots, true) },
  {
    id: "fill",
    label: "Fewest places filled",
    group: "Outcome",
    compare: by.number((r) => (r.slots ? (r.shortlisted ?? 0) / r.slots : 0)),
  },
  { id: "failed", label: "Failed first", group: "Outcome", compare: by.first((r) => r.status === "failed") },
  { id: "title", label: "Opportunity, A to Z", group: "Name", compare: by.text((r) => r.opportunity.title) },
  { id: "org", label: "Organisation, A to Z", group: "Name", compare: by.text((r) => r.organizationName) },
];

/** Every shortlisting run on MASLink, as cards, each opening its full record. */
export function Evaluations() {
  return (
    <RefreshScope>
      <Runs />
    </RefreshScope>
  );
}

function Runs() {
  const runs = useQuery(api.review.recentDecisions);
  const [filter, setFilter] = useTableState<Filter>("evaluations.filter", "all");
  const [search, setSearch] = useTableState("evaluations.search", "");
  const [sort, setSort] = useTableState<SortValue>("evaluations.sort", { by: "newest", then: null });
  const [openId, setOpenId] = useState<Id<"decisionRuns"> | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = (runs ?? []).filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!term ||
          [r.opportunity.title, r.opportunity.reference, r.organizationName, r.requestedBy].some((f) =>
            f.toLowerCase().includes(term),
          )),
    );
    return sortRows(rows, SORTS, sort);
  }, [runs, filter, search, sort]);

  const pagination = usePagination(visible, 12);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [filter, search, setPage]);

  const count = (f: Filter) => (runs ?? []).filter((r) => f === "all" || r.status === f).length;
  const decided = (runs ?? []).filter((r) => r.status === "decided");
  const open = openId ? ((runs ?? []).find((r) => r.id === openId) ?? null) : null;

  const exportRows = () =>
    downloadCsv("shortlisting", visible, [
      { header: "Opportunity", value: (r) => r.opportunity.title },
      { header: "Reference", value: (r) => r.opportunity.reference },
      { header: "Organisation", value: (r) => r.organizationName },
      { header: "Status", value: (r) => r.status },
      { header: "Applicants", value: (r) => r.applicants },
      { header: "Places", value: (r) => r.slots },
      { header: "Shortlisted", value: (r) => r.shortlisted ?? "" },
      { header: "Requested by", value: (r) => r.requestedBy },
      { header: "Requested", value: (r) => new Date(r.at).toISOString() },
      { header: "Summary", value: (r) => (r.summary ? plainSummary(r.summary) : "") },
      { header: "Error", value: (r) => r.error ?? "" },
    ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Evaluations" />

      <StatStrip
        items={[
          { label: "Shortlisting runs", icon: ScrollTextIcon, value: runs?.length ?? 0 },
          {
            label: "Applicants shortlisted",
            icon: ListChecksIcon,
            value: decided.reduce((n, r) => n + (r.shortlisted ?? 0), 0),
            context: `from ${decided.reduce((n, r) => n + r.applicants, 0)} applicants`,
          },
          { label: "In progress", icon: LoaderIcon, value: count("running") },
          { label: "Failed", icon: CircleXIcon, value: count("failed") },
        ]}
      />

      <DataToolbar
        filters={
          <FilterTabs
            label="Filter runs"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: count("all") },
              { id: "decided", label: "Decided", count: count("decided") },
              { id: "running", label: "In progress", count: count("running") },
              { id: "failed", label: "Failed", count: count("failed") },
            ]}
          />
        }
        controls={<SortMenu strategies={SORTS} value={sort} onChange={setSort} />}
        search={search}
        onSearch={setSearch}
        searchLabel="Search opportunity, organisation"
        onExport={exportRows}
      />

      {runs === undefined && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      )}
      {runs !== undefined && visible.length === 0 && (
        <p className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
          {runs?.length ? "No runs match." : "No shortlisting runs yet."}
        </p>
      )}
      <ul className="grid gap-4 lg:grid-cols-2">
        {pagination.rows.map((run) => (
          <li key={run.id}>
            <RunCard run={run} onOpen={() => setOpenId(run.id)} />
          </li>
        ))}
      </ul>
      <TablePagination pagination={pagination} noun="runs" />

      <RunRecord run={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function RunStatus({ run }: { run: Run }) {
  if (run.status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
        <Spinner className="size-3.5" />
        In progress
      </span>
    );
  }
  if (run.status === "failed") return <Status tone="danger">Failed</Status>;
  return <Status tone="success">Decided</Status>;
}

/** Filled and open shortlist places, one block each. */
function Places({ run }: { run: Run }) {
  const filled = run.shortlisted ?? 0;
  const shown = Math.min(run.slots, 12);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Shortlist</span>
        <span className="tabular-nums">
          {run.status === "decided" ? (
            <>
              <span className="text-base font-semibold">{filled}</span>
              <span className="text-muted-foreground">
                {" "}
                of {run.slots} {run.slots === 1 ? "place" : "places"} filled
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {run.slots} {run.slots === 1 ? "place" : "places"}, {run.status === "failed" ? "not decided" : "deciding"}
            </span>
          )}
        </span>
      </div>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: shown }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 flex-1 rounded-sm",
              run.status === "decided" && i < filled
                ? "bg-brand-green"
                : run.status === "failed"
                  ? "bg-brand-red/20"
                  : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function RunCard({ run, onOpen }: { run: Run; onOpen: () => void }) {
  return (
    <article
      className={cn(
        "relative flex h-full flex-col gap-4 overflow-hidden rounded-lg border bg-card p-5 pl-6",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        EDGE[run.status],
      )}
    >
      <header className="flex items-start gap-3">
        <KindTile kind={run.opportunity.kind} className="size-9 [&_svg]:size-4" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{run.opportunity.reference}</h3>
          <p className="truncate text-sm">{run.opportunity.title}</p>
          <p className="truncate text-xs text-muted-foreground">{run.organizationName}</p>
        </div>
        <RunStatus run={run} />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6">
        <Places run={run} />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UsersRoundIcon className="size-3.5" />
          <span className="tabular-nums">{run.applicants}</span> applicants
        </p>
      </div>

      {run.status === "failed" && run.error ? (
        <p className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span className="line-clamp-2">{plainSummary(cleanError(run.error))}</span>
        </p>
      ) : run.summary ? (
        <p className="line-clamp-3 text-sm text-muted-foreground">{plainSummary(run.summary)}</p>
      ) : null}

      <footer className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {run.requestedBy}, {formatDateTime(run.at)}
        </p>
        <Button size="sm" variant="outline" onClick={onOpen}>
          View record
        </Button>
      </footer>
    </article>
  );
}

function RunRecord({ run, onClose }: { run: Run | null; onClose: () => void }) {
  return (
    <Sheet open={!!run} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {run && <RecordBody run={run} />}
      </SheetContent>
    </Sheet>
  );
}

function RecordBody({ run }: { run: Run }) {
  const entries = useQuery(api.review.decisionTrail, { runId: run.id });

  const download = () => {
    const blob = new Blob([JSON.stringify({ run, trail: entries }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maslink-shortlisting-${run.opportunity.reference || run.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <SheetHeader className="gap-3 border-b p-5">
        <div className="flex items-start gap-3 pr-8">
          <KindTile kind={run.opportunity.kind} className="size-9 [&_svg]:size-4" />
          <div className="min-w-0">
            <SheetTitle className="text-base">{run.opportunity.reference}</SheetTitle>
            <p className="text-sm font-medium">{run.opportunity.title}</p>
            <SheetDescription>{run.organizationName}</SheetDescription>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-sm">
          {[
            { label: "Status", value: <RunStatus run={run} /> },
            { label: "Shortlisted", value: `${run.shortlisted ?? 0} of ${run.slots}` },
            { label: "Applicants", value: run.applicants },
          ].map((item) => (
            <div key={item.label} className="bg-card px-3 py-2">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Requested by {run.requestedBy}, {formatDateTime(run.at)}
          </p>
          <Button size="sm" variant="outline" onClick={download} disabled={!entries}>
            <DownloadIcon />
            Download
          </Button>
        </div>
      </SheetHeader>
      <div className="p-5">
        {entries === undefined ? (
          <Spinner className="mx-auto" />
        ) : !entries?.length ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <TrailList entries={entries} technical />
        )}
      </div>
    </>
  );
}
