"use client";

import { CheckIcon, DownloadIcon, MinusIcon, RefreshCwIcon, SearchIcon, XIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/*
 * The parts every data table shares: search, refresh, export, row selection and a bar of bulk actions
 * (DESIGN.md). Convex data is live, so Refresh re-subscribes the table; its search, filters and selection
 * survive because they're kept above the part that remounts.
 */

/* ------------------------------------------------------------------------------------------------------ */
/* Refresh                                                                                                */
/* ------------------------------------------------------------------------------------------------------ */

type Scope = {
  refresh: () => void;
  /** Null until the first refresh: the page shows live data from when it opened. */
  refreshedAt: number | null;
  /** True for a moment after Refresh, so the button can spin. Kept here because the button remounts. */
  refreshing: boolean;
  state: Map<string, unknown>;
};

const ScopeContext = createContext<Scope | null>(null);

/** Wrap a table's page in this; Refresh remounts what's inside, keeping state made with useTableState. */
export function RefreshScope({ children }: { children: ReactNode }) {
  const [key, setKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  // A stable map that outlives the remount; mutated by useTableState, never rendered from directly
  const [state] = useState(() => new Map<string, unknown>());
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!refreshing) return;
    const id = setTimeout(() => setRefreshing(false), 700);
    return () => clearTimeout(id);
  }, [refreshing]);
  const refresh = useCallback(() => {
    setKey((k) => k + 1);
    setRefreshedAt(Date.now());
    setRefreshing(true);
  }, []);
  const value = useMemo(() => ({ refresh, refreshedAt, refreshing, state }), [refresh, refreshedAt, refreshing, state]);
  return (
    <ScopeContext.Provider value={value}>
      <Fragment key={key}>{children}</Fragment>
    </ScopeContext.Provider>
  );
}

/** useState that survives a refresh. `name` must be unique within the scope. */
export function useTableState<T>(name: string, initial: T) {
  const scope = useContext(ScopeContext);
  const [value, setValue] = useState<T>(() => (scope?.state.has(name) ? (scope.state.get(name) as T) : initial));
  useEffect(() => {
    scope?.state.set(name, value);
  }, [scope, name, value]);
  return [value, setValue] as const;
}

export function RefreshButton() {
  const scope = useContext(ScopeContext);
  if (!scope) return null;
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Refresh"
      title={
        scope.refreshedAt
          ? `Refreshed ${new Date(scope.refreshedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`
          : "Refresh"
      }
      disabled={scope.refreshing}
      onClick={() => {
        scope.refresh();
        toast.success("Refreshed");
      }}
    >
      <RefreshCwIcon className={cn(scope.refreshing && "animate-spin")} />
    </Button>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Toolbar                                                                                                */
/* ------------------------------------------------------------------------------------------------------ */

/** Quick filter tabs above; search, filters, sort, refresh and export below. Wraps on phones. */
export function DataToolbar({
  filters,
  controls,
  chips,
  search,
  onSearch,
  searchLabel = "Search",
  onExport,
  actions,
}: {
  /** Quick filter tabs. */
  filters?: ReactNode;
  /** The filter and sort menus. */
  controls?: ReactNode;
  /** Active filters, shown under the toolbar. */
  chips?: ReactNode;
  search?: string;
  onSearch?: (value: string) => void;
  searchLabel?: string;
  /** Exports what's shown (or what's selected). */
  onExport?: () => void;
  /** Extra buttons, e.g. "Create user". */
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {filters && <div className="min-w-0">{filters}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {onSearch && (
          <InputGroup className="min-w-0 basis-full sm:flex-1 sm:basis-auto lg:max-w-sm">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder={searchLabel}
              aria-label={searchLabel}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </InputGroup>
        )}
        {controls}
        <div className="ml-auto flex items-center gap-2">
          <RefreshButton />
          {onExport && (
            <Button variant="outline" onClick={onExport}>
              <DownloadIcon />
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}
          {actions}
        </div>
      </div>
      {chips}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Selection and bulk actions                                                                             */
/* ------------------------------------------------------------------------------------------------------ */

/** Which rows are selected. Rows that disappear (filtered out, deleted) drop out of the selection. */
export function useSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  const current = useMemo(() => new Set([...selected].filter((id) => visible.has(id))), [selected, visible]);

  return {
    selected: current,
    count: current.size,
    has: (id: string) => current.has(id),
    toggle: (id: string) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    allSelected: visibleIds.length > 0 && current.size === visibleIds.length,
    someSelected: current.size > 0 && current.size < visibleIds.length,
    toggleAll: () => setSelected(current.size === visibleIds.length ? new Set() : new Set(visibleIds)),
    clear: () => setSelected(new Set()),
  };
}

export type Selection = ReturnType<typeof useSelection>;

/** The header checkbox: a tick when every row is selected, a dash when some are. */
export function SelectAllCheckbox({ selection, label = "Select all" }: { selection: Selection; label?: string }) {
  const state = selection.allSelected ? true : selection.someSelected ? "indeterminate" : false;
  return (
    <CheckboxPrimitive.Root
      aria-label={label}
      checked={state}
      onCheckedChange={selection.toggleAll}
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
      )}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center [&>svg]:size-3.5">
        {state === "indeterminate" ? <MinusIcon /> : <CheckIcon />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function RowCheckbox({ selection, id, label }: { selection: Selection; id: string; label: string }) {
  return (
    <Checkbox
      aria-label={label}
      checked={selection.has(id)}
      onCheckedChange={() => selection.toggle(id)}
      // Rows open on click; the checkbox shouldn't
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** Appears when rows are selected: how many, the bulk actions, and a way to clear. */
export function BulkBar({ selection, children, noun }: { selection: Selection; children: ReactNode; noun: string }) {
  if (selection.count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-white shadow-lg"
    >
      <span className="mr-2 text-sm font-medium tabular-nums">
        {selection.count} {noun}
        {selection.count === 1 ? "" : "s"} selected
      </span>
      <div className="flex flex-wrap gap-2 [&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-white [&_button:hover]:bg-white/20">
        {children}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className={cn("ml-auto text-white hover:bg-white/10 hover:text-white")}
        onClick={selection.clear}
      >
        <XIcon />
        Clear
      </Button>
    </div>
  );
}

/** Runs an action on each selected row, then reports how many succeeded. */
export async function runBulk<T>(
  items: T[],
  action: (item: T) => Promise<unknown>,
  { done, noun }: { done: string; noun: string },
) {
  let ok = 0;
  const failures: string[] = [];
  for (const item of items) {
    try {
      const result = (await action(item)) as { error?: { message?: string } | null } | undefined;
      if (result && typeof result === "object" && "error" in result && result.error) {
        failures.push(result.error.message ?? "Failed");
      } else ok++;
    } catch (error) {
      const data = (error as { data?: unknown }).data;
      failures.push(typeof data === "string" ? data : "Failed");
    }
  }
  if (ok) toast.success(`${done}: ${ok} ${noun}${ok === 1 ? "" : "s"}`);
  if (failures.length) toast.error(`${failures.length} not changed. ${failures[0]}`);
  return { ok, failed: failures.length };
}
