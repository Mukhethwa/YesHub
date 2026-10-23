"use client";

import { DownloadIcon, ShieldCheckIcon, ShieldXIcon } from "lucide-react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminPageHeader } from "@/components/admin/page-header";
import { FilterTabs, formatDateTime, TablePagination, usePagination } from "@/components/admin/shared";
import { EmptyState } from "@/components/app/empty-state";
import { Status, Tag } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CreateOrganisation } from "./create-organisation";

/*
 * The organisation's audit log: every decision that changed an opportunity or an applicant, who made it,
 * the reason and what changed, newest first. Entries are chained by hash; the check at the top recomputes
 * the chain so an officer can show the record is complete and unaltered.
 */

type Entry = NonNullable<FunctionReturnType<typeof api.organizationAudit.list>>["entries"][number];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "opportunity", label: "Opportunities" },
  { id: "application", label: "Applicants" },
  { id: "shortlisting", label: "Shortlisting" },
  { id: "tender", label: "Tender requirements" },
  { id: "document", label: "Documents" },
  { id: "settings", label: "Settings" },
] as const;
type Category = (typeof CATEGORIES)[number]["id"];

/** Each action in plain words, for the tag beside an entry. */
const ACTION_LABELS: Record<string, string> = {
  "opportunity.created": "Draft created",
  "opportunity.edited": "Draft edited",
  "opportunity.published": "Published",
  "opportunity.amended": "Amended",
  "opportunity.closing_changed": "Closing date changed",
  "opportunity.closed": "Closed early",
  "opportunity.cancelled": "Cancelled",
  "opportunity.draft_deleted": "Draft deleted",
  "opportunity.department_changed": "Department changed",
  "application.shortlisted": "Shortlisted",
  "application.unshortlisted": "Removed from shortlist",
  "application.declined": "Declined",
  "application.awarded": "Awarded",
  "shortlisting.requested": "Shortlist requested",
  "shortlisting.recommended": "Shortlist recommended",
  "tender.read": "Tender read",
  "tender.edited": "Requirements edited",
  "tender.confirmed": "Requirements confirmed",
  "tender.removed": "Requirements removed",
  "document.released": "Document released",
  "document.removed": "Document removed",
  "settings.updated": "Settings changed",
};

/** Actions that end or reverse something, which an officer is most likely to be asked about. */
const CRUCIAL = new Set([
  "opportunity.cancelled",
  "opportunity.closed",
  "opportunity.closing_changed",
  "opportunity.amended",
  "application.awarded",
  "application.declined",
  "application.unshortlisted",
  "opportunity.draft_deleted",
  "tender.removed",
  "document.removed",
]);

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

function download(organizationName: string, entries: Entry[]) {
  const header = ["Number", "When", "Who", "Action", "About", "What happened", "Reason", "Changes", "Hash"];
  const rows = [...entries]
    .sort((a, b) => a.sequence - b.sequence)
    .map((e) => [
      String(e.sequence),
      new Date(e.at).toISOString(),
      e.actorName,
      ACTION_LABELS[e.action] ?? e.action,
      e.targetLabel,
      e.summary,
      e.reason ?? "",
      e.changes.map((c) => `${c.field}: ${c.before} -> ${c.after}`).join("; "),
      e.hash,
    ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${organizationName.replace(/[^\w-]+/g, "-").toLowerCase()}-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AuditView() {
  const params = useSearchParams();
  const opportunityId = (params.get("opportunity") as Id<"opportunities"> | null) ?? undefined;
  const data = useQuery(api.organizationAudit.list, { opportunityId });
  const integrity = useQuery(api.organizationAudit.verify);
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const visible = useMemo(() => {
    const words = search.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (category === "all" || e.action.startsWith(`${category}.`)) &&
        (!words ||
          [e.actorName, e.targetLabel, e.summary, e.reason ?? "", ...e.changes.map((c) => `${c.before} ${c.after}`)]
            .join(" ")
            .toLowerCase()
            .includes(words)),
    );
  }, [entries, category, search]);
  const pagination = usePagination(visible, 25);

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  if (data === null) return <CreateOrganisation />;

  const scoped = opportunityId && entries[0] ? entries[0].targetLabel : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Audit log"
        description={
          scoped
            ? `Everything that changed ${scoped}`
            : "Every decision that changed an opportunity or an applicant: who, when, why and what changed."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {opportunityId && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/audit">Whole organisation</Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!visible.length}
            onClick={() => download(data.organizationName, visible)}
          >
            <DownloadIcon /> Download CSV
          </Button>
        </div>
      </AdminPageHeader>

      {integrity && (
        <div className="flex items-start gap-3 rounded-lg border p-4 text-sm">
          {integrity.intact ? (
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <ShieldXIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          )}
          <p>
            {integrity.intact ? (
              <>
                <span className="font-medium">Record complete and unaltered.</span>{" "}
                <span className="text-muted-foreground">
                  All {integrity.checked} entries check out against their hashes, in order. Entries can’t be edited or
                  deleted.
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">The record doesn’t check out from entry {integrity.brokenAt}.</span>{" "}
                <span className="text-muted-foreground">
                  An entry was changed or removed outside MASLink. Contact MASLink before relying on entries from there.
                </span>
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Filter entries"
          value={category}
          onChange={setCategory}
          options={CATEGORIES.map((c) => ({
            id: c.id,
            label: c.label,
            count: c.id === "all" ? entries.length : entries.filter((e) => e.action.startsWith(`${c.id}.`)).length,
          }))}
        />
        <Input
          type="search"
          placeholder="Search people, references, reasons"
          aria-label="Search the audit log"
          className="lg:w-72"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState illustration="reviewedDocs" title={entries.length ? "No entries match" : "Nothing recorded yet"}>
          {entries.length
            ? "Try another filter or search."
            : "Publishing, amending, closing or cancelling an opportunity, and every decision on an applicant, is recorded here."}
        </EmptyState>
      ) : (
        <>
          <ol className="divide-y rounded-lg border">
            {pagination.rows.map((e) => (
              <li key={e.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[11rem_1fr]">
                <div className="text-xs text-muted-foreground">
                  <p className="tabular-nums">{formatDateTime(e.at)}</p>
                  <p className="font-mono">No. {e.sequence}</p>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <p className="flex flex-wrap items-center gap-2">
                    {CRUCIAL.has(e.action) ? (
                      <Status tone="warning">{ACTION_LABELS[e.action] ?? e.action}</Status>
                    ) : (
                      <Tag>{ACTION_LABELS[e.action] ?? e.action}</Tag>
                    )}
                    {e.opportunityId && !opportunityId ? (
                      <Link
                        href={`/dashboard/opportunities?id=${e.opportunityId}`}
                        className="truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        {e.targetLabel}
                      </Link>
                    ) : (
                      <span className="truncate text-xs text-muted-foreground">{e.targetLabel}</span>
                    )}
                  </p>
                  <p>{e.summary}</p>
                  {e.reason && (
                    <p className="border-l-2 pl-3 text-muted-foreground">
                      <span className="font-medium text-foreground">Reason: </span>
                      {e.reason}
                    </p>
                  )}
                  {e.changes.length > 0 && (
                    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[minmax(8rem,auto)_1fr]">
                      {e.changes.map((c) => (
                        <div key={c.field} className="contents">
                          <dt className="text-muted-foreground">{c.field}</dt>
                          <dd className="min-w-0 break-words">
                            <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                              {c.before}
                            </span>{" "}
                            → {c.after}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {e.automated ? "Recorded by the automated review" : `By ${e.actorName}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <TablePagination pagination={pagination} noun="entries" />
        </>
      )}
    </div>
  );
}
