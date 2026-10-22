"use client";

import { ArrowDownUpIcon, CheckIcon, ListFilterIcon, XIcon } from "lucide-react";
import { Fragment, useMemo } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/*
 * Sorting by named strategies ("Readiness, highest first", "Needs review first") with a second strategy to
 * break ties, and filtering by facets whose option counts reflect the other filters (DESIGN.md).
 */

/* ------------------------------------------------------------------------------------------------------ */
/* Sorting                                                                                                */
/* ------------------------------------------------------------------------------------------------------ */

export type SortStrategy<T> = {
  id: string;
  label: string;
  /** Strategies are listed under these headings, e.g. "Date", "Name", "Compliance". */
  group: string;
  compare: (a: T, b: T) => number;
};

/** Which strategy sorts first, and which breaks ties. */
export type SortValue = { by: string; then: string | null };

export function sortRows<T>(rows: T[], strategies: SortStrategy<T>[], value: SortValue) {
  const first = strategies.find((s) => s.id === value.by) ?? strategies[0];
  const then = strategies.find((s) => s.id === value.then);
  return [...rows].sort((a, b) => first.compare(a, b) || (then ? then.compare(a, b) : 0));
}

/** Comparators for building strategies. Missing values always sort last. */
export const by = {
  text:
    <T,>(get: (row: T) => string | null | undefined, desc = false) =>
    (a: T, b: T) => {
      const x = get(a) || "";
      const y = get(b) || "";
      if (!x || !y) return x ? -1 : y ? 1 : 0;
      return (desc ? -1 : 1) * x.localeCompare(y, "en-ZA", { sensitivity: "base", numeric: true });
    },
  number:
    <T,>(get: (row: T) => number | null | undefined, desc = false) =>
    (a: T, b: T) => {
      const x = get(a);
      const y = get(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return desc ? y - x : x - y;
    },
  /** Rows where the test is true come first. */
  first:
    <T,>(test: (row: T) => boolean) =>
    (a: T, b: T) =>
      Number(test(b)) - Number(test(a)),
};

function groupBy<T extends { group: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups.entries()];
}

