import { defineSchema, defineTable } from "convex/server";
import { type Infer, v } from "convex/values";

const docRef = v.object({
  // Optional so profiles can exist before documents move to Convex file storage
  storageId: v.optional(v.id("_storage")),
  name: v.string(),
  size: v.number(),
  type: v.string(),
  uploadedAt: v.string(),
});

export const smeDocuments = v.object({
  bbbeeCertificate: v.optional(docRef),
  taxCertificate: v.optional(docRef),
  cipcCertificate: v.optional(docRef),
  companyProfile: v.optional(docRef),
  csdReport: v.optional(docRef),
  bankLetter: v.optional(docRef),
  coidaLetter: v.optional(docRef),
  proofOfAddress: v.optional(docRef),
});

export type DocRef = Infer<typeof docRef>;
export type DocKey = keyof Infer<typeof smeDocuments>;

export const smeSettings = v.object({
  // Alert channels
  notifyEmail: v.boolean(),
  notifySms: v.boolean(),
  notifyWhatsapp: v.boolean(),
  language: v.string(),

  // What to be alerted about
  alertNewMatches: v.boolean(),
  alertDeadlines: v.boolean(),
  deadlineReminderDays: v.string(),
  alertStatusUpdates: v.boolean(),
  alertDocExpiry: v.boolean(),
  weeklyDigest: v.boolean(),

  // Matching
  opportunityTypes: v.array(v.string()),
  minContractValue: v.string(),
  eligibleOnly: v.boolean(),

  // Data & privacy
  lowDataMode: v.boolean(),
  profileVisible: v.boolean(),
  shareContactAfterShortlist: v.boolean(),
});

/** Fields captured at registration (YesHub's SmeDetails). */
export const smeDetails = {
  // Company
  companyName: v.string(),
  registrationNumber: v.string(),
  csdNumber: v.string(),
  industry: v.string(),
  yearsTrading: v.string(),
  employees: v.string(),
  address: v.string(),
  city: v.string(),
  hqProvince: v.string(),

  // Services & capabilities
  services: v.array(v.string()),
  capabilities: v.string(),
  accreditations: v.array(v.string()),

  // Coverage
  nationwide: v.boolean(),
  provinces: v.array(v.string()),
  serviceAreas: v.array(v.string()),

  // Compliance (dates are ISO yyyy-mm-dd, empty when unknown)
  bbbeeLevel: v.string(),
  bbbeeExpiry: v.string(),
  taxExpiry: v.string(),
  website: v.string(),

  // Primary contact
  contactName: v.string(),
  contactRole: v.string(),
  email: v.string(),
  phone: v.string(),
};

export const smeDetailsValidator = v.object(smeDetails);
export type SmeDetails = Infer<typeof smeDetailsValidator>;
export type SmeSettings = Infer<typeof smeSettings>;

export const opportunityKind = v.union(v.literal("tender"), v.literal("rfq"), v.literal("grant"));
export const opportunityStatus = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closed"),
  v.literal("awarded"),
);
export const applicationStatus = v.union(
  v.literal("submitted"),
  v.literal("shortlisted"),
  v.literal("declined"),
  v.literal("awarded"),
);

/** One eligibility or ranking check on an application, written for buyers to read. */
const evaluationCheck = v.object({
  id: v.string(),
  label: v.string(),
  passed: v.boolean(),
  /** Required checks decide whether the SME qualifies; the others only move the score. */
  required: v.boolean(),
  detail: v.string(),
});

/**
 * How well an application fits its opportunity. Written when the SME applies (or is re-checked), never
 * computed in a query, because checks such as document expiry depend on today's date.
 */
