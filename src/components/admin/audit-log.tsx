"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader, Pill } from "./page-header";
import { FilterTabs, formatDateTime, TablePagination, usePagination } from "./shared";

type Entry = NonNullable<FunctionReturnType<typeof api.audit.list>>[number];
type Filter = "all" | Entry["targetType"];

/** Human wording for audit actions; unknown ones fall back to the raw action. */
const ACTIONS: Record<string, string> = {
  "user.create": "created the account",
  "user.update": "edited the profile of",
  "user.set-password": "set a new password for",
  "user.set-role": "changed the role of",
  "user.ban": "banned",
  "user.unban": "unbanned",
  "user.impersonate": "viewed YES Hub as",
  "user.revoke-sessions": "signed out every session of",
  "user.revoke-session": "ended a session of",
  "user.delete": "deleted the account",
  "sme.verify": "verified",
  "sme.unverify": "removed verification from",
  "sme.suspend": "suspended",
  "sme.reinstate": "reinstated",
  "sme.delete": "deleted the SME profile",
  "organization.verify": "verified",
  "organization.reject": "rejected",
  "organization.unverify": "moved back to review",
  "organization.delete": "deleted",
  "organization.remove-member": "removed a member from",
  "staff.invite": "invited to the staff team:",
  "staff.cancel-invitation": "cancelled the staff invitation for",
  "staff.update-role": "changed the access level of",
  "staff.remove": "removed the staff access of",
};

const TARGET_LABELS: Record<Entry["targetType"], string> = {
  user: "User",
  sme: "SME",
  organization: "Organisation",
  staff: "Staff",
};

export function AuditLog() {
  const entries = useQuery(api.audit.list, { limit: 500 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) =>
        (filter === "all" || e.targetType === filter) &&
        (!term ||
          [e.actorName, e.targetLabel ?? "", e.details ?? "", e.action].some((field) =>
            field.toLowerCase().includes(term),
          )),
    );
  }, [entries, search, filter]);

  const pagination = usePagination(visible, 50);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [search, filter, setPage]);

  const count = (f: Filter) => (entries ?? []).filter((e) => f === "all" || e.targetType === f).length;

  if (entries === null) {
    return (
      <div className="space-y-5">
        <AdminPageHeader title="Audit log" description="Every action YES Hub staff take in the admin area." />
        <p className="text-sm text-muted-foreground">Your access level can’t view the audit log.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Audit log"
        description="Every action YES Hub staff take in the admin area, newest first."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Filter entries"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: count("all") },
            { id: "user", label: "Users", count: count("user") },
            { id: "sme", label: "SMEs", count: count("sme") },
            { id: "organization", label: "Organisations", count: count("organization") },
            { id: "staff", label: "Staff", count: count("staff") },
          ]}
        />
        <InputGroup className="lg:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search people, targets, notes"
            aria-label="Search the audit log"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>What happened</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead className="hidden md:table-cell">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries === undefined &&
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {entries !== undefined && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  {entries.length ? "No entries match." : "Nothing has happened yet."}
                </TableCell>
              </TableRow>
            )}
            {pagination.rows.map((entry) => (
              <TableRow key={entry._id}>
                <TableCell className="whitespace-normal">
                  <p>
                    <span className="font-medium">{entry.actorName}</span> {ACTIONS[entry.action] ?? entry.action}{" "}
                    {entry.targetLabel && <span className="font-medium">{entry.targetLabel}</span>}
                  </p>
                  {entry.details && <p className="text-xs text-muted-foreground">{entry.details}</p>}
                  <p className="text-xs text-muted-foreground md:hidden">{formatDateTime(entry._creationTime)}</p>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Pill>{TARGET_LABELS[entry.targetType]}</Pill>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                  {formatDateTime(entry._creationTime)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination pagination={pagination} noun="entries" />
    </div>
  );
}