export function SortMenu<T>({
  strategies,
  value,
  onChange,
}: {
  strategies: SortStrategy<T>[];
  value: SortValue;
  onChange: (value: SortValue) => void;
}) {
  const first = strategies.find((s) => s.id === value.by) ?? strategies[0];
  const then = strategies.find((s) => s.id === value.then);
  const groups = groupBy(strategies);

  const items = (selected: string | null, pick: (id: string) => void, exclude?: string) =>
    groups.map(([group, list], i) => (
      <Fragment key={group}>
        {i > 0 && <DropdownMenuSeparator />}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">{group}</DropdownMenuLabel>
          {list
            .filter((s) => s.id !== exclude)
            .map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => pick(s.id)}>
                <CheckIcon className={cn(selected === s.id ? "opacity-100" : "opacity-0")} />
                {s.label}
              </DropdownMenuItem>
            ))}
        </DropdownMenuGroup>
      </Fragment>
    ));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "max-w-full justify-start")}>
        <ArrowDownUpIcon />
        <span className="truncate">
          <span className="hidden text-muted-foreground sm:inline">Sort: </span>
          {first.label}
          {then && <span className="hidden text-muted-foreground lg:inline">, then {then.label.toLowerCase()}</span>}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
        {items(first.id, (id) => onChange({ by: id, then: value.then === id ? null : value.then }))}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Then by
            <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{then?.label ?? "Nothing"}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[60vh] w-60 overflow-y-auto">
            <DropdownMenuItem onSelect={() => onChange({ ...value, then: null })}>
              <CheckIcon className={cn(!then ? "opacity-100" : "opacity-0")} />
              Nothing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {items(value.then, (id) => onChange({ ...value, then: id }), first.id)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Filtering                                                                                              */
/* ------------------------------------------------------------------------------------------------------ */

export type FacetOption = { id: string; label: string };

export type Facet<T> = {
  id: string;
  label: string;
  /** "one" for mutually exclusive choices such as a date range; "many" lets several options combine (OR). */
  mode: "one" | "many";
  options: FacetOption[];
  /** Does the row match this option? */
  match: (row: T, option: string) => boolean;
};

/** Selected option ids per facet. */
export type FilterValue = Record<string, string[]>;

const matchesFacet = <T,>(row: T, facet: Facet<T>, chosen: string[] | undefined) =>
  !chosen?.length || chosen.some((option) => facet.match(row, option));

/** Rows matching every facet, and for each option how many rows it would leave given the other facets. */
export function useFacets<T>(rows: T[], facets: Facet<T>[], value: FilterValue) {
  return useMemo(() => {
    const filtered = rows.filter((row) => facets.every((f) => matchesFacet(row, f, value[f.id])));
    const counts: Record<string, Record<string, number>> = {};
    for (const facet of facets) {
      const others = rows.filter((row) => facets.every((f) => f === facet || matchesFacet(row, f, value[f.id])));
      counts[facet.id] = Object.fromEntries(
        facet.options.map((o) => [o.id, others.filter((row) => facet.match(row, o.id)).length]),
      );
    }
    return { rows: filtered, counts };
  }, [rows, facets, value]);
}

export function FilterMenu<T>({
  facets,
  value,
  onChange,
  counts,
}: {
  facets: Facet<T>[];
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  counts: Record<string, Record<string, number>>;
}) {
  const active = Object.values(value).reduce((n, list) => n + list.length, 0);

  const toggle = (facet: Facet<T>, option: string) => {
    const current = value[facet.id] ?? [];
    const next =
      facet.mode === "one"
        ? current.includes(option)
          ? []
          : [option]
        : current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option];
    onChange({ ...value, [facet.id]: next });
  };

  return (
    <Popover>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline" }))}>
        <ListFilterIcon />
        <span className="hidden sm:inline">Filters</span>
        {active > 0 && (
          <span className="rounded-sm bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums">
            {active}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-medium">Filters</span>
          <Button variant="ghost" size="sm" disabled={active === 0} onClick={() => onChange({})}>
            Clear all
          </Button>
        </div>
        <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
          {facets.map((facet) => (
            <fieldset key={facet.id} className="space-y-1.5">
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{facet.label}</legend>
              {facet.options.map((option) => {
                const checked = (value[facet.id] ?? []).includes(option.id);
                const count = counts[facet.id]?.[option.id] ?? 0;
                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted",
                      !checked && count === 0 && "text-muted-foreground",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(facet, option.id)}
                      className={cn(facet.mode === "one" && "rounded-full")}
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The active filters as removable chips, under the toolbar. */
export function ActiveFilters<T>({
  facets,
  value,
  onChange,
}: {
  facets: Facet<T>[];
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}) {
  const chips = facets.flatMap((facet) =>
    (value[facet.id] ?? []).map((id) => ({
      facet,
      id,
      label: facet.options.find((o) => o.id === id)?.label ?? id,
    })),
  );
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(({ facet, id, label }) => (
        <button
          key={`${facet.id}:${id}`}
          type="button"
          onClick={() => onChange({ ...value, [facet.id]: (value[facet.id] ?? []).filter((o) => o !== id) })}
          className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/8 px-2 py-0.5 text-xs text-foreground hover:bg-primary/15"
        >
          <span className="text-muted-foreground">{facet.label}:</span>
          {label}
          <XIcon className="size-3" aria-label="Remove" />
        </button>
      ))}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange({})}>
        Clear
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Common facets                                                                                          */
/* ------------------------------------------------------------------------------------------------------ */

const DAY = 86_400_000;

/**
 * A "when" facet over a timestamp. `now` comes from the browser after mount (useNow), never from render,
 * so prerendering stays deterministic.
 */
export function dateFacet<T>(id: string, label: string, get: (row: T) => number, now: number | null): Facet<T> {
  const ranges: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
  return {
    id,
    label,
    mode: "one",
    options: [
      { id: "7d", label: "Last 7 days" },
      { id: "30d", label: "Last 30 days" },
      { id: "90d", label: "Last 90 days" },
      { id: "365d", label: "Last 12 months" },
      { id: "older", label: "More than a year ago" },
    ],
    match: (row, option) => {
      if (now === null) return true;
      const age = now - get(row);
      return option === "older" ? age > 365 * DAY : age <= ranges[option] * DAY;
    },
  };
}

/** A facet with one option per distinct value, e.g. province or industry. */
export function valuesFacet<T>(
  id: string,
  label: string,
  rows: T[],
  get: (row: T) => string | string[] | null | undefined,
): Facet<T> {
  const values = new Set<string>();
  for (const row of rows) {
    const v = get(row);
    for (const item of Array.isArray(v) ? v : [v]) if (item) values.add(item);
  }
  return {
    id,
    label,
    mode: "many",
    options: [...values].sort((a, b) => a.localeCompare(b)).map((v) => ({ id: v, label: v })),
    match: (row, option) => {
      const v = get(row);
      return Array.isArray(v) ? v.includes(option) : v === option;
    },
  };
}
