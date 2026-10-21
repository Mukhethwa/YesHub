"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Pill } from "@/components/admin/page-header";
import { daysUntil } from "@/components/enterprise/tenders";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { getSettings } from "@/lib/sme/settings";
import type { SmeProfile } from "@/lib/sme/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { evaluateApplication, type EvaluableOpportunity } from "../../../convex/lib/evaluation";
import type { ApplicationStatus, Evaluation, OpportunityKind } from "../../../convex/schema";

export type FeedItem = NonNullable<FunctionReturnType<typeof api.smeOpportunities.feed>>[number];

/* ------------------------------------------------------------------------------------------------------ */
/* Where an opportunity is, relative to the SME                                                           */
/* ------------------------------------------------------------------------------------------------------ */

/** home: in the SME's head office province. provinces: elsewhere it delivers. nationwide: open to all of SA. */
export type Reach = "home" | "provinces" | "nationwide" | "outside";

export function reachOf(opportunity: { provinces: string[] }, sme: SmeProfile): Reach {
  if (opportunity.provinces.length === 0) return "nationwide";
  if (opportunity.provinces.includes(sme.hqProvince)) return "home";
  if (sme.nationwide || opportunity.provinces.some((p) => sme.provinces.includes(p))) return "provinces";
  return "outside";
}

export function reachLabel(reach: Reach, opportunity: { provinces: string[] }, sme: SmeProfile) {
  switch (reach) {
    case "home":
      return `In ${sme.hqProvince}`;
    case "provinces":
      return `In ${opportunity.provinces.filter((p) => sme.nationwide || sme.provinces.includes(p)).join(", ")}`;
    case "nationwide":
      return "Nationwide";
    default:
      return `Outside your area (${opportunity.provinces.join(", ")})`;
  }
}

/* ------------------------------------------------------------------------------------------------------ */
/* The SME's matching preferences (Settings)                                                              */
/* ------------------------------------------------------------------------------------------------------ */

const TYPE_FOR_SETTING: Record<string, OpportunityKind> = {
  Tenders: "tender",
  RFQs: "rfq",
  "Grants & funding": "grant",
};

/** "R250 000 and above" → 250000; "Any value" → 0. */
export function minimumValue(setting: string) {
  const digits = Number(setting.replace(/[^\d]/g, ""));
  if (!digits) return 0;
  return /million/i.test(setting) ? digits * 1_000_000 : digits;
}

/** The kinds of opportunity the SME asked to see in Settings. All kinds when none of these are ticked. */
export function preferredKinds(sme: SmeProfile): OpportunityKind[] {
  const kinds = getSettings(sme)
    .opportunityTypes.map((t) => TYPE_FOR_SETTING[t])
    .filter((k): k is OpportunityKind => !!k);
  return kinds.length > 0 ? kinds : ["tender", "rfq", "grant"];
}

/* ------------------------------------------------------------------------------------------------------ */
/* Matches                                                                                                */
/* ------------------------------------------------------------------------------------------------------ */

export type Match = FeedItem & { evaluation: Evaluation; reach: Reach };

/**
 * Open opportunities that haven't closed, each checked against the SME with the same rules buyers use,
 * best fit first. Undefined while loading.
 */
export function useMatches(sme: SmeProfile) {
  const feed = useQuery(api.smeOpportunities.feed);
  return useMemo(() => {
    if (!feed) return feed;
    return feed
      .filter((o) => daysUntil(o.closesAt) >= 0)
      .map((o) => ({
        ...o,
        evaluation: evaluateApplication(o as EvaluableOpportunity, sme),
        reach: reachOf(o, sme),
      }))
      .sort(
        (a, b) =>
          Number(b.evaluation.qualifies) - Number(a.evaluation.qualifies) ||
          b.evaluation.score - a.evaluation.score ||
          a.closesAt.localeCompare(b.closesAt),
      );
  }, [feed, sme]);
}

/* ------------------------------------------------------------------------------------------------------ */
/* Shared display pieces                                                                                  */
/* ------------------------------------------------------------------------------------------------------ */

const STATUS: Record<ApplicationStatus, { label: string; tone: "neutral" | "success" | "danger" | "info" }> = {
  submitted: { label: "Submitted", tone: "neutral" },
  shortlisted: { label: "Shortlisted", tone: "success" },
  declined: { label: "Not successful", tone: "danger" },
  awarded: { label: "Awarded", tone: "info" },
};

export function ApplicationStatusPill({ status }: { status: ApplicationStatus }) {
  return <Pill tone={STATUS[status].tone}>{STATUS[status].label}</Pill>;
}

export function FitPill({ evaluation }: { evaluation: Evaluation }) {
  return evaluation.qualifies ? <Pill tone="success">You qualify</Pill> : <Pill tone="danger">You don’t qualify yet</Pill>;
}

/** Requirements and strengths, met or not. */
export function ChecksList({ evaluation }: { evaluation: Evaluation }) {
  const groups = [
    { title: "Requirements", checks: evaluation.checks.filter((c) => c.required) },
    { title: "Strengths", checks: evaluation.checks.filter((c) => !c.required) },
  ];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</p>
          <ul className="space-y-2">
            {group.checks.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.detail}</span>
                </span>
                <span className={c.passed ? "shrink-0 text-xs font-medium text-success" : "shrink-0 text-xs font-medium text-destructive"}>
                  {c.passed ? "Met" : "Not met"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Applies straight away when the SME qualifies; otherwise asks first, since the buyer will see the gaps. */
export function ApplyButton({
  opportunityId,
  title,
  qualifies,
  size = "sm",
}: {
  opportunityId: Id<"opportunities">;
  title: string;
  qualifies: boolean;
  size?: "sm" | "default";
}) {
  const apply = useMutation(api.smeOpportunities.apply);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const submit = async () => {
    setPending(true);
    try {
      await apply({ opportunityId });
      toast.success(`Applied to ${title}`);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t send your application."));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button size={size} disabled={pending} onClick={() => (qualifies ? submit() : setConfirming(true))}>
        {pending && <Spinner />}
        Apply
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You don’t meet every requirement yet</AlertDialogTitle>
            <AlertDialogDescription>
              The buyer will see which requirements you don’t meet. Fixing them first, for example by renewing an
              expired document, gives you a better chance. Apply anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={submit}>Apply anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
