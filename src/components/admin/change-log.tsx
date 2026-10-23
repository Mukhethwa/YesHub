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
import { diffRecords, humanise, isRecord, listRecord, visibleKey } from "./diff";
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
  /** Staff see ids and the service behind the automated review; organisations see what the values mean. */
  technical: boolean;
};

const STAFF_SOURCE: ChangeLogSource = {
  commands: api.audit.commands,
  commandChanges: api.audit.commandChanges,
  documentHistory: api.audit.documentHistory,
  technical: true,
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

/** Rows shown before "Show all": a re-evaluation can change dozens of values. */
const ROW_LIMIT = 12;

export function ChangeDiff({ change, showHistory = true }: { change: ChangeRow; showHistory?: boolean }) {
  const { technical } = useContext(SourceContext);
  const [showAll, setShowAll] = useState(false);
  const op = OPERATION[change.operation];
  const label = documentLabel(change);
  // Updates show the values that changed; creates and deletes show every value in the record
  const rows =
    change.operation === "update"
      ? diffRecords(change.before, change.after, change.fields, technical)
      : listRecord((change.after ?? change.before)!, technical, change.operation === "delete");
  // A field whose stored form changed but whose value didn't: only encryption does that
  const reencrypted =
    change.operation === "update"
      ? change.fields.filter((f) => change.encryptedFields.includes(f) && sameValue(change, f))
      : [];
  const shown = showAll ? rows : rows.slice(0, ROW_LIMIT);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <Pill tone={op.tone}>{op.label}</Pill>
          <span className="font-medium">{TABLE_LABELS[change.table] ?? change.table}</span>
          {label && <span className="truncate text-muted-foreground">{label}</span>}
          {technical && <code className="text-xs text-muted-foreground">{change.documentId}</code>}
        </div>
        {showHistory && <DocumentHistory table={change.table} documentId={change.documentId} title={label} />}
      </div>
      {rows.length === 0 && reencrypted.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Only internal references changed.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="w-[34%] px-3 py-1.5 text-left font-medium">What</th>
                {change.operation !== "insert" && <th className="px-3 py-1.5 text-left font-medium">Before</th>}
                {change.operation !== "delete" && <th className="px-3 py-1.5 text-left font-medium">After</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.path.join("›")} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-x-1 text-xs">
                      {row.path.map((segment, i) => (
                        <span key={i} className={i === row.path.length - 1 ? "font-medium" : "text-muted-foreground"}>
                          {segment}
                          {i < row.path.length - 1 && <span className="ml-1 text-muted-foreground/60">›</span>}
                        </span>
                      ))}
                      {change.encryptedFields.includes(row.field) && (
                        <LockIcon className="size-3 text-muted-foreground" aria-label="Encrypted at rest" />
                      )}
                    </span>
                  </td>
                  {change.operation !== "insert" && (
                    <td className="bg-destructive/5 px-3 py-2">
                      <Value
                        name={row.key}
                        value={row.before}
                        other={row.after}
                        technical={technical}
                        title={row.path.at(-1)}
                      />
                    </td>
                  )}
                  {change.operation !== "delete" && (
                    <td className="bg-success/5 px-3 py-2">
                      <Value
                        name={row.key}
                        value={row.after}
                        other={row.before}
                        technical={technical}
                        title={row.path.at(-1)}
                        removed={row.before !== undefined}
                      />
                    </td>
                  )}
                </tr>
              ))}
              {reencrypted.map((field) => (
                <tr key={field} className="border-b align-top last:border-0">
                  <td className="px-3 py-2 text-xs font-medium">{humanise(field)}</td>
                  <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">
                    Unchanged, now stored encrypted
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > ROW_LIMIT && (
            <div className="border-t px-3 py-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer" : `Show all ${rows.length} values`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const sameValue = (change: ChangeRow, field: string) =>
  JSON.stringify(change.before?.[field]) === JSON.stringify(change.after?.[field]);

const isPlainList = (v: unknown): v is (string | number | boolean)[] =>
  Array.isArray(v) && v.every((item) => typeof item !== "object" || item === null);

/** One value as people read it: dates as dates, yes and no, lists as lists, long text folded. */
function Value({
  name,
  value,
  other,
  technical,
  title,
  removed = false,
}: {
  /** The field's own key, e.g. "statusChangedAt". */
  name: string;
  value: unknown;
  /** The value on the other side, so a list can say what was added or removed. */
  other: unknown;
  technical: boolean;
  /** What the row is called, so a record shown whole doesn't repeat its own name. */
  title?: string;
  /** The value was there before and isn't now. */
  removed?: boolean;
}) {
  const muted = (text: string) => <span className="text-xs text-muted-foreground italic">{text}</span>;
  if (value === undefined) return muted(removed ? "removed" : "not set");
  if (value === null) return muted("none");
  if (value === "") return muted("empty");
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value === "number") {
    if (/At$/.test(name) && value > 1e12) {
      return (
        <span className="tabular-nums" title={technical ? String(value) : undefined}>
          {formatDateTime(value)}
        </span>
      );
    }
    return <span className="tabular-nums">{value.toLocaleString("en-ZA")}</span>;
  }
  if (typeof value === "string") return <LongText text={value} />;
  if (isPlainList(value)) {
    if (!value.length) return muted("none");
    const others = new Set(isPlainList(other) ? other.map(String) : []);
    const compare = isPlainList(other);
    return (
      <ul className="space-y-0.5">
        {value.map((item, i) => (
          <li key={i} className="break-words">
            {String(item)}
            {compare && !others.has(String(item)) && (
              <span className="ml-1.5 text-xs text-muted-foreground">(only here)</span>
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (Array.isArray(value)) {
    // A list of records, shown whole because it exists on this side only
    return (
      <ul className="space-y-2">
        {value.map((item, i) => (
          <li key={i}>
            <Value name={name} value={item} other={undefined} technical={technical} />
          </li>
        ))}
      </ul>
    );
  }
  if (isRecord(value)) {
    // The item's own name is already in the path
    const keys = Object.keys(value).filter((k) => visibleKey(k, technical, true) && value[k] !== title);
    if (!keys.length) return muted("empty");
    return (
      <dl className="space-y-1 rounded-md border bg-card/60 p-2 text-xs">
        {keys.map((k) => (
          <div key={k} className="grid grid-cols-[minmax(5rem,auto)_1fr] gap-2">
            <dt className="text-muted-foreground">{humanise(k)}</dt>
            <dd className="min-w-0">
              <Value name={k} value={value[k]} other={undefined} technical={technical} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="font-mono text-xs break-words">{String(value)}</span>;
}

/** Text longer than a few lines is folded, so one long description doesn't push the rest away. */
function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  return (
    <span className="block">
      <span className={cn("block break-words whitespace-pre-wrap", long && !open && "line-clamp-4")}>{text}</span>
      {long && (
        <button
          type="button"
          className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
          onClick={() => setOpen(!open)}
        >
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </span>
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
