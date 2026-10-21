import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { OpportunityKind, OpportunityListing, OpportunityStatus } from "../schema";
import { evaluateApplication } from "./evaluation";

/** Most applications read for one opportunity. Enough for any tender we expect during the pilot. */
export const APPLICATION_LIMIT = 500;

/** Files an organisation can release with an opportunity: PDFs, Word and Excel documents, images. */
export const TENDER_DOC_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
];
export const TENDER_DOC_MAX_MB = 10;

async function deleteApplication(ctx: MutationCtx, applicationId: Id<"applications">) {
  for await (const entry of ctx.db.query("applicationActivity").withIndex("by_application", (q) => q.eq("applicationId", applicationId))) {
    await ctx.db.delete("applicationActivity", entry._id);
  }
  await ctx.db.delete("applications", applicationId);
}

/** Removes an SME's applications and their activity. Call wherever an SME profile is deleted. */
export async function deleteApplicationsForSme(ctx: MutationCtx, smeId: Id<"smes">) {
  for await (const application of ctx.db.query("applications").withIndex("by_sme_and_opportunity", (q) => q.eq("smeId", smeId))) {
    await deleteApplication(ctx, application._id);
  }
}

/**
 * Removes an organisation's opportunities with their applications, activity and released documents.
 * Call when an organisation is deleted.
 */
export async function deleteOpportunitiesForOrganization(ctx: MutationCtx, organizationId: string, demoOnly = false) {
  for await (const opportunity of ctx.db.query("opportunities").withIndex("by_organization", (q) => q.eq("organizationId", organizationId))) {
    if (demoOnly && !opportunity.isDemo) continue;
    for await (const application of ctx.db.query("applications").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))) {
      await deleteApplication(ctx, application._id);
    }
    for await (const doc of ctx.db.query("opportunityDocuments").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))) {
      await ctx.storage.delete(doc.storageId);
      await ctx.db.delete("opportunityDocuments", doc._id);
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

/** The published notice and released documents for each sample opportunity, keyed by its code. */
const SAMPLE_LISTINGS: Record<
  string,
  Omit<OpportunityListing, "enquiriesName" | "enquiriesEmail" | "publishedAt"> & { documents: string[] }
> = {
  FAC: {
    scope:
      "Daily office cleaning, washroom hygiene services (sanitary bins, consumables) and quarterly deep cleans for 9 regional offices and 22 branches in Gauteng and KwaZulu-Natal. The supplier provides all staff, equipment and consumables and must keep a supervisor on call during business hours.",
    contractPeriod: "36 months, with a 3-month performance review",
    briefing: "Optional virtual briefing session on Microsoft Teams, 10:00 on the Tuesday after publication",
    submission:
      "Submit one PDF containing the completed RFQ, pricing schedule and SBD forms through YES Hub before 11:00 on the closing date. Late submissions are not considered.",
    evaluationCriteria: [
      "Functionality: 60 points minimum to proceed (capacity, references, supervision plan)",
      "Price: 80 points",
      "B-BBEE status: 20 points",
    ],
    documents: ["Request for quotation", "Site list and cleaning specification", "Pricing schedule"],
  },
  CAT: {
    scope:
      "Breakfast and lunch service for about 600 staff at the Stellenbosch head office, five days a week, from the on-site kitchen. Menus must include halaal and vegetarian options and rotate every four weeks.",
    contractPeriod: "12 months, renewable for a further 12 months",
    briefing: "Compulsory site visit at the Stellenbosch head office kitchen, 09:00 on the Thursday after publication",
    submission: "Quote through YES Hub with a sample four-week menu and your price per meal.",
    evaluationCriteria: ["Price per meal: 80 points", "B-BBEE status: 20 points", "Food safety certificate required"],
    documents: ["Request for quotation", "Kitchen equipment list"],
  },
  BLD: {
    scope:
      "Interior refurbishment of 18 branches in North West and Gauteng: removing and installing partitioning, painting, vinyl flooring and minor plumbing. Work happens after hours so branches can trade.",
    contractPeriod: "9 months from site handover",
    briefing: "Compulsory briefing at the Rustenburg branch, 10:00 on the Monday after publication",
    submission:
      "Submit the bill of quantities, programme of works and CIDB certificate through YES Hub before 12:00 on the closing date.",
    evaluationCriteria: [
      "CIDB grading 4GB or higher required",
      "Functionality: 70 points minimum to proceed",
      "Price: 80 points",
      "B-BBEE status: 20 points",
    ],
    documents: ["Terms of reference", "Bill of quantities", "Branch drawings pack"],
  },
  SEC: {
    scope:
      "24-hour guarding, access control and incident reporting at 14 branches in Durban, with armed response backup and monthly reporting.",
    contractPeriod: "24 months",
    briefing: "",
    submission: "Submit your proposal, PSIRA certificates for the company and guards, and pricing through YES Hub.",
    evaluationCriteria: ["PSIRA registration required", "Price: 80 points", "B-BBEE status: 20 points"],
    documents: ["Request for proposal", "Branch list and guarding schedule"],
  },
  GRT: {
    scope:
      "Grants of up to R250 000 for equipment and working capital for township businesses, with 12 months of mentoring from the enterprise development team.",
    contractPeriod: "Grant paid over 12 months against milestones",
    briefing: "Information session online, 14:00 on the Wednesday after publication",
    submission: "Apply through YES Hub with a one-page business plan and a quote for the equipment you need.",
    evaluationCriteria: [
      "Business based in or serving a township",
      "At least one year of trading",
      "Growth and job creation potential",
    ],
    documents: ["Grant guidelines", "Business plan template"],
  },
  LOG: {
    scope:
      "Twice-weekly collection and delivery of documents and parcels between branches in Kimberley, Upington and De Aar, with proof of delivery.",
    contractPeriod: "12 months",
    briefing: "",
    submission: "Quote through YES Hub with a price per trip and your vehicle details.",
    evaluationCriteria: ["Price: 80 points", "B-BBEE status: 20 points"],
    documents: ["Request for quotation"],
  },
};

function sampleCodeFor(title: string) {
  return SAMPLE_OPPORTUNITIES.find((s) => s.title === title)?.code;
}

/** A sample opportunity's listing, or null when the title isn't one of the samples. */
export function sampleListingFor(title: string, organizationName: string, publishedAt: number): OpportunityListing | null {
  const code = sampleCodeFor(title);
  if (!code) return null;
  const { scope, contractPeriod, briefing, submission, evaluationCriteria } = SAMPLE_LISTINGS[code];
  return {
    scope,
    contractPeriod,
    briefing,
    submission,
    evaluationCriteria,
    enquiriesName: `${organizationName} procurement office`,
    enquiriesEmail: `tenders@${organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.test`,
    publishedAt,
  };
}

/** The documents a sample opportunity was released with. */
export function sampleDocumentLabelsFor(title: string) {
  const code = sampleCodeFor(title);
  return code ? SAMPLE_LISTINGS[code].documents : [];
}

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
      listing: sampleListingFor(sample.title, organizationName, Date.now() - 14 * DAY) ?? undefined,
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