/** How a buyer's evaluation criterion is applied (see convex/lib/procurement.ts). */
export const criterionKind = v.union(
  /** Pass or fail, e.g. "PSIRA registration required". */
  v.literal("gate"),
  /** Scored 0 to 100 with a minimum to proceed, e.g. "Functionality: 60 points minimum to proceed". */
  v.literal("functionality"),
  /** Points from the quoted price, calculated with the 80/20 or 90/10 formula once everyone's quotes are in. */
  v.literal("price"),
  /** Points from the B-BBEE level, from the preferential procurement tables. */
  v.literal("bbbee"),
  /** Anything else, scored 0 to 100 by Jev, e.g. "Growth and job creation potential". */
  v.literal("assessed"),
);

/** Jev's assessment of one evaluation criterion, with the evidence it relied on. */
export const criterionAssessment = v.object({
  criterion: v.string(),
  kind: criterionKind,
  /** Points available (price, B-BBEE) or the minimum to proceed (functionality), when the criterion says. */
  points: v.optional(v.number()),
  /** Gates only. */
  met: v.optional(v.boolean()),
  /** 0 to 100, for functionality and assessed criteria. Price and B-BBEE points are calculated, not judged. */
  score: v.optional(v.number()),
  reasoning: v.string(),
  /** Where the evidence came from, e.g. "Tax compliance status: valid until 2027-01-29". */
  evidence: v.array(v.string()),
});

export const evaluation = v.object({
  /** "rules" is YES Hub's built-in eligibility check (convex/lib/evaluation.ts); "jev" once Jev ranks it. */
  engine: v.union(v.literal("rules"), v.literal("jev")),
  qualifies: v.boolean(),
  /** 0 to 100. Applicants are ranked by qualifying first, then score. */
  score: v.number(),
  summary: v.string(),
  checks: v.array(evaluationCheck),
  evaluatedAt: v.number(),
  /** Jev only: each of the buyer's evaluation criteria. */
  criteria: v.optional(v.array(criterionAssessment)),
  /** Jev only: concerns a reviewer should look at, e.g. a certificate in another company's name. */
  concerns: v.optional(v.array(v.string())),
  /** Jev only: the model OpenRouter's Jev router chose. */
  model: v.optional(v.string()),
});

/** A file an SME attaches to one application: a proposal, pricing schedule or returnable form. */
export const applicationAttachment = v.object({
  storageId: v.id("_storage"),
  /** What it is, e.g. "Pricing schedule". */
  label: v.string(),
  name: v.string(),
  size: v.number(),
  type: v.string(),
});

/** Where Jev's review of one application is up to. */
export const reviewState = v.object({
  status: v.union(v.literal("reviewing"), v.literal("reviewed"), v.literal("failed")),
  workflowId: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  error: v.optional(v.string()),
});

/** Jev's decision on one application, from a decision run on its opportunity. */
export const applicationDecision = v.object({
  runId: v.id("decisionRuns"),
  outcome: v.union(v.literal("approved"), v.literal("not_approved")),
  /** Position in the final ranking, 1 is best. Absent for applicants who weren't eligible. */
  rank: v.optional(v.number()),
  eligible: v.boolean(),
  pricePoints: v.optional(v.number()),
  bbbeePoints: v.optional(v.number()),
  /** Out of 100: price plus B-BBEE points, or the average of assessed criteria. */
  totalPoints: v.optional(v.number()),
  rationale: v.string(),
  decidedAt: v.number(),
  /** Set when someone in the organisation changed Jev's decision. */
  overriddenBy: v.optional(v.string()),
  overrideReason: v.optional(v.string()),
});

/** The published details of an opportunity, as a buyer would put in a tender notice. */
export const opportunityListing = v.object({
  scope: v.string(),
  contractPeriod: v.string(),
  /** Compulsory or optional briefing session, or empty when there's none. */
  briefing: v.string(),
  submission: v.string(),
  evaluationCriteria: v.array(v.string()),
  enquiriesName: v.string(),
  enquiriesEmail: v.string(),
  publishedAt: v.number(),
});

export const activityAction = v.union(
  v.literal("viewed"),
  v.literal("shortlisted"),
  v.literal("unshortlisted"),
  v.literal("declined"),
  v.literal("document_opened"),
);

