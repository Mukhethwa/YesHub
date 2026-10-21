"use client";

import { useQuery } from "convex/react";

import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader } from "./page-header";

export function OrganisationsTable() {
  const organizations = useQuery(api.admin.organizations);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Organisations"
        description="Enterprises and funders on YES Hub. Each organisation is a team that posts opportunities and reviews suppliers."
      />

      {organizations === undefined ? (
        <Spinner className="mx-auto mt-12" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Members</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(organizations ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                    No organisations yet.
                  </TableCell>
                </TableRow>
              )}
              {(organizations ?? []).map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">@{org.slug}</p>
                  </TableCell>
                  <TableCell className="tabular-nums">{org.memberCount}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(org.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
