"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { SearchIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { OrganisationInspector, VerificationPill } from "./organisation-inspector";
import { AdminPageHeader } from "./page-header";
import { FilterTabs, TablePagination, usePagination } from "./shared";

type Organisation = NonNullable<FunctionReturnType<typeof api.admin.organizations>>[number];
type Filter = "all" | "unverified" | "verified" | "rejected";

const matches = (org: Organisation, filter: Filter) => filter === "all" || org.verificationStatus === filter;

export function OrganisationsTable() {
  const organizations = useQuery(api.admin.organizations);
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(() => (params.get("status") as Filter | null) ?? "all");
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("id"));

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (organizations ?? []).filter(
      (o) => matches(o, filter) && (!term || o.name.toLowerCase().includes(term) || o.slug.toLowerCase().includes(term)),
    );
  }, [organizations, search, filter]);

  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [search, filter, setPage]);

  const count = (f: Filter) => (organizations ?? []).filter((o) => matches(o, f)).length;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Organisations"
        description="Enterprises and funders. New organisations can’t post opportunities until YES Hub verifies them."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
        <InputGroup className="lg:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search organisations"
            aria-label="Search organisations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Members</TableHead>
              <TableHead className="hidden sm:table-cell">Teams</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations === undefined &&
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {organizations !== undefined && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {organizations?.length ? "No organisations match." : "No organisations yet."}
                </TableCell>
              </TableRow>
            )}
            {pagination.rows.map((org) => (
              <TableRow key={org.id} className="cursor-pointer" onClick={() => setSelectedId(org.id)}>
                <TableCell>
                  <button type="button" className="text-left" aria-label={`Open ${org.name}`}>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">@{org.slug}</p>
                  </button>
                </TableCell>
                <TableCell>
                  <VerificationPill status={org.verificationStatus} />
                </TableCell>
                <TableCell className="hidden tabular-nums sm:table-cell">{org.memberCount}</TableCell>
                <TableCell className="hidden tabular-nums sm:table-cell">{org.teamCount}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(org.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination pagination={pagination} noun="organisations" />
      <OrganisationInspector organizationId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
