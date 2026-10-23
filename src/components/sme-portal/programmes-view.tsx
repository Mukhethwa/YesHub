"use client";

import { useState } from "react";

import { FilterTabs } from "@/components/admin/shared";
import { ESD_SECTIONS } from "@/components/enterprise/tenders";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { SmeProfile } from "@/lib/sme/types";
import { type EsdKind, isEsd } from "../../../convex/lib/kinds";
import { MatchCard } from "./matches-view";
import { useMatches } from "./opportunities-shared";
import { SectionHeader } from "./require-sme";

/*
 * Support programmes: the grants, funding, accelerator initiatives and business-support services corporates
 * and funders offer (their ESD). Applying works like a tender, and SMEs are told when they're accepted.
 */
export function ProgrammesView({ sme }: { sme: SmeProfile }) {
  const matches = useMatches(sme);
  const [kind, setKind] = useState<EsdKind | "all">("all");

  if (matches === undefined) return <Spinner className="mx-auto mt-24" />;

  // Programmes the SME applied to are tracked in Opportunities
  const open = (matches ?? []).filter((m) => isEsd(m.kind) && !m.application);
  const visible = open.filter((m) => kind === "all" || m.kind === kind);
  const count = (k: EsdKind) => open.filter((m) => m.kind === k).length;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Support programmes"
        description="Grants, funding, accelerator initiatives and business-support services from corporates and funders, to help your business grow. Apply here and track your applications in Opportunities."
      />

      <FilterTabs
        label="Kind of programme"
        value={kind}
        onChange={setKind}
        options={[
          { id: "all", label: "All", count: open.length },
          ...ESD_SECTIONS.map((s) => ({ id: s.kind, label: s.navLabel, count: count(s.kind) })),
        ]}
      />

      {kind !== "all" && (
        <p className="text-sm text-muted-foreground">{ESD_SECTIONS.find((s) => s.kind === kind)?.description}</p>
      )}

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">No open programmes here right now</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              New programmes appear here as soon as corporates and funders publish them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((m) => (
            <MatchCard key={m.id} match={m} sme={sme} />
          ))}
        </ul>
      )}
    </div>
  );
}
