"use client";

import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, type LucideIcon } from "lucide-react";

import { StatStrip } from "@/components/app/stat-strip";
import { Status, Tag, type Tone } from "@/components/app/status";
import { cn } from "@/lib/utils";
import type { Evaluation, RequirementResult, TenderRequirement } from "../../../convex/schema";

/*
 * A tender's requirements against one application: what it already has and what it still needs, in the
 * tender's own words. The SME sees it as feedback to act on before the tender closes; the buyer sees the
 * same list on each applicant.
 */

export const REQUIREMENT_GROUPS: { kind: TenderRequirement["kind"]; title: string; prefix: string }[] = [
  { kind: "mandatory", title: "Mandatory requirements", prefix: "M" },
  { kind: "scored", title: "Scored criteria", prefix: "S" },
  { kind: "returnable", title: "Returnable documents", prefix: "R" },
  { kind: "condition", title: "Conditions", prefix: "C" },
];

export const ACTION_LABELS: Record<NonNullable<TenderRequirement["action"]>, string> = {
  submit: "Submit",
  complete_and_sign: "Complete and sign",
  review: "Read only",
  demonstrate: "Show in your proposal",
};

export const TIER_LABELS: Record<NonNullable<TenderRequirement["tier"]>, string> = {
  mandatory: "Missing it disqualifies",
  essential: "Missing it may disqualify",
  scoring: "Counts for points",
};

export const RESULT: Record<RequirementResult["status"], { label: string; tone: Tone; icon: LucideIcon }> = {
  met: { label: "Met", tone: "success", icon: CircleCheckIcon },
  partial: { label: "Partly met", tone: "warning", icon: CircleAlertIcon },
  missing: { label: "Missing", tone: "danger", icon: CircleXIcon },
};

/** Short references for a register's requirements, "M1", "S2", "R3", in the order the tender lists them. */
export function requirementCodes(requirements: TenderRequirement[]) {
  const codes = new Map<string, string>();
  for (const group of REQUIREMENT_GROUPS) {
    requirements.filter((r) => r.kind === group.kind).forEach((r, i) => codes.set(r.id, `${group.prefix}${i + 1}`));
  }
  return codes;
}

/** Counts of met, partly met and missing, and the requirements that disqualify when not met. */
export function resultCounts(requirements: TenderRequirement[], results: RequirementResult[]) {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const counts = { met: 0, partial: 0, missing: 0, blocking: 0 };
  for (const result of results) {
    counts[result.status]++;
    const r = byId.get(result.id);
    const mandatory = r?.kind === "mandatory" || (r?.kind === "returnable" && r.tier === "mandatory");
    if (mandatory && result.status !== "met") counts.blocking++;
  }
  return counts;
}

export function RequirementsChecklist({
  requirements,
  evaluation,
  audience,
}: {
  requirements: TenderRequirement[];
  evaluation: Pick<Evaluation, "requirements" | "technical">;
  audience: "sme" | "buyer";
}) {
  const results = new Map((evaluation.requirements ?? []).map((r) => [r.id, r]));
  const codes = requirementCodes(requirements);
  const counts = resultCounts(requirements, evaluation.requirements ?? []);
  const technical = evaluation.technical;
  const you = audience === "sme";

  return (
    <div className="space-y-5">
      <StatStrip
        part="requirements-stats"
        items={[
          { label: "Met", value: `${counts.met} of ${results.size}` },
          { label: "Still needed", value: counts.partial + counts.missing },
          { label: you ? "Stopping you qualifying" : "Disqualifying gaps", value: counts.blocking },
          ...(technical
            ? [
                {
                  label: "Technical points",
                  value: `${technical.points} of ${technical.available}`,
                  context: technical.threshold !== undefined ? `Minimum ${technical.threshold}` : undefined,
                },
              ]
            : []),
        ]}
      />

      {REQUIREMENT_GROUPS.filter((g) => g.kind !== "condition").map((group) => {
        const list = requirements.filter((r) => r.kind === group.kind && results.has(r.id));
        if (!list.length) return null;
        // What still needs doing first, so the list reads as a to-do
        const order = { missing: 0, partial: 1, met: 2 };
        list.sort((a, b) => order[results.get(a.id)!.status] - order[results.get(b.id)!.status]);
        return (
          <div key={group.kind}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{group.title}</p>
            <ul className="divide-y rounded-lg border">
              {list.map((r) => {
                const result = results.get(r.id)!;
                const look = RESULT[result.status];
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "space-y-1.5 p-3 text-sm",
                      result.status !== "met" && "border-l-4",
                      result.status === "missing" && "border-l-destructive",
                      result.status === "partial" && "border-l-warning",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{codes.get(r.id)}</span>
                        <span className="font-medium">{r.text}</span>
                      </p>
                      <span className="flex shrink-0 items-center gap-2">
                        {result.points !== undefined && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {result.points} of {r.points ?? "?"}
                          </span>
                        )}
                        <Status tone={look.tone} icon={look.icon}>
                          {look.label}
                        </Status>
                      </span>
                    </div>
                    {(r.action || r.tier) && (
                      <p className="flex flex-wrap gap-1.5">
                        {r.action && <Tag>{ACTION_LABELS[r.action]}</Tag>}
                        {r.tier && <Tag>{TIER_LABELS[r.tier]}</Tag>}
                      </p>
                    )}
                    {result.has.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{you ? "You have: " : "Has: "}</span>
                        {result.has.join(". ")}
                      </p>
                    )}
                    {result.needs.length > 0 && (
                      <p className="text-xs">
                        <span className="font-medium">{you ? "To do: " : "Needs: "}</span>
                        {result.needs.join(" ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
