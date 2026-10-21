"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Better Auth client calls resolve with `{ error }` instead of throwing; this toasts either way. */
export async function runAuthAction(
  success: string,
  call: () => Promise<{ error: { message?: string } | null }>,
): Promise<boolean> {
  const { error } = await call();
  if (error) toast.error(error.message || "That didn’t work. Please try again.");
  else toast.success(success);
  return !error;
}

/** For Convex mutations: toasts the ConvexError message on failure. */
export async function runMutation(success: string, call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    toast.success(success);
    return true;
  } catch (error) {
    const data = (error as { data?: unknown }).data;
    toast.error(typeof data === "string" ? data : "That didn’t work. Please try again.");
    return false;
  }
}

/** Client-side pagination over an already-filtered list. */
export function usePagination<T>(rows: T[], pageSize = 20) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  return {
    rows: rows.slice(current * pageSize, (current + 1) * pageSize),
    page: current,
    pageCount,
    total: rows.length,
    start: rows.length === 0 ? 0 : current * pageSize + 1,
    end: Math.min((current + 1) * pageSize, rows.length),
    setPage,
    reset: () => setPage(0),
  };
}

export function TablePagination({ pagination, noun }: { pagination: ReturnType<typeof usePagination>; noun: string }) {
  if (pagination.total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {pagination.start}–{pagination.end} of {pagination.total} {noun}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous page"
          disabled={pagination.page === 0}
          onClick={() => pagination.setPage(pagination.page - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next page"
          disabled={pagination.page >= pagination.pageCount - 1}
          onClick={() => pagination.setPage(pagination.page + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}

/** Segmented filter buttons with counts. */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.id}
          size="sm"
          variant={value === option.id ? "default" : "outline"}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count !== undefined && <span className="tabular-nums opacity-70">{option.count}</span>}
        </Button>
      ))}
    </div>
  );
}

export function formatDateTime(value: number | string | Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
