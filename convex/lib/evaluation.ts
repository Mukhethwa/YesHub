import { DOCUMENTS, docStatus, documentProgress } from "../../src/lib/sme/documents";
import type { Doc } from "../_generated/dataModel";
import type { DocKey, Evaluation } from "../schema";

/*
 * MASLink's built-in eligibility check, standing in for Jev until the Jev integration ranks applications.
 * Jev will write an Evaluation with engine "jev" in the same shape, so the dashboards don't change.
 *
 * Required checks decide whether an SME qualifies. Everything else only moves the score, which ranks
 * applicants within an opportunity: qualifying SMEs first, then by score.
 */

type Check = Evaluation["checks"][number];

/** What the check reads from an opportunity, so the SME portal can preview fit in the browser too. */
export type EvaluableOpportunity = Pick<
  Doc<"opportunities">,
  "provinces" | "minBbbeeLevel" | "requiredDocuments" | "industry" | "services"
>;

/** "Level 3" → 3. Null for "Non-compliant" or anything unrecognised. */
export function bbbeeLevelNumber(level: string) {
  const match = /^Level ([1-8])$/.exec(level.trim());
  return match ? Number(match[1]) : null;
}

const docLabel = (key: string) => DOCUMENTS.find((d) => d.key === key)?.label ?? key;
const lower = (values: string[]) => values.map((v) => v.trim().toLowerCase());

function listJoin(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function provinceCheck(opportunity: EvaluableOpportunity, sme: Doc<"smes">): Check {
  const base = { id: "province", label: "Delivers where the work is", required: true };
  if (opportunity.provinces.length === 0) return { ...base, passed: true, detail: "Nationwide opportunity" };
  if (sme.nationwide) return { ...base, passed: true, detail: "Delivers nationwide" };
  const covered = opportunity.provinces.filter((p) => sme.provinces.includes(p));
  return covered.length > 0
    ? { ...base, passed: true, detail: `Delivers in ${listJoin(covered)}` }
    : { ...base, passed: false, detail: `Doesn’t deliver in ${listJoin(opportunity.provinces)}` };
}

function bbbeeCheck(opportunity: EvaluableOpportunity, sme: Doc<"smes">): Check | null {
  if (opportunity.minBbbeeLevel === undefined) return null;
  const base = { id: "bbbee", label: `B-BBEE Level ${opportunity.minBbbeeLevel} or better`, required: true };
  const level = bbbeeLevelNumber(sme.bbbeeLevel);
  if (level === null)
    return { ...base, passed: false, detail: `${sme.bbbeeLevel || "No B-BBEE level"} doesn’t meet the minimum` };
  return level <= opportunity.minBbbeeLevel
    ? { ...base, passed: true, detail: `${sme.bbbeeLevel} meets the minimum` }
    : { ...base, passed: false, detail: `${sme.bbbeeLevel} is below the Level ${opportunity.minBbbeeLevel} minimum` };
}

function documentsCheck(opportunity: EvaluableOpportunity, sme: Doc<"smes">): Check | null {
  if (opportunity.requiredDocuments.length === 0) return null;
  const base = { id: "documents", label: "Required documents valid", required: true };
  const problems = opportunity.requiredDocuments.flatMap((key) => {
    const status = docStatus(sme, key as DocKey);
    if (status === "missing") return [`missing ${docLabel(key)}`];
    if (status === "expired") return [`${docLabel(key)} expired`];
    return [];
  });
  return problems.length === 0
    ? { ...base, passed: true, detail: `All ${opportunity.requiredDocuments.length} documents on file and current` }
    : { ...base, passed: false, detail: problems.join("; ").replace(/^./, (c) => c.toUpperCase()) };
}

function sectorCheck(opportunity: EvaluableOpportunity, sme: Doc<"smes">, serviceMatches: string[]): Check {
  const base = { id: "sector", label: "Works in this field", required: true };
  if (!opportunity.industry) return { ...base, passed: true, detail: "Open to all industries" };
  if (sme.industry === opportunity.industry) return { ...base, passed: true, detail: sme.industry };
  if (serviceMatches.length > 0) return { ...base, passed: true, detail: `Offers ${listJoin(serviceMatches)}` };
  return { ...base, passed: false, detail: `Works in ${sme.industry}, not ${opportunity.industry}` };
}

/** Evaluates one SME against one opportunity. Call from mutations only: expiry checks read today's date. */
export function evaluateApplication(opportunity: EvaluableOpportunity, sme: Doc<"smes">): Evaluation {
  const wanted = lower(opportunity.services);
  const serviceMatches = sme.services.filter((s) => wanted.includes(s.trim().toLowerCase()));

  const required = [
    provinceCheck(opportunity, sme),
    bbbeeCheck(opportunity, sme),
    documentsCheck(opportunity, sme),
    sectorCheck(opportunity, sme, serviceMatches),
    {
      id: "standing",
      label: "In good standing on MASLink",
      required: true,
      passed: !sme.suspendedAt,
      detail: sme.suspendedAt ? "Profile suspended by MASLink" : "Active profile",
    },
  ].filter((c): c is Check => c !== null);

  const pack = documentProgress(sme);
  const strengths: Check[] = [
    {
      id: "verified",
      label: "Verified by MASLink",
      required: false,
      passed: !!sme.verifiedAt,
      detail: sme.verifiedAt ? "Profile and documents checked" : "Not verified yet",
    },
    {
      id: "csd",
      label: "Registered on the CSD",
      required: false,
      passed: !!sme.csdNumber,
      detail: sme.csdNumber ? sme.csdNumber : "No Central Supplier Database number",
    },
    {
      id: "services",
      label: "Offers the services needed",
      required: false,
      passed: serviceMatches.length > 0,
      detail: serviceMatches.length > 0 ? listJoin(serviceMatches) : "No matching services listed",
    },
    {
      id: "pack",
      label: "Complete document pack",
      required: false,
      passed: pack.percent >= 75,
      detail: `${pack.done} of ${pack.total} documents uploaded`,
    },
  ];

  const passedRequired = required.filter((c) => c.passed).length;
  const qualifies = passedRequired === required.length;

  // 60 points for meeting requirements, 40 for strengths, so a qualifying SME always outranks one that doesn't
  const score = Math.round(
    (passedRequired / required.length) * 60 +
      (sme.verifiedAt ? 10 : 0) +
      (sme.csdNumber ? 10 : 0) +
      Math.min(serviceMatches.length, 2) * 5 +
      (pack.percent / 100) * 10,
  );

  const failed = required.filter((c) => !c.passed);
  const summary = qualifies
    ? `Meets all ${required.length} requirements${sme.verifiedAt ? " and is verified by MASLink" : ""}`
    : `Doesn’t qualify. ${failed.map((c) => c.detail).join(". ")}.`;

  return {
    engine: "rules",
    qualifies,
    score: qualifies ? score : Math.min(score, 59),
    summary,
    checks: [...required, ...strengths],
    evaluatedAt: Date.now(),
  };
}
