"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronDownIcon, LockIcon, SearchIcon } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Pill } from "./page-header";
import { FilterTabs, formatDateTime } from "./shared";

/*
 * The command log as diffs: every mutation that changed data, who ran it, and for each document it touched,
 * each field before and after. Encrypted fields are shown decrypted to readers with access and marked.
 * Staff see every command (admin area); an enterprise sees the commands that changed its own data
 * (convex/enterpriseAudit.ts), through the same component with a different source.
 */

export type Command = FunctionReturnType<typeof api.audit.commands>["page"][number];
type ChangeRow = NonNullable<FunctionReturnType<typeof api.audit.commandChanges>>[number];

/** The queries the log reads. Both sources return the same shapes. */
export type ChangeLogSource = {
  commands: typeof api.audit.commands;
  commandChanges: typeof api.audit.commandChanges;
  documentHistory: typeof api.audit.documentHistory;
};

const STAFF_SOURCE: ChangeLogSource = {
  commands: api.audit.commands,
  commandChanges: api.audit.commandChanges,
  documentHistory: api.audit.documentHistory,
};

const SourceContext = createContext<ChangeLogSource>(STAFF_SOURCE);

/** Plain words for the actions people take, so the log reads without knowing function names. */
const ACTION_LABELS: Record<string, string> = {
  "opportunities.create": "Created an opportunity",
  "opportunities.update": "Edited an opportunity",
  "opportunities.publish": "Published an opportunity",
  "opportunities.close": "Closed an opportunity early",
  "opportunities.cancel": "Cancelled an opportunity",
  "opportunities.removeDraft": "Deleted a draft",
  "enterprise.setApplicationStatus": "Changed an applicant’s status",
  "enterprise.setOpportunityDepartment": "Moved an opportunity to a department",
  "enterprise.addOpportunityDocument": "Released a document",
  "enterprise.removeOpportunityDocument": "Removed a released document",
  "enterprise.updateOrganizationSettings": "Changed organisation settings",
  "tenders.readTender": "Had the tender read",
  "tenders.saveReading": "Tender requirements read",
  "tenders.readingFailed": "Tender reading failed",
  "tenders.saveRequirements": "Edited tender requirements",
  "tenders.confirmRequirements": "Confirmed tender requirements",
  "tenders.removeRequirements": "Removed tender requirements",
  "review.requestDecision": "Asked for a shortlist",
  "review.applyDecision": "Shortlist recommended",
  "review.calculatePoints": "Points calculated",
  "review.saveExtraction": "Document read",
  "review.saveAssessment": "Application scored",
  "review.retryReview": "Restarted a review",
  "smeOpportunities.apply": "Applied",
  "smeOpportunities.addDocuments": "Added documents to an application",
};

function actionLabel(name: string) {
  const { module, fn } = splitName(name);
  return ACTION_LABELS[`${module}.${fn}`];
}

const TABLE_LABELS: Record<string, string> = {
  smes: "SME profile",
  opportunities: "Opportunity",
  organizationSettings: "Organisation settings",
  memberPreferences: "Member preferences",
  opportunityDocuments: "Tender document",
  applications: "Application",
  documentExtractions: "Document reading",
  decisionRuns: "Evaluation",
};

const OPERATION: Record<ChangeRow["operation"], { label: string; tone: "success" | "info" | "danger" }> = {
  insert: { label: "Created", tone: "success" },
  update: { label: "Updated", tone: "info" },
  delete: { label: "Deleted", tone: "danger" },
};

type Filter = "all" | "people" | "system";

