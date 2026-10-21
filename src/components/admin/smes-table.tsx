"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { SearchIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { docStatus, documentProgress } from "@/lib/sme/documents";
import { formatDate } from "@/lib/sme/format";
import { getReadiness } from "@/lib/sme/readiness";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader, Pill } from "./page-header";
import { FilterTabs, TablePagination, usePagination } from "./shared";
import { SmeInspector, StatusPill } from "./sme-inspector";

type Sme = NonNullable<FunctionReturnType<typeof api.admin.smes>>[number];
type Filter = "all" | "unverified" | "verified" | "suspended" | "attention";

const hasExpired = (sme: Sme) => (["bbbeeCertificate", "taxCertificate"] as const).some((k) => docStatus(sme, k) === "expired");

function matches(sme: Sme, filter: Filter) {
  switch (filter) {
    case "all":
      return true;
    case "unverified":
      return !sme.verifiedAt && !sme.suspendedAt;
    case "verified":
      return !!sme.verifiedAt && !sme.suspendedAt;
    case "suspended":
      return !!sme.suspendedAt;
    case "attention": {
      const docs = documentProgress(sme);
      return docs.requiredDone < docs.requiredTotal || hasExpired(sme);
    }
  }
}

export function SmesTable() {
  const smes = useQuery(api.admin.smes);
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<Id<"smes"> | null>(() => params.get("id") as Id<"smes"> | null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (smes ?? []).filter(
      (s) =>
        matches(s, filter) &&
        (!term ||
          [s.companyName, s.industry, s.city, s.hqProvince, s.registrationNumber, s.owner?.email ?? ""].some((field) =>
            field.toLowerCase().includes(term),
          )),
    );
  }, [smes, search, filter]);

  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [search, filter, setPage]);

  const count = (f: Filter) => (smes ?? []).filter((s) => matches(s, f)).length;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="SMEs"
        description="Registered businesses, how match-ready they are and whether their compliance documents are current."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Filter SMEs"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: count("all") },
            { id: "unverified", label: "To verify", count: count("unverified") },
            { id: "verified", label: "Verified", count: count("verified") },
            { id: "suspended", label: "Suspended", count: count("suspended") },
            { id: "attention", label: "Document issues", count: count("attention") },
          ]}
        />
        <InputGroup className="lg:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search company, place, reg no."
            aria-label="Search SMEs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Readiness</TableHead>
              <TableHead className="hidden sm:table-cell">Documents</TableHead>
              <TableHead className="hidden md:table-cell">Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {smes === undefined &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {smes !== undefined && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {smes?.length ? "No SMEs match." : "No SMEs have registered yet."}
                </TableCell>
              </TableRow>
            )}
            {pagination.rows.map((sme) => {
              const { score } = getReadiness(sme);
              const docs = documentProgress(sme);
              return (
                <TableRow key={sme._id} className="cursor-pointer" onClick={() => setSelectedId(sme._id)}>
                  <TableCell>
                    <button type="button" className="text-left" aria-label={`Open ${sme.companyName}`}>
                      <p className="font-medium">
                        {sme.companyName}
                        {sme.isDemo && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(sample)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sme.industry}
                        {sme.owner && ` · ${sme.owner.email}`}
                      </p>
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {sme.city}, {sme.hqProvince}
                  </TableCell>
                  <TableCell>
                    <StatusPill sme={sme} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Pill tone={score >= 75 ? "success" : score >= 50 ? "warning" : "danger"}>{score}%</Pill>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-sm tabular-nums">
                        {docs.done}/{docs.total}
                      </span>
                      {docs.requiredDone < docs.requiredTotal && <Pill tone="warning">Missing required</Pill>}
                      {hasExpired(sme) && <Pill tone="danger">Expired</Pill>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(sme._creationTime)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TablePagination pagination={pagination} noun="SMEs" />
      <SmeInspector smeId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
