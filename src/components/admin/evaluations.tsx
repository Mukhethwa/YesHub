"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { TrailList } from "@/components/review/review-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AdminPageHeader, Pill } from "./page-header";
import { formatDateTime, TablePagination, usePagination } from "./shared";

type Run = NonNullable<FunctionReturnType<typeof api.review.recentDecisions>>[number];

/** Every decision Jev made on YES Hub, with the full paper trail behind each. */
export function Evaluations() {
  const runs = useQuery(api.review.recentDecisions);
  const pagination = usePagination(runs ?? []);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Evaluations"
        description="Every time an enterprise evaluated an opportunity’s applicants: who was approved, and the full record of why."
      />

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Opportunity</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="hidden md:table-cell">Asked</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Trail</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs === undefined &&
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {runs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No enterprise has evaluated an opportunity yet.
                </TableCell>
              </TableRow>
            )}
            {pagination.rows.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="max-w-80 whitespace-normal">
                  <p className="font-medium">{run.opportunity.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {run.organizationName}, {run.opportunity.reference}
                  </p>
                </TableCell>
                <TableCell className="max-w-96 whitespace-normal">
                  <Outcome run={run} />
                  {run.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{run.summary}</p>}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {run.requestedBy}
                  <span className="block text-xs">{formatDateTime(run.at)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <RunTrail runId={run.id} title={run.opportunity.title} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination pagination={pagination} noun="decisions" />
    </div>
  );
}

function Outcome({ run }: { run: Run }) {
  if (run.status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Spinner className="size-3.5" />
        Deciding
      </span>
    );
  }
  if (run.status === "failed") return <Pill tone="danger">Failed</Pill>;
  return (
    <Pill tone="success">
      {run.approved} of up to {run.slots} approved
    </Pill>
  );
}

function RunTrail({ runId, title }: { runId: Id<"decisionRuns">; title: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Paper trail
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            The decision in order: who asked, every applicant’s points, the decisions, guardrails and changes.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <TrailBody runId={runId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TrailBody({ runId }: { runId: Id<"decisionRuns"> }) {
  const entries = useQuery(api.review.decisionTrail, { runId });
  if (entries === undefined) return <Spinner className="mx-auto" />;
  if (!entries?.length) return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return <TrailList entries={entries} technical />;
}
