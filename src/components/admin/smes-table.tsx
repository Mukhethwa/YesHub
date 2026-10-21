"use client";

import { useQuery } from "convex/react";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { docStatus, documentProgress } from "@/lib/sme/documents";
import { formatDate } from "@/lib/sme/format";
import { getReadiness } from "@/lib/sme/readiness";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader, Pill } from "./page-header";

export function SmesTable() {
  const smes = useQuery(api.admin.smes);
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (smes ?? []).filter(
      (s) =>
        !term ||
        [s.companyName, s.industry, s.city, s.hqProvince, s.owner?.email ?? ""].some((field) => field.toLowerCase().includes(term)),
    );
  }, [smes, search]);

  return (
    <div className="space-y-5">
      <AdminPageHeader title="SMEs" description="Registered businesses, how match-ready they are and whether their compliance documents are current.">
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search company, industry, place"
            aria-label="Search SMEs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </AdminPageHeader>

      {smes === undefined ? (
        <Spinner className="mx-auto mt-12" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead>Readiness</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead className="hidden md:table-cell">Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {smes?.length ? "No SMEs match." : "No SMEs have registered yet."}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((sme) => {
                const { score } = getReadiness(sme);
                const docs = documentProgress(sme);
                const expired = (["bbbeeCertificate", "taxCertificate"] as const).some((k) => docStatus(sme, k) === "expired");
                return (
                  <TableRow key={sme._id}>
                    <TableCell>
                      <p className="font-medium">
                        {sme.companyName}
                        {sme.isDemo && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(sample)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sme.industry}
                        {sme.owner && ` · ${sme.owner.email}`}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {sme.city}, {sme.hqProvince}
                    </TableCell>
                    <TableCell>
                      <Pill tone={score >= 75 ? "success" : score >= 50 ? "warning" : "danger"}>{score}%</Pill>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-sm tabular-nums">
                          {docs.done}/{docs.total}
                        </span>
                        {docs.requiredDone < docs.requiredTotal && <Pill tone="warning">Missing required</Pill>}
                        {expired && <Pill tone="danger">Expired</Pill>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(sme._creationTime)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
