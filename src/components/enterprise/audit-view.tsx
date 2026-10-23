"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/page-header";
import { ChangeLog, type ChangeLogSource, CommandList } from "@/components/admin/change-log";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CreateOrganisation } from "./create-organisation";

/*
 * The organisation's audit log: the command log staff see in the admin area, limited to this organisation's
 * data (convex/enterpriseAudit.ts). Every change to an opportunity, a released document, an application, a
 * shortlisting run or the settings, who made it, the reason they gave, and each field before and after.
 */

const SOURCE: ChangeLogSource = {
  commands: api.enterpriseAudit.commands,
  commandChanges: api.enterpriseAudit.commandChanges,
  documentHistory: api.enterpriseAudit.documentHistory,
  technical: false,
};

/** The records an organisation owns, to filter the log by. */
const TABLES = {
  opportunities: "Listing",
  opportunityDocuments: "Tender document",
  applications: "Application",
  documentExtractions: "Document reading",
  decisionRuns: "Shortlisting",
  organizationSettings: "Settings",
};

export function AuditView() {
  const params = useSearchParams();
  const opportunityId = params.get("opportunity") as Id<"opportunities"> | null;
  const overview = useQuery(api.enterprise.overview);

  if (overview === undefined) return <Spinner className="mx-auto mt-24" />;
  if (overview === null) return <CreateOrganisation />;

  if (opportunityId) {
    const opportunity = overview.opportunities.find((o) => o.id === opportunityId);
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Audit log"
          description={opportunity ? `Every change to ${opportunity.reference}: ${opportunity.title}` : undefined}
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/opportunities?id=${opportunityId}`}>Back to the opportunity</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/audit">Whole organisation</Link>
            </Button>
          </div>
        </AdminPageHeader>
        <OpportunityLog opportunityId={opportunityId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Audit log" />
      <ChangeLog
        source={SOURCE}
        tables={TABLES}
        intro={`Every change to ${overview.organization.name}’s listings, documents, applications and settings, who made it and why, with each field before and after. Records are only ever added.`}
      />
    </div>
  );
}

function OpportunityLog({ opportunityId }: { opportunityId: Id<"opportunities"> }) {
  const commands = useQuery(api.enterpriseAudit.opportunityCommands, { opportunityId });
  if (commands === undefined) return <Spinner className="mx-auto" />;
  if (!commands?.length) {
    return (
      <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">
        Nothing has changed yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The listing, its documents, its applications and their reviews, newest first. Open a change to see each field
        before and after.
      </p>
      <CommandList commands={commands} source={SOURCE} />
    </div>
  );
}