/** An enterprise's own settings, edited by its owners and admins. */
export const organizationSettingsFields = {
  // Profile shown to SMEs on listings
  about: v.string(),
  industry: v.string(),
  website: v.string(),
  procurementEmail: v.string(),

  // Defaults for new listings
  defaultRequiredDocuments: v.array(v.string()),
  /** 0 means no minimum. */
  defaultMinBbbeeLevel: v.number(),
  defaultEvaluationCriteria: v.array(v.string()),
  defaultSubmission: v.string(),

  // Reviewing applicants
  defaultApplicantFilter: v.union(v.literal("all"), v.literal("qualify")),
  /** Only owners and admins can shortlist when this is on. */
  shortlistAdminsOnly: v.boolean(),

  // Data
  /** Months to keep applicants' data after an opportunity closes. */
  retentionMonths: v.number(),
};
export const organizationSettingsValidator = v.object(organizationSettingsFields);

/** One member's own notification preferences. */
export const memberPreferencesFields = {
  notifyNewApplications: v.boolean(),
  onlyMyDepartments: v.boolean(),
  notifyClosingSoon: v.boolean(),
  closingReminderDays: v.number(),
  notifyColleagueShortlists: v.boolean(),
  weeklySummary: v.boolean(),
};
export const memberPreferencesValidator = v.object(memberPreferencesFields);

export type OrganizationSettings = Infer<typeof organizationSettingsValidator>;
export type MemberPreferences = Infer<typeof memberPreferencesValidator>;
export type OpportunityListing = Infer<typeof opportunityListing>;
export type ActivityAction = Infer<typeof activityAction>;
export type OpportunityKind = Infer<typeof opportunityKind>;
export type OpportunityStatus = Infer<typeof opportunityStatus>;
export type ApplicationStatus = Infer<typeof applicationStatus>;
export type Evaluation = Infer<typeof evaluation>;
export type CriterionKind = Infer<typeof criterionKind>;
export type CriterionAssessment = Infer<typeof criterionAssessment>;
export type ApplicationAttachment = Infer<typeof applicationAttachment>;
export type ApplicationDecision = Infer<typeof applicationDecision>;

/** What one step of a review or decision recorded, for the paper trail. */
export const trailKind = v.union(
  v.literal("submitted"),
  v.literal("extraction"),
  v.literal("assessment"),
  v.literal("decision_started"),
  v.literal("points"),
  v.literal("decision"),
  v.literal("guardrail"),
  v.literal("override"),
  v.literal("error"),
);
export type TrailKind = Infer<typeof trailKind>;

