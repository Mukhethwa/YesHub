// Shared by the browser and Convex, so only relative imports here.
import { getSettings } from "../../src/lib/sme/settings";
import type { Doc } from "../_generated/dataModel";
import type { Evaluation, OpportunityKind } from "../schema";
import { isEsd } from "./kinds";

/*
 * When a listing is a match for an SME: My matches and Support programmes use these rules, and so do the
 * WhatsApp alerts sent when a listing is published (matchAlerts.ts), so both always agree.
 */

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
export function preferredKinds(sme: Pick<Doc<"smes">, "settings">): OpportunityKind[] {
  const kinds = getSettings(sme)
    .opportunityTypes.map((t) => TYPE_FOR_SETTING[t])
    .filter((k): k is OpportunityKind => !!k);
  return kinds.length > 0 ? kinds : ["tender", "rfq", "grant"];
}

/**
 * Whether the SME's profile fits what the listing is for (where the work is, B-BBEE level, its field, good
 * standing). Documents aren't part of it: missing documents are something to fix, so they're recommendations.
 */
export function fitsProfile(evaluation: Evaluation) {
  return evaluation.checks.filter((c) => c.required && c.id !== "documents").every((c) => c.passed);
}

/**
 * Whether a newly published listing is a match worth alerting the SME to: it fits their profile and, for a
 * tender or RFQ, the kinds and minimum value in their matching settings. ESD programmes reach every SME they
 * fit, since the settings only name grants.
 */
export function isNewMatch(
  opportunity: Pick<Doc<"opportunities">, "kind" | "value">,
  sme: Pick<Doc<"smes">, "settings">,
  evaluation: Evaluation,
) {
  if (!fitsProfile(evaluation)) return false;
  if (isEsd(opportunity.kind)) return true;
  if (!preferredKinds(sme).includes(opportunity.kind)) return false;
  const minimum = minimumValue(getSettings(sme).minContractValue);
  return opportunity.value === undefined || opportunity.value >= minimum;
}