export function ChangeLog({
  source = STAFF_SOURCE,
  intro = "Every action that changed data is recorded as a command, with each document’s state before and after. Records are only ever added.",
  tables = TABLE_LABELS,
}: {
  source?: ChangeLogSource;
  intro?: string;
  /** The kinds of record to filter by. */
  tables?: Record<string, string>;
}) {
  const { results, status, loadMore } = usePaginatedQuery(source.commands, {}, { initialNumItems: 50 });
  const [filter, setFilter] = useState<Filter>("all");
  const [table, setTable] = useState("all");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return results.filter(
      (c) =>
        (filter === "all" || (filter === "people" ? !!c.actorId : !c.actorId)) &&
        (table === "all" || c.tables.includes(table)) &&
        (!term ||
          [c.name, c.actor, actionLabel(c.name) ?? "", c.reason ?? ""].some((text) =>
            text.toLowerCase().includes(term),
          )),
    );
  }, [results, filter, table, search]);

  if (status === "LoadingFirstPage") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{intro}</p>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-3">
          <FilterTabs
            label="Who"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "Everyone" },
              { id: "people", label: "People" },
              { id: "system", label: "System" },
            ]}
          />
          <FilterTabs
            label="What changed"
            value={table}
            onChange={setTable}
            options={[
              { id: "all", label: "All data" },
              ...Object.entries(tables).map(([id, label]) => ({ id, label })),
            ]}
          />
        </div>
        <InputGroup className="lg:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search action, person or reason"
            aria-label="Search changes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">
          {results.length ? "No changes match." : "Nothing has changed yet."}
        </p>
      ) : (
        <CommandList commands={visible} source={source} />
      )}

      {status !== "Exhausted" && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={status === "LoadingMore"} onClick={() => loadMore(50)}>
            {status === "LoadingMore" && <Spinner />}
            Load older changes
          </Button>
        </div>
      )}
    </div>
  );
}

/** Commands as an expandable list, for the whole log and for one opportunity's history. */
export function CommandList({ commands, source = STAFF_SOURCE }: { commands: Command[]; source?: ChangeLogSource }) {
  return (
    <SourceContext.Provider value={source}>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {commands.map((command) => (
          <CommandItem key={command.id} command={command} />
        ))}
      </ul>
    </SourceContext.Provider>
  );
}

/** "smes:update" → "smes" and "update". */
function splitName(name: string) {
  const [module, fn] = name.split(":");
  return { module: module.replace(/\.js$/, ""), fn: fn ?? "default" };
}

function CommandItem({ command }: { command: Command }) {
  const [open, setOpen] = useState(false);
  const { module, fn } = splitName(command.name);

  return (
    <li>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0 space-y-1">
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{command.actor}</span>
            {actionLabel(command.name) ? (
              <span>{actionLabel(command.name)}</span>
            ) : (
              <span className="text-muted-foreground">ran</span>
            )}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {module}.<span className="font-semibold">{fn}</span>
            </code>
            {command.visibility === "internal" && <Pill>Internal</Pill>}
          </span>
          {command.reason && (
            <span className="block border-l-2 pl-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Reason: </span>
              {command.reason}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="tabular-nums">{formatDateTime(command.at)}</span>
            <span>
              {command.changeCount} change{command.changeCount === 1 ? "" : "s"} to{" "}
              {command.tables.map((t) => TABLE_LABELS[t] ?? t).join(", ")}
            </span>
          </span>
        </span>
        <ChevronDownIcon
          className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t bg-muted/30 px-4 py-4">
          <CommandChanges commandId={command.id} />
        </div>
      )}
    </li>
  );
}

function CommandChanges({ commandId }: { commandId: Id<"commands"> }) {
  const source = useContext(SourceContext);
  const changes = useQuery(source.commandChanges, { commandId });
  if (changes === undefined) return <Spinner className="mx-auto" />;
  if (!changes?.length) return <p className="text-sm text-muted-foreground">No changes recorded.</p>;
  return (
    <div className="space-y-4">
      {changes.map((change) => (
        <ChangeDiff key={change.id} change={change} />
      ))}
    </div>
  );
}

/** A label for the document, from whichever naming field it has. */
function documentLabel(change: ChangeRow) {
  const doc = change.after ?? change.before ?? {};
  const name = doc.companyName ?? doc.title ?? doc.label ?? doc.name;
  return typeof name === "string" ? name : null;
}

