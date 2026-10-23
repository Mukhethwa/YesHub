"use client";

import Link from "next/link";
import { useState } from "react";

import { Pill } from "@/components/admin/page-header";
import { FilterTabs } from "@/components/admin/shared";
import { closingLabel, formatRand, KIND_LABELS } from "@/components/enterprise/tenders";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { getSettings } from "@/lib/sme/settings";
import { formatDate } from "@/lib/sme/format";
import type { SmeProfile } from "@/lib/sme/types";
import type { OpportunityKind } from "../../../convex/schema";
import {
  ApplyButton,
  OpportunityCard,
  fitsProfile,
  type Match,
  minimumValue,
  preferredKinds,
  reachLabel,
  recommendationsFor,
  useMatches,
} from "./opportunities-shared";
import { SectionHeader } from "./require-sme";

type Area = "home" | "provinces" | "nationwide" | "all";
type Sort = "fit" | "closing";

function inArea(match: Match, area: Area) {
  switch (area) {
    case "home":
      return match.reach === "home";
    case "provinces":
      return match.reach === "home" || match.reach === "provinces";
    case "nationwide":
      return match.reach === "nationwide";
    default:
      return true;
  }
}

export function MatchesView({ sme }: { sme: SmeProfile }) {
  const matches = useMatches(sme);
  const settings = getSettings(sme);
  const [area, setArea] = useState<Area>("provinces");
  const [kind, setKind] = useState<OpportunityKind | "preferred" | "all">("preferred");
  const [fitOnly, setFitOnly] = useState(settings.eligibleOnly);
  const [sort, setSort] = useState<Sort>("fit");

  const minValue = minimumValue(settings.minContractValue);
  const kinds = preferredKinds(sme);

  // Applied-to opportunities live in Opportunities; matches are what's still open to apply for
  const open = (matches ?? []).filter((m) => !m.application);
  const kept = open.filter(
    (m) =>
      (kind === "all" ? true : kind === "preferred" ? kinds.includes(m.kind) : m.kind === kind) &&
      (!fitOnly || fitsProfile(m.evaluation)) &&
      (m.value === null || m.value >= minValue),
  );
  const filtered = sort === "closing" ? [...kept].sort((a, b) => a.closesAt.localeCompare(b.closesAt)) : kept;
  const visible = filtered.filter((m) => inArea(m, area));

  if (matches === undefined) return <Spinner className="mx-auto mt-24" />;

  const count = (a: Area) => filtered.filter((m) => inArea(m, a)).length;
  const applied = (matches ?? []).length - open.length;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="My matches"
        description={`Open tenders, RFQs and grants that fit your business profile, best matches first.${
          applied > 0 ? ` ${applied} you’ve applied to ${applied === 1 ? "is" : "are"} in Opportunities.` : ""
        }`}
      />

      <FilterTabs
        label="Where the work is"
        value={area}
        onChange={setArea}
        options={[
          { id: "home", label: `Near you (${sme.hqProvince})`, count: count("home") },
          {
            id: "provinces",
            label: sme.nationwide ? "Where you deliver" : "Your provinces",
            count: count("provinces"),
          },
          { id: "nationwide", label: "Nationwide", count: count("nationwide") },
          { id: "all", label: "Everywhere", count: count("all") },
        ]}
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger className="sm:w-56" aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="preferred">Types from my settings</SelectItem>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="tender">Tenders</SelectItem>
              <SelectItem value="rfq">RFQs</SelectItem>
              <SelectItem value="grant">Grants</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="sm:w-48" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">Best matches first</SelectItem>
              <SelectItem value="closing">Closing soonest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Label className="flex items-center gap-2.5 font-normal">
          <Switch checked={fitOnly} onCheckedChange={setFitOnly} />
          Only ones that fit my profile
        </Label>
      </div>

      {minValue > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing opportunities worth {settings.minContractValue.toLowerCase()}, from your matching settings.
        </p>
      )}

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">No matches here yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {fitOnly && open.length > 0
                ? "Try turning off “Only ones that fit my profile” to see more opportunities, with tips on strengthening your application."
                : "Try a wider area. New opportunities appear here as soon as buyers publish them."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {visible.map((m) => (
            <MatchCard key={m.id} match={m} sme={sme} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function MatchCard({ match, sme }: { match: Match; sme: SmeProfile }) {
  const tip = recommendationsFor(match.evaluation, match)[0];
  const href = `/sme/opportunities?id=${match.id}`;
  return (
    <OpportunityCard
      kind={match.kind}
      reference={match.reference}
      title={match.title}
      href={href}
      subtitle={`${match.organizationName}, ${KIND_LABELS[match.kind]}`}
      status={
        <Pill tone={match.reach === "outside" ? "warning" : "neutral"}>{reachLabel(match.reach, match, sme)}</Pill>
      }
      facts={[
        { label: "Value", value: formatRand(match.value) },
        { label: "Closes", value: formatDate(match.closesAt), note: closingLabel(match.closesAt) },
        { label: "Where", value: match.provinces.length ? match.provinces.join(", ") : "Nationwide" },
      ]}
      note={
        tip ? (
          <>
            <span className="font-medium text-foreground">Tip:</span> {tip.text}
          </>
        ) : (
          "Your profile covers what this opportunity asks for."
        )
      }
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link href={href}>View details</Link>
          </Button>
          {match.inProgress ? (
            // The saved answers load on the opportunity's page
            <Button size="sm" asChild>
              <Link href={href}>Continue application</Link>
            </Button>
          ) : (
            <ApplyButton opportunityId={match.id} title={match.title} scoresPrice={match.scoresPrice} />
          )}
        </>
      }
    />
  );
}
