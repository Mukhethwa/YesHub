import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { OpportunityKind, OpportunityStatus } from "../schema";
import { evaluateApplication } from "./evaluation";

/** Most applications read for one opportunity. Enough for any tender we expect during the pilot. */
export const APPLICATION_LIMIT = 500;

/** Removes an SME's applications. Call wherever an SME profile is deleted. */
export async function deleteApplicationsForSme(ctx: MutationCtx, smeId: Id<"smes">) {
  for await (const application of ctx.db.query("applications").withIndex("by_sme_and_opportunity", (q) => q.eq("smeId", smeId))) {
    await ctx.db.delete("applications", application._id);
  }
}

/** Removes an organisation's opportunities and every application to them. Call when an organisation is deleted. */
export async function deleteOpportunitiesForOrganization(ctx: MutationCtx, organizationId: string, demoOnly = false) {
  for await (const opportunity of ctx.db.query("opportunities").withIndex("by_organization", (q) => q.eq("organizationId", organizationId))) {
    if (demoOnly && !opportunity.isDemo) continue;
    for await (const application of ctx.db.query("applications").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))) {
      await ctx.db.delete("applications", application._id);
    }
    await ctx.db.delete("opportunities", opportunity._id);
  }
}

/* ------------------------------------------------------------------------------------------------------ */
/* Sample tenders for development                                                                         */
/* ------------------------------------------------------------------------------------------------------ */

function isoDate(daysFromToday: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

const DAY = 24 * 60 * 60 * 1000;

type SampleOpportunity = {
  code: string;
  kind: OpportunityKind;
  title: string;
  description: string;
  industry: string;
  services: string[];
  provinces: string[];
  minBbbeeLevel?: number;
  requiredDocuments: string[];
  value: number;
  closesInDays: number;
  status: OpportunityStatus;
};

const SAMPLE_OPPORTUNITIES: SampleOpportunity[] = [
  {
    code: "FAC",
    kind: "tender",
    title: "Office cleaning and hygiene services, 36 months",
    description: "Daily cleaning, washroom hygiene and deep cleans for regional offices and branches.",
    industry: "Cleaning & Facilities Management",
    services: ["Office cleaning", "Hygiene services"],
    provinces: ["Gauteng", "KwaZulu-Natal"],
    minBbbeeLevel: 4,
    requiredDocuments: ["bbbeeCertificate", "taxCertificate", "cipcCertificate"],
    value: 4_800_000,
    closesInDays: 12,
    status: "open",
  },
  {
    code: "CAT",
    kind: "rfq",
    title: "Staff canteen catering, Stellenbosch head office",
    description: "Breakfast and lunch for about 600 staff, five days a week, with halaal and vegetarian options.",
    industry: "Hospitality, Catering & Events",
    services: ["Corporate catering"],
    provinces: ["Western Cape"],
    minBbbeeLevel: 2,
    requiredDocuments: ["bbbeeCertificate", "taxCertificate"],
    value: 950_000,
    closesInDays: 5,
    status: "open",
  },
  {
    code: "BLD",
    kind: "tender",
    title: "Branch refurbishment programme, North West and Gauteng",
    description: "Interior refurbishment of 18 branches: partitioning, painting, flooring and minor plumbing.",
    industry: "Construction & Built Environment",
    services: ["General building", "Painting & renovations"],
    provinces: ["North West", "Gauteng"],
    minBbbeeLevel: 3,
    requiredDocuments: ["bbbeeCertificate", "taxCertificate", "cipcCertificate", "coidaLetter"],
    value: 12_500_000,
    closesInDays: 21,
    status: "open",
  },
  {
    code: "SEC",
    kind: "tender",
    title: "Guarding services for 14 Durban branches",
    description: "Armed and unarmed guarding, access control and incident reporting.",
    industry: "Security Services",
    services: ["Guarding", "Access control"],
    provinces: ["KwaZulu-Natal"],
    minBbbeeLevel: 4,
    requiredDocuments: ["bbbeeCertificate", "taxCertificate", "cipcCertificate"],
    value: 6_200_000,
    closesInDays: 30,
    status: "open",
  },
  {
    code: "GRT",
    kind: "grant",
    title: "Supplier development grant for township businesses",
    description: "Grants of up to R250 000 for equipment and working capital, with 12 months of mentoring.",
    industry: "",
    services: [],
    provinces: [],
    minBbbeeLevel: 2,
    requiredDocuments: ["bbbeeCertificate", "cipcCertificate"],
    value: 250_000,
    closesInDays: 40,
    status: "open",
  },
  {
    code: "LOG",
    kind: "rfq",
    title: "Courier services for Northern Cape branches",
    description: "Twice-weekly document and parcel runs between Kimberley, Upington and De Aar.",
    industry: "Transport & Logistics",
    services: ["Courier services"],
    provinces: ["Northern Cape"],
    requiredDocuments: ["taxCertificate"],
    value: 380_000,
    closesInDays: -4,
    status: "closed",
  },
];

/** "Capitec Bank" → "CAP". */
export function referencePrefix(name: string) {
  const letters = name.replace(/[^A-Za-z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "ORG").padEnd(3, "X");
}

/**
 * Dev only: gives an organisation sample tenders, each with applications from the SMEs already on YES Hub
 * (suspended ones excluded). SMEs apply where they work in the field, plus a few that don't fit, so every
 * dashboard shows both qualifying and non-qualifying applicants. Returns how many opportunities it added.
 */
export async function insertSampleOpportunities(
  ctx: MutationCtx,
  { organizationId, organizationName, createdBy }: { organizationId: string; organizationName: string; createdBy: string },
) {
  const existing = await ctx.db
    .query("opportunities")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(1);
  if (existing.length > 0) return 0;

  const smes = (await ctx.db.query("smes").take(50)).filter((s: Doc<"smes">) => !s.suspendedAt);
  const prefix = referencePrefix(organizationName);
  const year = new Date().getFullYear();

  for (const [i, sample] of SAMPLE_OPPORTUNITIES.entries()) {
    const opportunityId = await ctx.db.insert("opportunities", {
      organizationId,
      createdBy,
      kind: sample.kind,
      title: sample.title,
      reference: `${prefix}-${sample.code}-${year}-${String(i + 11).padStart(3, "0")}`,
      description: sample.description,
      industry: sample.industry,
      services: sample.services,
      provinces: sample.provinces,
      minBbbeeLevel: sample.minBbbeeLevel,
      requiredDocuments: sample.requiredDocuments,
      value: sample.value,
      closesAt: isoDate(sample.closesInDays),
      status: sample.status,
      isDemo: true,
    });
    const opportunity = (await ctx.db.get("opportunities", opportunityId))!;

    const applicants = smes.filter(
      (sme, j) => !sample.industry || sme.industry === sample.industry || (i + j) % 4 === 0,
    );
    const evaluated = applicants.map((sme, j) => ({ sme, j, evaluation: evaluateApplication(opportunity, sme) }));
    // On a closed opportunity the buyer has already shortlisted the best qualifying applicant
    const best = evaluated.filter((a) => a.evaluation.qualifies).sort((a, b) => b.evaluation.score - a.evaluation.score)[0];

    for (const { sme, j, evaluation } of evaluated) {
      await ctx.db.insert("applications", {
        opportunityId,
        organizationId,
        smeId: sme._id,
        status: sample.status === "closed" && best?.sme._id === sme._id ? "shortlisted" : "submitted",
        submittedAt: Date.now() - (1 + ((i * 3 + j * 2) % 9)) * DAY,
        evaluation,
      });
    }
  }
  return SAMPLE_OPPORTUNITIES.length;
}