export default defineSchema({
  smes: defineTable({
    ...smeDetails,
    /** Better Auth user id of the account that owns this profile. */
    userId: v.string(),
    consentedAt: v.string(),
    documents: smeDocuments,
    /** Missing until the SME saves settings; read through getSettings(). */
    settings: v.optional(smeSettings),
    isDemo: v.optional(v.boolean()),

    // Moderation by YES Hub staff (set from the admin area)
    /** When staff checked the profile and documents. */
    verifiedAt: v.optional(v.number()),
    verifiedBy: v.optional(v.string()),
    /** Suspended profiles are hidden from matching until reinstated. */
    suspendedAt: v.optional(v.number()),
    suspendedReason: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  /** Tenders, RFQs and grants an enterprise or funder publishes. */
  opportunities: defineTable({
    /** Better Auth organisation that owns it. */
    organizationId: v.string(),
    createdBy: v.string(),
    kind: opportunityKind,
    title: v.string(),
    /** The buyer's own reference, e.g. "CAP-FAC-2026-014". */
    reference: v.string(),
    description: v.string(),
    /** One of INDUSTRIES, or empty when any industry may apply. */
    industry: v.string(),
    /** Services the work needs, matched against SME services. */
    services: v.array(v.string()),
    /** Where the work is. Empty means nationwide. */
    provinces: v.array(v.string()),
    /** Highest acceptable B-BBEE level number (1 is best), or absent when there's no minimum. */
    minBbbeeLevel: v.optional(v.number()),
    /** DocKey values (see smeDocuments) an applicant must hold, valid and not expired. */
    requiredDocuments: v.array(v.string()),
    /** Estimated contract or grant value in rand. */
    value: v.optional(v.number()),
    /** ISO yyyy-mm-dd. */
    closesAt: v.string(),
    status: opportunityStatus,
    /** The published notice. Missing on opportunities created before listings existed. */
    listing: v.optional(opportunityListing),
    /** The department (Better Auth team) that owns it, or absent when it's unassigned. */
    teamId: v.optional(v.string()),
    isDemo: v.optional(v.boolean()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_status", ["status"]),

  /** Settings an enterprise's owners and admins choose for the whole organisation. One row per organisation. */
  organizationSettings: defineTable({
    organizationId: v.string(),
    ...organizationSettingsFields,
    updatedBy: v.string(),
  }).index("by_organization", ["organizationId"]),

  /** A member's own notification preferences. One row per user. */
  memberPreferences: defineTable({
    userId: v.string(),
    ...memberPreferencesFields,
  }).index("by_user", ["userId"]),

  /** Documents released with an opportunity: the RFQ itself, specifications, pricing schedules, forms. */
  opportunityDocuments: defineTable({
    opportunityId: v.id("opportunities"),
    organizationId: v.string(),
    storageId: v.id("_storage"),
    /** What the document is, e.g. "Terms of reference". */
    label: v.string(),
    name: v.string(),
    size: v.number(),
    type: v.string(),
    uploadedBy: v.string(),
  }).index("by_opportunity", ["opportunityId"]),

  /** Who in the organisation did what with an application: viewed it, shortlisted it, opened a document. */
  applicationActivity: defineTable({
    applicationId: v.id("applications"),
    opportunityId: v.id("opportunities"),
    organizationId: v.string(),
    actorId: v.string(),
    actorName: v.string(),
    action: activityAction,
    /** e.g. the document that was opened. */
    detail: v.optional(v.string()),
  })
    .index("by_application", ["applicationId"])
    .index("by_opportunity", ["opportunityId"]),

  /** An SME's application to an opportunity, with how well it fits. */
  applications: defineTable({
    opportunityId: v.id("opportunities"),
    /** Copied from the opportunity so an organisation's applications can be found without a join. */
    organizationId: v.string(),
    smeId: v.id("smes"),
    status: applicationStatus,
    submittedAt: v.number(),
    /** Who in the organisation last shortlisted or declined it, and when. */
    statusChangedAt: v.optional(v.number()),
    statusChangedBy: v.optional(v.string()),
    evaluation,
    /** The SME's quoted price in rand, for criteria that score price. */
    quote: v.optional(v.number()),
    /** The SME's short response to the opportunity: approach, capacity, references. */
    proposal: v.optional(v.string()),
    /** Files sent with this application. Compliance documents come from the SME profile instead. */
    attachments: v.optional(v.array(applicationAttachment)),
    /** Jev's document review and scoring. Absent on applications made before Jev reviewed them. */
    review: v.optional(reviewState),
    /** Jev's decision, once the buyer asks for one. */
    decision: v.optional(applicationDecision),
  })
    .index("by_opportunity", ["opportunityId"])
    .index("by_sme_and_opportunity", ["smeId", "opportunityId"])
    .index("by_organization_and_status", ["organizationId", "status"]),

  /** What Jev read from each document behind an application. */
  documentExtractions: defineTable({
    applicationId: v.id("applications"),
    opportunityId: v.id("opportunities"),
    /** A DocKey for profile documents, or "attachment-<n>" for files sent with the application. */
    key: v.string(),
    source: v.union(v.literal("profile"), v.literal("application")),
    label: v.string(),
    name: v.string(),
    storageId: v.id("_storage"),
    status: v.union(v.literal("read"), v.literal("unreadable")),
    /** What kind of document Jev says it is, and whether that's what it was uploaded as. */
    documentType: v.string(),
    matchesLabel: v.boolean(),
    fields: v.array(v.object({ name: v.string(), value: v.string() })),
    /** Problems, e.g. a different company name or an expired date. */
    issues: v.array(v.string()),
    summary: v.string(),
    /** The start of the text read from the file, kept so a reviewer can see what Jev saw. */
    excerpt: v.string(),
    model: v.optional(v.string()),
  }).index("by_application_and_key", ["applicationId", "key"]),

  /** A buyer's request for Jev to decide who is approved on one opportunity. */
  decisionRuns: defineTable({
    opportunityId: v.id("opportunities"),
    organizationId: v.string(),
    requestedBy: v.string(),
    requestedById: v.string(),
    /** How many applicants the buyer wants approved. */
    slots: v.number(),
    status: v.union(v.literal("running"), v.literal("decided"), v.literal("failed")),
    workflowId: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
    summary: v.optional(v.string()),
    approved: v.optional(v.number()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index("by_opportunity", ["opportunityId"]),

  /**
   * The paper trail: every step Jev took and every decision anyone made, in order. Entries are never
   * edited; a correction is a new entry.
   */
  reviewTrail: defineTable({
    opportunityId: v.id("opportunities"),
    organizationId: v.string(),
    applicationId: v.optional(v.id("applications")),
    runId: v.optional(v.id("decisionRuns")),
    kind: trailKind,
    /** "Jev", "YES Hub" or the person who acted. */
    actor: v.string(),
    summary: v.string(),
    /** Supporting detail: Jev's reasoning, the numbers behind points, the text of an override reason. */
    details: v.optional(v.array(v.string())),
    model: v.optional(v.string()),
    /** OpenRouter's generation id, to look the call up in OpenRouter's logs. */
    generationId: v.optional(v.string()),
    costUsd: v.optional(v.number()),
  })
    .index("by_application", ["applicationId"])
    .index("by_opportunity", ["opportunityId"])
    .index("by_run", ["runId"]),

  /**
   * The command log: one row per mutation that changed data (convex/functions.ts). Each command's changes
   * are in `changes`. Rows are only ever inserted.
   */
  commands: defineTable({
    /** The Convex function, e.g. "smes:update". */
    name: v.string(),
    visibility: v.union(v.literal("public"), v.literal("internal")),
    /** Better Auth user id, absent for internal functions run by the system. */
    actorId: v.optional(v.string()),
    actorName: v.optional(v.string()),
    changeCount: v.number(),
    tables: v.array(v.string()),
  }),

  /** What a command did to one document: the state before and after, and which fields changed. */
  changes: defineTable({
    commandId: v.id("commands"),
    table: v.string(),
    documentId: v.string(),
    operation: v.union(v.literal("insert"), v.literal("update"), v.literal("delete")),
    fields: v.array(v.string()),
    /** The document without system fields. Encrypted fields stay encrypted. */
    before: v.optional(v.any()),
    after: v.optional(v.any()),
  })
    .index("by_command", ["commandId"])
    .index("by_document", ["table", "documentId"]),

  /** Every action YES Hub staff take in the admin area, newest first by _creationTime. */
  auditLog: defineTable({
    actorId: v.string(),
    actorName: v.string(),
    /** e.g. "user.ban", "organization.verify", "sme.suspend". */
    action: v.string(),
    targetType: v.union(v.literal("user"), v.literal("organization"), v.literal("sme"), v.literal("staff")),
    targetId: v.optional(v.string()),
    /** What the target was called at the time, so entries stay readable after deletes. */
    targetLabel: v.optional(v.string()),
    details: v.optional(v.string()),
  }).index("by_target", ["targetType", "targetId"]),
});
