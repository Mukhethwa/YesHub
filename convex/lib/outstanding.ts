import { DOCUMENTS, docStatus } from "../../src/lib/sme/documents";
import type { SmeProfile } from "../../src/lib/sme/types";
import type { DocKey, Evaluation, TenderRequirement } from "../schema";
import { profileDocumentFor } from "./tender";

/*
 * What an SME still has to supply for an opportunity, as recommendations: standard company documents to
 * upload once on the Documents tab, and the tender's own forms and evidence to attach to the application.
 * Before applying it's worked out from the profile; after the review, from what the review found in the
 * documents sent. Only document names and what to do leave here: never a score, a point or a ranking.
 */

export type Tender = { requirements: TenderRequirement[]; threshold: number | null; documentName: string | null };

/** How much a missing document matters, as the tender says. */
export type Weight = "disqualifies" | "may-disqualify" | "requested" | "recommended";

export type Outstanding = {
  id: string;
  name: string;
  /** "profile": upload it on the Documents tab. "application": attach it to this application. */
  where: "profile" | "application";
  todo: string;
  weight: Weight;
};

export const WEIGHTS: Record<Weight, string> = {
  disqualifies: "Missing it disqualifies",
  "may-disqualify": "Missing it may disqualify",
  requested: "Asked for in the tender",
  recommended: "Strengthens your bid",
};

const ORDER: Record<Weight, number> = { disqualifies: 0, "may-disqualify": 1, requested: 2, recommended: 3 };

const docLabel = (key: string) => DOCUMENTS.find((d) => d.key === key)?.label ?? key;

function weightOf(r: TenderRequirement): Weight {
  if (r.tier === "mandatory") return "disqualifies";
  if (r.tier === "essential") return "may-disqualify";
  if (r.tier === "scoring") return "recommended";
  return "requested";
}

/** Before applying: what the profile doesn't have yet, and the tender's forms to bring. */
export function outstandingBeforeApplying(tender: Tender | null, requiredDocuments: string[], sme: SmeProfile) {
  const items: Outstanding[] = [];
  const seen = new Set<string>();
  const profileItem = (key: string, weight: Weight, name = docLabel(key)) => {
    if (seen.has(key) || docStatus(sme, key as DocKey) === "ok") return;
    seen.add(key);
    const expired = docStatus(sme, key as DocKey) === "expired";
    items.push({
      id: `profile-${key}`,
      name,
      where: "profile",
      todo: expired
        ? `Your ${docLabel(key)} has expired. Upload a current one on your Documents tab.`
        : `Upload your ${docLabel(key)} on your Documents tab. It then counts for every tender.`,
      weight,
    });
  };
  for (const key of requiredDocuments) profileItem(key, "disqualifies");
  for (const r of tender?.requirements ?? []) {
    if (r.kind !== "returnable" || r.action === "review") continue;
    const key = profileDocumentFor(r.text);
    if (key) {
      profileItem(key, weightOf(r), r.text);
      continue;
    }
    items.push({
      id: r.id,
      name: r.text,
      where: "application",
      todo:
        r.action === "complete_and_sign"
          ? "Download it from the tender documents, fill in every field, sign and date it, and attach it when you apply."
          : "Attach it when you apply.",
      weight: weightOf(r),
    });
  }
  return items.sort((a, b) => ORDER[a.weight] - ORDER[b.weight]);
}

/** After the review: what the application is still missing, read from the documents the SME sent. */
export function outstandingAfterReview(tender: Tender, evaluation: Evaluation) {
  const results = new Map((evaluation.requirements ?? []).map((r) => [r.id, r]));
  const items: Outstanding[] = [];
  for (const r of tender.requirements) {
    const result = results.get(r.id);
    if (!result || result.status === "met") continue;
    if (r.kind === "returnable") {
      items.push({
        id: r.id,
        name: r.text,
        where: profileDocumentFor(r.text) ? "profile" : "application",
        todo: result.needs[0] ?? (result.status === "partial" ? "It looks incomplete. Send it again." : "Attach it."),
        weight: weightOf(r),
      });
    } else if (r.kind === "mandatory") {
      items.push({
        id: r.id,
        name: `A document showing: ${r.text}`,
        where: "application",
        todo:
          result.status === "partial"
            ? "What you sent doesn’t show this clearly. Attach a document that does: a certificate, letter or reference."
            : "Nothing you sent shows this. Attach a document that does: a certificate, letter or reference.",
        weight: "disqualifies",
      });
    } else if (r.kind === "scored") {
      const lacking = (r.items ?? []).filter((item) => !result.has.some((h) => h.includes(item)));
      items.push({
        id: r.id,
        name: `Supporting documents for: ${r.text}`,
        where: "application",
        todo: lacking.length
          ? `Attach evidence of: ${lacking.join("; ")}.`
          : "Attach evidence such as references, CVs, certificates or examples of similar work.",
        weight: "recommended",
      });
    }
  }
  return items.sort((a, b) => ORDER[a.weight] - ORDER[b.weight]);
}
