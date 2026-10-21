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