export function ChangeDiff({ change, showHistory = true }: { change: ChangeRow; showHistory?: boolean }) {
  const op = OPERATION[change.operation];
  const label = documentLabel(change);
  // Updates show what changed; creates and deletes show the whole record
  const fields =
    change.operation === "update"
      ? change.fields
      : Object.keys((change.after ?? change.before) as Record<string, unknown>).sort();

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <Pill tone={op.tone}>{op.label}</Pill>
          <span className="font-medium">{TABLE_LABELS[change.table] ?? change.table}</span>
          {label && <span className="truncate text-muted-foreground">{label}</span>}
          <code className="text-xs text-muted-foreground">{change.documentId}</code>
        </div>
        {showHistory && <DocumentHistory table={change.table} documentId={change.documentId} title={label} />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="w-40 px-3 py-1.5 text-left font-medium">Field</th>
              {change.operation !== "insert" && <th className="px-3 py-1.5 text-left font-medium">Before</th>}
              {change.operation !== "delete" && <th className="px-3 py-1.5 text-left font-medium">After</th>}
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field} className="border-b align-top last:border-0">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5 font-mono text-xs">
                    {field}
                    {change.encryptedFields.includes(field) && (
                      <LockIcon className="size-3 text-muted-foreground" aria-label="Encrypted at rest" />
                    )}
                  </span>
                </td>
                {change.operation === "update" && sameValue(change, field) ? (
                  // Only an encrypted field can change in storage without changing in value
                  <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">
                    <Value field={field} value={change.after?.[field]} />, unchanged, now stored encrypted
                  </td>
                ) : (
                  <>
                    {change.operation !== "insert" && (
                      <td className="bg-destructive/5 px-3 py-2">
                        <Value field={field} value={change.before?.[field]} />
                      </td>
                    )}
                    {change.operation !== "delete" && (
                      <td className="bg-success/5 px-3 py-2">
                        <Value field={field} value={change.after?.[field]} />
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const sameValue = (change: ChangeRow, field: string) =>
  JSON.stringify(change.before?.[field]) === JSON.stringify(change.after?.[field]);

/** Timestamps (fields ending in "At") read as dates, with the stored number kept for reference. */
function Value({ field, value }: { field: string; value: unknown }) {
  if (value === undefined) return <span className="text-xs text-muted-foreground italic">not set</span>;
  if (typeof value === "number" && /At$/.test(field) && value > 1e12) {
    return (
      <span title={String(value)}>
        {formatDateTime(value)} <span className="text-xs text-muted-foreground tabular-nums">({value})</span>
      </span>
    );
  }
  if (value === "") return <span className="text-xs text-muted-foreground italic">empty</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span className="break-words whitespace-pre-wrap">{String(value)}</span>;
  }
  return (
    <pre className="max-h-48 overflow-auto rounded bg-muted/60 p-2 font-mono text-xs whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Every change ever made to one document, newest first. */
function DocumentHistory({ table, documentId, title }: { table: string; documentId: string; title: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>History: {title ?? TABLE_LABELS[table] ?? table}</DialogTitle>
          <DialogDescription>Every change to this record, newest first.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {open && <HistoryBody table={table} documentId={documentId} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({ table, documentId }: { table: string; documentId: string }) {
  const source = useContext(SourceContext);
  const history = useQuery(source.documentHistory, { table, documentId });
  if (history === undefined) return <Spinner className="mx-auto" />;
  if (!history?.length) return <p className="text-sm text-muted-foreground">No history.</p>;
  return history.map((change) => (
    <div key={change.id} className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        <span className="tabular-nums">{formatDateTime(change.at)}</span>
        {change.command && <code className="ml-2">{change.command.replace(/\.js:/, ".")}</code>}
      </p>
      {change.reason && <p className="text-xs text-muted-foreground">Reason: {change.reason}</p>}
      <ChangeDiff change={change} showHistory={false} />
    </div>
  ));
}
