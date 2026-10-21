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
export const opportunityStatus = v.union(v.literal("draft"), v.literal("open"), v.literal("closed"), v.literal("awarded"));
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
export const evaluation = v.object({
  /** "rules" is YES Hub's built-in eligibility check (convex/lib/evaluation.ts); "jev" once Jev ranks it. */
  engine: v.union(v.literal("rules"), v.literal("jev")),
  qualifies: v.boolean(),
  /** 0 to 100. Applicants are ranked by qualifying first, then score. */
  score: v.number(),
  summary: v.string(),
  checks: v.array(evaluationCheck),
  evaluatedAt: v.number(),
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
  }).index("by_organization", ["organizationId"]),

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
  })
    .index("by_opportunity", ["opportunityId"])
    .index("by_sme_and_opportunity", ["smeId", "opportunityId"])
    .index("by_organization_and_status", ["organizationId", "status"]),

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
