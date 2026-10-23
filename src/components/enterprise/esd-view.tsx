"use client";

import { useQuery } from "convex/react";
import { BadgeCheckIcon, CalendarClockIcon, HandHeartIcon, InboxIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminPageHeader } from "@/components/admin/page-header";
import { FilterTabs } from "@/components/admin/shared";
import { Section } from "@/components/app/section";
import { StatStrip } from "@/components/app/stat-strip";
import { useBreadcrumb } from "@/components/portal/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "../../../convex/_generated/api";
import { type EsdKind, isEsd } from "../../../convex/lib/kinds";
import { CreateOrganisation } from "./create-organisation";
import { OpportunityTable } from "./enterprise-overview";
import { OpportunityDetail } from "./opportunities-view";
import { ESD_SECTIONS, isFinished, phaseOf } from "./tenders";

/*
 * Enterprise and supplier development (ESD): the grants, funding, accelerator initiatives and business-support
 * services an organisation offers SMEs. SMEs find them under Support programmes and apply like they do to a
 * listing; the organisation accepts the SMEs it takes on.
 */

/** /dashboard/esd and its sections: the programmes, or one programme when the URL has ?id=. */
export function EsdView({ kind }: { kind?: EsdKind }) {
  const id = useSearchParams().get("id");
  if (id) return <OpportunityDetail opportunityId={id} area="esd" />;
  return kind ? <EsdSectionPage kind={kind} /> : <EsdOverview />;
}

function useProgrammes() {
  const data = useQuery(api.enterprise.overview);
  const programmes = useMemo(() => (data?.opportunities ?? []).filter((o) => isEsd(o.kind)), [data]);
  return { data, programmes };
}

const newHref = (kind: EsdKind) => `/dashboard/opportunities/new?kind=${kind}`;

function EsdOverview() {
  const { data, programmes } = useProgrammes();

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  if (data === null) return <CreateOrganisation />;

  const open = programmes.filter((p) => !isFinished(phaseOf(p)));
  const applications = programmes.reduce((sum, p) => sum + p.applications, 0);
  const toReview = programmes.reduce((sum, p) => sum + p.awaitingReview, 0);
  const accepted = programmes.reduce((sum, p) => sum + p.accepted, 0);
  const closing = programmes.filter((p) => phaseOf(p) === "closing").length;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Enterprise and supplier development"
        description="The grants, funding, accelerator initiatives and business-support services you offer SMEs. SMEs find them under Support programmes and apply the same way they apply to a listing."
      />

      <StatStrip
        variant="brand"
        items={[
          { label: "Open programmes", icon: HandHeartIcon, value: open.length, context: `of ${programmes.length}` },
          {
            label: "Applications",
            icon: InboxIcon,
            value: applications,
            context: toReview ? `${toReview} awaiting your decision` : "All reviewed",
          },
          { label: "SMEs accepted", icon: BadgeCheckIcon, value: accepted },
          {
            label: "Closing this week",
            icon: CalendarClockIcon,
            value: closing,
            context: closing ? undefined : "Nothing closes in the next 7 days",
          },
        ]}
      />

      {ESD_SECTIONS.map((section) => {
        const rows = programmes.filter((p) => p.kind === section.kind).sort((a, b) => b.createdAt - a.createdAt);
        return (
          <Section
            key={section.kind}
            title={section.title}
            description={section.description}
            href={`/dashboard/esd/${section.slug}`}
            linkLabel={rows.length > 3 ? `View all ${rows.length}` : "View all"}
          >
            <div className="overflow-hidden rounded-lg border bg-card">
              {rows.length === 0 ? (
                <EmptyRow kind={section.kind} noun={section.noun} />
              ) : (
                <OpportunityTable rows={rows.slice(0, 3)} esd />
              )}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

type Filter = "all" | "open" | "closed";

function EsdSectionPage({ kind }: { kind: EsdKind }) {
  const section = ESD_SECTIONS.find((s) => s.kind === kind)!;
  const { data, programmes } = useProgrammes();
  const [filter, setFilter] = useState<Filter>("all");
  useBreadcrumb(section.navLabel);

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  if (data === null) return <CreateOrganisation />;

  const rows = programmes.filter((p) => p.kind === kind).sort((a, b) => b.createdAt - a.createdAt);
  const inFilter = (f: Filter) => rows.filter((r) => f === "all" || (f === "closed") === isFinished(phaseOf(r)));
  const visible = inFilter(filter);

  return (
    <div className="space-y-5">
      <AdminPageHeader title={section.title} description={section.description}>
        <Button asChild>
          <Link href={newHref(kind)}>New {section.noun}</Link>
        </Button>
      </AdminPageHeader>

      <FilterTabs
        label={`Filter ${section.title.toLowerCase()}`}
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: "All", count: rows.length },
          { id: "open", label: "Open", count: inFilter("open").length },
          { id: "closed", label: "Closed", count: inFilter("closed").length },
        ]}
      />

      <div className="overflow-hidden rounded-xl border bg-card">
        {visible.length === 0 ? (
          rows.length === 0 ? (
            <EmptyRow kind={kind} noun={section.noun} />
          ) : (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">None match.</p>
          )
        ) : (
          <OpportunityTable rows={visible} esd />
        )}
      </div>
    </div>
  );
}

function EmptyRow({ kind, noun }: { kind: EsdKind; noun: string }) {
  return (
    <div className="flex flex-col items-start gap-3 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">You haven’t published a {noun} yet.</p>
      <Button variant="outline" size="sm" asChild>
        <Link href={newHref(kind)}>New {noun}</Link>
      </Button>
    </div>
  );
}
